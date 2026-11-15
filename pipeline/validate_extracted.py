"""Validate data/extracted against pipeline/schema with the contract's own validator.

    python3 -m pipeline.validate_extracted                 # data/extracted
    python3 -m pipeline.validate_extracted path/to/folder

Reuses `check()` from contracts/validate.py so both formats follow the same rules.
"""
from __future__ import annotations

import importlib.util
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

from pipeline.settings import REPO_ROOT, load_settings

SCHEMA_DIR = Path(__file__).resolve().parent / "schema"
MAX_ERRORS_SHOWN = 40


def _contract_check():
    spec = importlib.util.spec_from_file_location("contract_validate", REPO_ROOT / "contracts" / "validate.py")
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module.check


def _schema(name: str) -> Dict[str, Any]:
    return json.loads((SCHEMA_DIR / name).read_text(encoding="utf-8"))


def block_rules(doc: Dict[str, Any], where: str, errors: List[str]) -> None:
    """Rules the schema subset cannot express (no oneOf): per-type required fields."""
    for b in doc.get("blocks") or []:
        bw = f"{where}.blocks[{b.get('id')}]"
        if b.get("type") == "text":
            for k in ("kind", "text"):
                if k not in b:
                    errors.append(f"{bw}: text block needs '{k}'")
        elif b.get("type") == "table":
            for k in ("name", "columns", "rows", "rowCount", "confidence"):
                if k not in b:
                    errors.append(f"{bw}: table block needs '{k}'")
            cols = b.get("columns") or []
            if len(set(cols)) != len(cols):
                errors.append(f"{bw}: duplicate column names")
            if b.get("rowCount") != len(b.get("rows") or []):
                errors.append(f"{bw}: rowCount does not match rows")
            for r in b.get("rows") or []:
                if list((r.get("raw") or {}).keys()) != cols:
                    errors.append(f"{bw}: row {r.get('sourceRow')} keys differ from columns")
                    break


def validate_document(doc: Any, where: str, check=None) -> List[str]:
    check = check or _contract_check()
    errors: List[str] = []
    schema = _schema("extracted-document.schema.json")
    check(doc, schema, schema, where, errors)
    if isinstance(doc, dict):
        block_rules(doc, where, errors)
    return errors


def validate_folder(folder: Path) -> List[str]:
    check = _contract_check()
    errors: List[str] = []
    index_path = folder / "index.json"
    if not index_path.exists():
        return [f"{index_path}: missing"]
    index = json.loads(index_path.read_text(encoding="utf-8"))
    schema = _schema("extracted-index.schema.json")
    check(index, schema, schema, "index.json", errors)

    n = 0
    for inv in index.get("investigations") or []:
        for d in inv.get("documents") or []:
            path = REPO_ROOT / d["path"]
            if not path.exists():
                errors.append(f"index.json: {d['path']} is listed but missing")
                continue
            doc = json.loads(path.read_text(encoding="utf-8"))
            errors.extend(validate_document(doc, d["path"], check))
            if doc.get("investigationId") != inv.get("id"):
                errors.append(f"{d['path']}: investigationId differs from index entry {inv.get('id')}")
            n += 1
    print(f"  checked index.json and {n} document(s)")
    return errors


def main(argv: List[str] = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    folder = Path(argv[0]) if argv else load_settings().extracted_dir
    errors = validate_folder(folder)
    if errors:
        print(f"\nFAILED: {len(errors)} problem(s) in {folder}")
        for line in errors[:MAX_ERRORS_SHOWN]:
            print("  - " + line)
        if len(errors) > MAX_ERRORS_SHOWN:
            print(f"  ... and {len(errors) - MAX_ERRORS_SHOWN} more")
        return 1
    print(f"\nOK: {folder} matches pipeline/schema")
    return 0


if __name__ == "__main__":
    sys.exit(main())
