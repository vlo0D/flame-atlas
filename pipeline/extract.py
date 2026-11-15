"""Stage 2: turn every downloaded document into JSON (text + tables), then write index.json.

    python3 -m pipeline.extract                      # everything in data/raw
    python3 -m pipeline.extract --ids PSI-25         # one investigation
    python3 -m pipeline.extract --formats csv xlsx   # only these formats
    python3 -m pipeline.extract --force              # re-extract even if up to date

Reads data/raw/<id>/metadata.json and files.json written by `pipeline.ingest`.
Writes data/extracted/<id>/<file name>.json (one per document) and data/extracted/index.json.
A document is skipped when its JSON exists with the same sha256 and extractor version.
A failing document still gets a JSON with status "failed"; the run continues.
"""
from __future__ import annotations

import argparse
import json
import sys
import traceback
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from pipeline import extractors, investigation, log
from pipeline.download import sha256_file
from pipeline.extractors.base import SCHEMA_VERSION, ExtractionResult, TableBlock, blocks_to_json, stats
from pipeline.ingest import rel, write_json
from pipeline.settings import REPO_ROOT, Settings, load_settings
from pipeline.sources.base import safe_name
from pipeline.validate_extracted import validate_folder

_log = log.get("pipeline.extract")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def up_to_date(out_path: Path, sha: str, extractor_version: str) -> bool:
    if not out_path.exists():
        return False
    try:
        old = json.loads(out_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return (old.get("source", {}).get("sha256") == sha
            and old.get("extractor", {}).get("version") == extractor_version
            and old.get("schemaVersion") == SCHEMA_VERSION
            and old.get("status") != "failed")


def extract_file(settings: Settings, inv_id: str, f: Dict[str, Any], *, force: bool) -> Optional[Dict[str, Any]]:
    src = REPO_ROOT / f["localPath"]
    if not src.exists():
        _log.warning("%s: %s listed but not on disk (run pipeline.ingest)", inv_id, f["localPath"])
        return None
    ext = f.get("extension") or src.suffix.lower().lstrip(".")
    extractor = extractors.for_extension(ext, settings.extraction)
    if extractor is None:
        _log.info("%s: no extractor for .%s (%s)", inv_id, ext, f["fileName"])
        return None

    out_path = settings.extracted_dir / inv_id / (safe_name(f["fileName"]) + ".json")
    sha = f.get("sha256") or sha256_file(src)
    if not force and up_to_date(out_path, sha, extractor.version):
        return json.loads(out_path.read_text(encoding="utf-8"))

    error = None
    try:
        result = extractor.extract(src)
    except Exception as exc:
        _log.error("%s: %s failed: %s", inv_id, f["fileName"], exc)
        _log.debug(traceback.format_exc())
        result = ExtractionResult(status="failed")
        error = f"{type(exc).__name__}: {exc}"
    if result.status == "ok" and any(isinstance(b, TableBlock) and b.truncated for b in result.blocks):
        result.status = "partial"  # row limits from the config cut a table short

    doc = {
        "schemaVersion": SCHEMA_VERSION,
        "investigationId": inv_id,
        "format": ext,
        "source": {
            "fileName": f["fileName"],
            "folder": f.get("folder") or "",
            "subfolder": f.get("subfolder"),
            "key": f["key"],
            "version": f.get("version"),
            "sizeBytes": src.stat().st_size,
            "sha256": sha,
            "localPath": rel(src),
            "investigationUrl": settings.investigation_url(inv_id),
        },
        "extractor": {"name": extractor.name, "version": extractor.version},
        "extractedAt": now(),
        "status": result.status,
        "error": error,
        "warnings": result.warnings,
        "stats": stats(result),
        "blocks": blocks_to_json(result.blocks),
    }
    write_json(out_path, doc)
    s = doc["stats"]
    _log.info("%s: %-6s %s → %d text, %d tables (%d rows)%s", inv_id, doc["status"], f["fileName"],
              s["textBlocks"], s["tables"], s["tableRows"],
              f", {len(result.warnings)} warning(s)" if result.warnings else "")
    return doc


def extract_investigation(settings: Settings, inv_id: str, formats: Optional[List[str]], *, force: bool) -> Optional[Dict[str, Any]]:
    inv_dir = settings.raw_dir / inv_id
    meta_path, files_path = inv_dir / "metadata.json", inv_dir / "files.json"
    if not meta_path.exists() or not files_path.exists():
        _log.warning("%s: metadata.json or files.json missing; run pipeline.ingest first", inv_id)
        return None
    details = json.loads(meta_path.read_text(encoding="utf-8"))
    listing = json.loads(files_path.read_text(encoding="utf-8"))

    record = investigation.to_record(details, settings.investigation_url(inv_id))
    files = listing.get("files") or []
    record["files"] = {
        "listed": len(files),
        "selected": sum(1 for f in files if f.get("selected")),
        "skippedByReason": dict(Counter((f.get("reason") or "").split(":")[0] for f in files if not f.get("selected"))),
    }
    docs = []
    for f in files:
        if not f.get("selected") or not f.get("localPath"):
            continue
        if formats and (f.get("extension") or "") not in formats:
            continue
        doc = extract_file(settings, inv_id, f, force=force)
        if doc is None:
            continue
        docs.append({
            "fileName": f["fileName"],
            "folder": f.get("folder") or "",
            "format": doc["format"],
            "path": rel(settings.extracted_dir / inv_id / (safe_name(f["fileName"]) + ".json")),
            "status": doc["status"],
            "textBlocks": doc["stats"]["textBlocks"],
            "tables": doc["stats"]["tables"],
            "tableRows": doc["stats"]["tableRows"],
            "warnings": len(doc["warnings"]),
        })
    record["documents"] = docs
    return record


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", type=Path)
    p.add_argument("--ids", nargs="+", help="only these investigations (default: every folder in data/raw)")
    p.add_argument("--formats", nargs="+", help="only these extensions")
    p.add_argument("--no-pdf-tables", action="store_true", help="text only for PDFs (faster)")
    p.add_argument("--force", action="store_true")
    p.add_argument("--no-validate", action="store_true")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    log.setup(args.verbose)
    settings = load_settings(args.config, {"extraction.pdfTables": False if args.no_pdf_tables else None})
    formats = [x.lower().lstrip(".") for x in args.formats] if args.formats else None

    ids = args.ids or sorted((p.name for p in settings.raw_dir.glob("PSI-*") if p.is_dir()),
                             key=lambda s: int(s.split("-")[1]))
    records = []
    for inv_id in ids:
        rec = extract_investigation(settings, inv_id, formats, force=args.force)
        if rec is not None:
            records.append(rec)

    # Partial runs (--ids) update their entries and keep the others from the previous index.
    index_path = settings.extracted_dir / "index.json"
    if args.ids and index_path.exists():
        old = json.loads(index_path.read_text(encoding="utf-8"))
        kept = {r["id"]: r for r in old.get("investigations", [])}
        kept.update({r["id"]: r for r in records})
        records = sorted(kept.values(), key=lambda r: int(r["id"].split("-")[1]))

    all_docs = [d for r in records for d in r["documents"]]
    index = {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": now(),
        "source": {"name": "NASA Physical Sciences Informatics (PSI)",
                   "url": settings.source["baseUrl"], "license": settings.source.get("license", "")},
        "counts": {
            "investigations": len(records),
            "documents": len(all_docs),
            "documentsFailed": sum(1 for d in all_docs if d["status"] == "failed"),
            "tables": sum(d["tables"] for d in all_docs),
            "tableRows": sum(d["tableRows"] for d in all_docs),
        },
        "investigations": records,
    }
    write_json(index_path, index)
    _log.info("index: %s", index["counts"])

    if args.no_validate:
        return 0
    errors = validate_folder(settings.extracted_dir)
    if errors:
        for e in errors[:40]:
            _log.error(e)
        _log.error("validation FAILED: %d problem(s)", len(errors))
        return 1
    _log.info("validation OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
