"""Source interface: anything that can list investigations and their files.

PSI is the only source today. A future source (NTRS, OpenAlex, a local folder) implements
`Source` and the ingest/extract stages work unchanged.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import asdict, dataclass, field
from pathlib import PurePosixPath
from typing import Any, Dict, Iterable, List, Optional


@dataclass
class InvestigationRef:
    id: str
    acronym: Optional[str]
    title: str
    research_area: Optional[str]
    project_type: Optional[str]


@dataclass
class RemoteFile:
    """One file in a source repository, before and after the selection decision."""

    key: str                      # full storage key, e.g. psi-data/PSI-25/Science Documents/x.docx
    file_name: str                # basename used by the download endpoint
    folder: str                   # top-level folder ("Science Documents", "Raw Data" ...)
    subfolder: Optional[str]      # nested path below the top folder, if any
    size_bytes: Optional[int]
    version: Optional[int]
    origin: List[str] = field(default_factory=list)   # which listing(s) reported it
    selected: bool = False
    reason: Optional[str] = None  # why it was skipped (or "selected")
    local_path: Optional[str] = None  # repo-relative path once downloaded
    sha256: Optional[str] = None
    downloaded_bytes: Optional[int] = None  # actual size on disk (PSI listings are sometimes wrong)

    @property
    def extension(self) -> str:
        return PurePosixPath(self.file_name).suffix.lower().lstrip(".")

    def to_json(self) -> Dict[str, Any]:
        d = asdict(self)
        d["extension"] = self.extension
        return {_camel(k): v for k, v in d.items()}


def safe_name(file_name: str) -> str:
    """File name usable on disk: PSI names may contain '/'."""
    return file_name.replace("/", "_")


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(p.capitalize() for p in rest)


class Source(ABC):
    """Read-only access to a repository of investigations."""

    name: str = "source"

    @abstractmethod
    def discover(self) -> List[InvestigationRef]:
        """Investigations that match the configured query and filters."""

    @abstractmethod
    def details(self, investigation_id: str) -> Dict[str, Any]:
        """Full metadata of one investigation, as returned by the source (verbatim)."""

    @abstractmethod
    def list_files(self, investigation_id: str, details: Dict[str, Any]) -> List[RemoteFile]:
        """Every file the source knows for the investigation (no filtering here)."""

    @abstractmethod
    def download_url(self, investigation_id: str, remote: RemoteFile) -> str:
        """A fresh URL to fetch the file bytes (may be short-lived)."""


def dedupe_files(files: Iterable[RemoteFile]) -> List[RemoteFile]:
    """Merge listings by storage key, keeping the richest record and all origins."""
    merged: Dict[str, RemoteFile] = {}
    for f in files:
        cur = merged.get(f.key)
        if cur is None:
            merged[f.key] = f
            continue
        for o in f.origin:
            if o not in cur.origin:
                cur.origin.append(o)
        cur.size_bytes = cur.size_bytes if cur.size_bytes is not None else f.size_bytes
        versions = [v for v in (cur.version, f.version) if v is not None]
        cur.version = max(versions) if versions else None
        cur.subfolder = cur.subfolder or f.subfolder
    return sorted(merged.values(), key=lambda f: (f.folder, f.key))
