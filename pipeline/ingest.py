"""Stage 1: discover investigations, save metadata, list files, download selected ones.

    python3 -m pipeline.ingest                       # all Combustion Science investigations
    python3 -m pipeline.ingest --ids PSI-25 PSI-99   # only these
    python3 -m pipeline.ingest --dry-run             # list decisions, download nothing
    python3 -m pipeline.ingest --ext pdf docx csv xlsx --max-size-mb 20

Output per investigation in data/raw/<id>/: metadata.json (verbatim API response),
files.json (every file with its selection decision) and the selected files themselves.
A re-run downloads nothing that is already on disk with the expected size.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from pipeline import log, selection
from pipeline.download import Http, sha256_file
from pipeline.settings import REPO_ROOT, Settings, load_settings
from pipeline.sources.base import RemoteFile, Source, safe_name
from pipeline.sources.psi import PsiSource

_log = log.get("pipeline.ingest")

SOURCES = {"psi": PsiSource}


def build_source(settings: Settings, http: Http) -> Source:
    cls = SOURCES[settings.source.get("name", "psi")]
    return cls(settings.source, settings.discovery, http)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".part")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def local_path_for(raw_dir: Path, investigation_id: str, f: RemoteFile) -> Path:
    parts = [investigation_id, f.folder or "_root"]
    if f.subfolder:
        parts.extend(p for p in f.subfolder.split("/") if p)
    return raw_dir.joinpath(*parts, safe_name(f.file_name))


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def is_cached(dest: Path, f: RemoteFile, previous: Optional[Dict[str, Any]] = None) -> bool:
    """On disk with the listed size, or with the size recorded by the last download of the same listing."""
    if not dest.exists():
        return False
    size = dest.stat().st_size
    if f.size_bytes is None or size == f.size_bytes:
        return True
    prev = (previous or {}).get(f.key) or {}
    return prev.get("sizeBytes") == f.size_bytes and prev.get("downloadedBytes") == size


def previous_listing(inv_dir: Path) -> Dict[str, Any]:
    path = inv_dir / "files.json"
    if not path.exists():
        return {}
    try:
        return {x["key"]: x for x in json.loads(path.read_text(encoding="utf-8")).get("files", [])}
    except (OSError, ValueError, KeyError):
        return {}


def ingest_one(source: Source, http: Http, settings: Settings, inv_id: str, *, dry_run: bool, force: bool,
               download: bool) -> Dict[str, Any]:
    inv_dir = settings.raw_dir / inv_id
    previous = previous_listing(inv_dir)
    details = source.details(inv_id)
    if not dry_run:
        write_json(inv_dir / "metadata.json", details)

    files = selection.apply(source.list_files(inv_id, details), settings.selection)
    listings = sorted({o for f in files for o in f.origin})
    if "tree" not in listings:
        _log.warning("%s: full file tree unavailable; listing from metadata only (%s) may be incomplete",
                     inv_id, ", ".join(listings) or "nothing")
    stats = {"listed": len(files), "selected": 0, "downloaded": 0, "cached": 0, "failed": 0}
    for f in files:
        if not f.selected:
            continue
        stats["selected"] += 1
        dest = local_path_for(settings.raw_dir, inv_id, f)
        f.local_path = rel(dest)
        if dry_run or not download:
            continue
        if is_cached(dest, f, previous) and not force:
            stats["cached"] += 1
            f.sha256 = sha256_file(dest)
            f.downloaded_bytes = dest.stat().st_size
            continue
        try:
            url = source.download_url(inv_id, f)  # fresh short-lived link right before the download
            f.sha256 = http.download(url, dest)
            f.downloaded_bytes = dest.stat().st_size
            if f.size_bytes is not None and dest.stat().st_size != f.size_bytes:
                _log.warning("%s: size %d differs from listing %d", f.file_name, dest.stat().st_size, f.size_bytes)
            stats["downloaded"] += 1
            _log.info("%s: downloaded %s", inv_id, f.local_path)
        except Exception as exc:
            stats["failed"] += 1
            f.reason = f"download-failed:{type(exc).__name__}"
            f.local_path = None
            _log.error("%s: %s failed: %s", inv_id, f.file_name, exc)

    if not dry_run:
        write_json(inv_dir / "files.json", {
            "investigationId": inv_id,
            "source": source.name,
            "listedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "listings": listings,
            "listingComplete": "tree" in listings,
            "selection": settings.selection,
            "stats": stats,
            "files": [f.to_json() for f in files],
        })
    return {"id": inv_id, "stats": stats, "files": files}


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", type=Path, help="alternative config JSON")
    p.add_argument("--ids", nargs="+", help="only these investigation ids (skips search filters)")
    p.add_argument("--query", help="search term (default from config)")
    p.add_argument("--research-area", nargs="+", dest="areas", help="keep only these research areas")
    p.add_argument("--ext", nargs="+", help="allowed file extensions")
    p.add_argument("--max-size-mb", type=float, help="skip files larger than this")
    p.add_argument("--raw-dir", help="output folder (default data/raw)")
    p.add_argument("--dry-run", action="store_true", help="list decisions, write and download nothing")
    p.add_argument("--no-download", action="store_true", help="save metadata and files.json only")
    p.add_argument("--force", action="store_true", help="re-download files already on disk")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    log.setup(args.verbose)
    settings = load_settings(args.config, {
        "discovery.query": args.query,
        "discovery.researchAreas": args.areas,
        "selection.allowedExtensions": args.ext,
        "selection.maxFileSizeMb": args.max_size_mb,
        "paths.raw": args.raw_dir,
    })
    http = Http(settings.http)
    source = build_source(settings, http)

    ids = args.ids or [r.id for r in source.discover()]
    _log.info("%d investigation(s): %s", len(ids), ", ".join(ids))

    totals = {"listed": 0, "selected": 0, "downloaded": 0, "cached": 0, "failed": 0}
    for inv_id in ids:
        try:
            result = ingest_one(source, http, settings, inv_id, dry_run=args.dry_run, force=args.force,
                                download=not args.no_download)
        except Exception as exc:
            _log.error("%s: ingest failed: %s", inv_id, exc)
            totals["failed"] += 1
            continue
        for k, v in result["stats"].items():
            totals[k] += v
        s = result["stats"]
        _log.info("%s: %d files listed, %d selected, %d downloaded, %d cached, %d failed",
                  inv_id, s["listed"], s["selected"], s["downloaded"], s["cached"], s["failed"])
        if args.dry_run:
            for f in result["files"]:
                if f.selected:
                    print(f"  {inv_id}  {f.size_bytes or 0:>11,}  {f.folder}/{f.file_name}")

    _log.info("total: %s", totals)
    return 1 if totals["failed"] else 0


if __name__ == "__main__":
    sys.exit(main())
