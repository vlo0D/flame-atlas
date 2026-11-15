"""File selection rules. Each decision carries a machine-readable reason.

Reasons: "selected", "extension:<ext>", "folder-excluded:<folder>", "folder-not-included:<folder>",
"too-large:<MB>MB".
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List

from pipeline.sources.base import RemoteFile


def decide(f: RemoteFile, selection_cfg: Dict[str, Any]) -> RemoteFile:
    allowed = {e.lower().lstrip(".") for e in selection_cfg.get("allowedExtensions") or []}
    excluded = {x.lower() for x in selection_cfg.get("excludeFolders") or []}
    included = {x.lower() for x in selection_cfg.get("includeFolders") or []}
    max_mb = selection_cfg.get("maxFileSizeMb")

    folder = (f.folder or "").lower()
    if folder in excluded:
        return _skip(f, f"folder-excluded:{f.folder}")
    if included and folder not in included:
        return _skip(f, f"folder-not-included:{f.folder}")
    if allowed and f.extension not in allowed:
        return _skip(f, f"extension:{f.extension or 'none'}")
    if max_mb is not None and f.size_bytes is not None and f.size_bytes > float(max_mb) * 1024 * 1024:
        return _skip(f, f"too-large:{f.size_bytes / 1024 / 1024:.1f}MB")
    f.selected = True
    f.reason = "selected"
    return f


def _skip(f: RemoteFile, reason: str) -> RemoteFile:
    f.selected = False
    f.reason = reason
    return f


def apply(files: Iterable[RemoteFile], selection_cfg: Dict[str, Any]) -> List[RemoteFile]:
    return [decide(f, selection_cfg) for f in files]
