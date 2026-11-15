"""Pipeline settings: one JSON config, overridable from the command line.

All tunables live in `pipeline/config/ingest.json`. Code never hard-codes a query,
a file type or a folder name; to change behaviour, edit the config or pass a CLI flag.
"""
from __future__ import annotations

import copy
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG = Path(__file__).resolve().parent / "config" / "ingest.json"


@dataclass
class Settings:
    raw: Dict[str, Any]
    config_path: Path = field(default=DEFAULT_CONFIG)

    # --- convenience accessors -------------------------------------------------
    @property
    def source(self) -> Dict[str, Any]:
        return self.raw["source"]

    @property
    def discovery(self) -> Dict[str, Any]:
        return self.raw["discovery"]

    @property
    def selection(self) -> Dict[str, Any]:
        return self.raw["selection"]

    @property
    def http(self) -> Dict[str, Any]:
        return self.raw["http"]

    @property
    def extraction(self) -> Dict[str, Any]:
        return self.raw["extraction"]

    @property
    def raw_dir(self) -> Path:
        return _resolve(self.raw["paths"]["raw"])

    @property
    def extracted_dir(self) -> Path:
        return _resolve(self.raw["paths"]["extracted"])

    def investigation_url(self, investigation_id: str) -> str:
        return self.source["investigationPageUrl"].format(id=investigation_id)

    @property
    def allowed_extensions(self) -> List[str]:
        return [e.lower().lstrip(".") for e in self.selection["allowedExtensions"]]


def _resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else REPO_ROOT / p


def load_settings(path: Optional[Path] = None, overrides: Optional[Dict[str, Any]] = None) -> Settings:
    """Load the JSON config and apply dotted-key overrides, e.g. {"selection.maxFileSizeMb": 10}."""
    config_path = Path(path) if path else DEFAULT_CONFIG
    data = json.loads(config_path.read_text(encoding="utf-8"))
    data = copy.deepcopy(data)
    for dotted, value in (overrides or {}).items():
        if value is None:
            continue
        node = data
        *parents, leaf = dotted.split(".")
        for key in parents:
            node = node.setdefault(key, {})
        node[leaf] = value
    return Settings(raw=data, config_path=config_path)
