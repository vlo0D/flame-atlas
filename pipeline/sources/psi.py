"""NASA Physical Sciences Informatics (psi.nasa.gov) source.

Endpoints (verified 2026-11-14, see specs/001-psi-ingest/plan.md):
  search   GET  /geode-py/ws/repo/search?term=&source=psi&type=investigation&size=
  details  GET  /geode-py/ws/repo/investigations/<id>
  tree     POST /geode-py/ws/files/v2  {"folder","fileType":"study","studyId","version"}
  link     GET  /geode-py/ws/studies/<id>/download?file=&version=&redirect=false  -> URL as text
"""
from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any, Dict, Iterable, List, Optional, Tuple
from urllib.parse import quote

from pipeline import log
from pipeline.download import Http
from pipeline.sources.base import InvestigationRef, RemoteFile, Source, dedupe_files

_log = log.get("pipeline.psi")


class PsiSource(Source):
    name = "psi"

    def __init__(self, source_cfg: Dict[str, Any], discovery_cfg: Dict[str, Any], http: Http):
        self.base = source_cfg["baseUrl"].rstrip("/")
        # The file tree of large investigations (PSI-106: 18k files) can take minutes to build.
        self.tree_timeout = float(source_cfg.get("treeTimeoutSeconds", 600))
        self.discovery_cfg = discovery_cfg
        self.http = http

    # --- discovery -------------------------------------------------------------
    def discover(self) -> List[InvestigationRef]:
        cfg = self.discovery_cfg
        url = f"{self.base}/geode-py/ws/repo/search"
        params = {
            "term": cfg.get("query", ""),
            "source": "psi",
            "type": cfg.get("dataType", "investigation"),
            "size": cfg.get("pageSize", 300),
        }
        data = self.http.get_json(url, params=params)
        hits = data.get("hits", {}).get("hits", [])
        total = data.get("hits", {}).get("total")
        if isinstance(total, dict):
            total = total.get("value")
        if isinstance(total, int) and total > len(hits):
            _log.warning("search returned %d of %d hits; raise discovery.pageSize", len(hits), total)

        areas = {a.lower() for a in cfg.get("researchAreas") or []}
        include = set(cfg.get("includeIds") or [])
        exclude = set(cfg.get("excludeIds") or [])
        refs: List[InvestigationRef] = []
        for hit in hits:
            src = hit.get("_source", {})
            ref = InvestigationRef(
                id=src.get("Accession"),
                acronym=src.get("Acronym") or None,
                title=src.get("Title") or "",
                research_area=src.get("Research Area"),
                project_type=src.get("Project Type"),
            )
            if not ref.id or ref.id in exclude:
                continue
            if include and ref.id not in include:
                continue
            if areas and (ref.research_area or "").lower() not in areas:
                _log.info("skip %s (%s): research area %r", ref.id, ref.acronym, ref.research_area)
                continue
            refs.append(ref)
        refs.sort(key=lambda r: int(r.id.split("-")[1]) if r.id.split("-")[-1].isdigit() else 0)
        return refs

    def details(self, investigation_id: str) -> Dict[str, Any]:
        return self.http.get_json(f"{self.base}/geode-py/ws/repo/investigations/{investigation_id}")

    # --- file listing ----------------------------------------------------------
    def list_files(self, investigation_id: str, details: Dict[str, Any]) -> List[RemoteFile]:
        files: List[RemoteFile] = []
        version = details.get("version")
        if version is not None:
            try:
                tree = self.http.post_json(
                    f"{self.base}/geode-py/ws/files/v2",
                    {"folder": f"psi-data/{investigation_id}/", "fileType": "study",
                     "studyId": investigation_id, "version": version},
                    timeout=self.tree_timeout,
                )
                files.extend(parse_tree(tree, investigation_id))
            except Exception as exc:  # the tree is the best listing but not the only one
                _log.warning("%s: file tree request failed (%s); falling back to metadata lists", investigation_id, exc)
        files.extend(parse_metadata_lists(details, investigation_id))
        return dedupe_files(files)

    def download_url(self, investigation_id: str, remote: RemoteFile) -> str:
        url = (f"{self.base}/geode-py/ws/studies/{investigation_id}/download"
               f"?file={quote(remote.file_name, safe='')}&redirect=false")
        if remote.version is not None:
            url += f"&version={remote.version}"
        link = self.http.get_text(url).strip().strip('"')
        if not link.startswith("http"):
            raise RuntimeError(f"unexpected download link response: {link[:200]!r}")
        return link


# --- pure helpers (unit-tested without network) ---------------------------------

def split_key(key: str, investigation_id: str) -> Tuple[str, Optional[str], str]:
    """psi-data/PSI-25/Science Documents/a/b.docx -> ("Science Documents", "a", "b.docx")."""
    parts = PurePosixPath(key).parts
    try:
        start = parts.index(investigation_id) + 1
    except ValueError:
        start = 0
    rest = parts[start:]
    if len(rest) <= 1:
        return "", None, rest[-1] if rest else key
    # PSI file names start with "<id>_"; a "/" after that is part of the name, not a folder
    # (PSI-22: "PSI-22_Engineering Documents_S1101MFS0004_rev_A - ACME/CIR Integrated Pneumatic Schematic.pdf").
    for i in range(1, len(rest)):
        if rest[i].startswith(f"{investigation_id}_"):
            return rest[0], "/".join(rest[1:i]) or None, "/".join(rest[i:])
    sub = "/".join(rest[1:-1]) or None
    return rest[0], sub, rest[-1]


def _int(v: Any) -> Optional[int]:
    try:
        return int(float(v)) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _walk(node: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    for child in node.get("files") or []:
        if child.get("directory") is False:
            yield child
        else:
            yield from _walk(child)


def parse_tree(tree: Dict[str, Any], investigation_id: str) -> List[RemoteFile]:
    out: List[RemoteFile] = []
    for leaf in _walk(tree):
        key = leaf.get("key") or ""
        if not key or leaf.get("visible") is False:
            continue
        folder, sub, name = split_key(key, investigation_id)
        out.append(RemoteFile(
            key=key,
            file_name=name,
            folder=folder or leaf.get("sortingCategory") or "",
            subfolder=leaf.get("subcategory") or sub,
            size_bytes=_int(leaf.get("bytes_size")),
            version=_int(leaf.get("version")),
            origin=["tree"],
        ))
    return out


def parse_metadata_lists(details: Dict[str, Any], investigation_id: str) -> List[RemoteFile]:
    out: List[RemoteFile] = []
    for list_name in ("experimentalTable", "added"):
        for item in details.get(list_name) or []:
            if item.get("visible") is False:
                continue
            key = item.get("s3_path") or (item.get("remote_path") or "").lstrip("/").replace("Home/", "", 1)
            name = item.get("file_name") or PurePosixPath(key).name
            if not key:
                continue
            folder, sub, _ = split_key(key, investigation_id)
            out.append(RemoteFile(
                key=key,
                file_name=name,
                folder=folder,
                subfolder=item.get("subcategory") or sub,
                size_bytes=_int(item.get("file_size")),
                version=_int(item.get("version")),
                origin=[list_name],
            ))
    return out
