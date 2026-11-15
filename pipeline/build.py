"""Build the four contract files in data/processed from data/raw and validate them.

    python3 -m pipeline.build                       # data/raw → data/processed, then contracts/validate.py
    python3 -m pipeline.build --out /tmp/processed  # another output folder

Inputs:  data/raw/<id>/metadata.json, data/raw/<id>/Experimental table/*.csv (from pipeline.ingest),
         pipeline/mappings/*.json (one per experimental table), pipeline/config/contract.json,
         pipeline/config/scenarios.json.
Outputs: tests.json, investigations.json, scenarios.json, meta.json — exactly the contract in contracts/.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from pipeline import cards, log
from pipeline.extractors.csv_extractor import CsvExtractor
from pipeline.ingest import write_json
from pipeline.normalize.engine import normalize_table
from pipeline.normalize.join import load_join
from pipeline.settings import REPO_ROOT, load_settings

_log = log.get("pipeline.build")
CONFIG_DIR = Path(__file__).resolve().parent / "config"
MAPPINGS_DIR = Path(__file__).resolve().parent / "mappings"


def contract_version() -> str:
    text = (REPO_ROOT / "contracts" / "types.ts").read_text(encoding="utf-8")
    m = re.search(r"CONTRACT_VERSION\s*=\s*'([^']+)'", text)
    if not m:
        raise RuntimeError("CONTRACT_VERSION not found in contracts/types.ts")
    return m.group(1)


def inv_sort_key(inv_id: str) -> int:
    return int(inv_id.split("-")[1])


def load_mappings(folder: Path) -> List[Dict[str, Any]]:
    out = []
    for p in sorted(folder.glob("*.json")):
        m = json.loads(p.read_text(encoding="utf-8"))
        m["_path"] = p.name
        out.append(m)
    return out


def build_tests(raw_dir: Path, mappings: List[Dict[str, Any]], options: Dict[str, Any]):
    tests: List[Dict[str, Any]] = []
    tables: List[Dict[str, Any]] = []
    reports = []
    for m in mappings:
        csv_path = raw_dir / m["investigationId"] / "Experimental table" / m["tableFile"]
        if not csv_path.exists():
            _log.warning("%s: table %s not downloaded; skipped", m["_path"], m["tableFile"])
            continue
        result = CsvExtractor(options).extract(csv_path)
        if not result.blocks:
            _log.warning("%s: no table in %s", m["_path"], m["tableFile"])
            continue
        joined = load_join(raw_dir, m["investigationId"], m["join"]) if m.get("join") else None
        records, report = normalize_table(m, result.blocks[0].rows, joined)
        tests.extend(records)
        reports.append(report)
        tables.append({"tableFile": m["tableFile"], "investigationId": m["investigationId"], "rows": len(records),
                       "granularity": m["granularity"], "mappingVersion": m["mappingVersion"]})
        extra = []
        if report.skipped:
            extra.append("skipped " + ", ".join(f"{n} {r}" for r, n in report.skipped.items()))
        if report.merged:
            extra.append(f"merged {report.merged} continuation rows")
        _log.info("%-22s %4d rows → %4d records%s", m["tableId"], report.rowsIn, report.records,
                  f" ({'; '.join(extra)})" if extra else "")
    tests.sort(key=lambda t: (inv_sort_key(t["investigationId"]), t["tableFile"], t["sourceRow"]))
    tables.sort(key=lambda t: (inv_sort_key(t["investigationId"]), t["tableFile"]))
    return tests, tables, reports


def unmapped_tables(raw_dir: Path, mappings: List[Dict[str, Any]]) -> List[str]:
    mapped = {m["tableFile"] for m in mappings}
    found = sorted(p.name for p in raw_dir.glob("PSI-*/Experimental table/*.csv"))
    return [f for f in found if f not in mapped]


def build_investigations(raw_dir: Path, tests: List[Dict[str, Any]], cfg: Dict[str, Any], settings) -> List[Dict[str, Any]]:
    by_inv: Dict[str, List[Dict[str, Any]]] = {}
    for t in tests:
        by_inv.setdefault(t["investigationId"], []).append(t)
    out, dropped = [], 0
    for meta_path in sorted(raw_dir.glob("PSI-*/metadata.json"), key=lambda p: inv_sort_key(p.parent.name)):
        details = json.loads(meta_path.read_text(encoding="utf-8"))
        inv_id = details.get("accession") or meta_path.parent.name
        card, d = cards.build_card(details, settings.investigation_url(inv_id), by_inv.get(inv_id, []),
                                   cfg["investigations"], cfg["investigationsSource"],
                                   {k: v for k, v in (cfg.get("fuelAnalogOf") or {}).items() if not k.startswith("_")})
        dropped += d
        out.append(card)
    missing = sorted(set(by_inv) - {c["id"] for c in out}, key=inv_sort_key)
    if missing:
        raise RuntimeError(f"tests reference investigations without metadata: {missing}")
    _log.info("%d investigation cards; %d candidate claims dropped by the quote check", len(out), dropped)
    return out


def build_meta(tests, tables, investigations, reports, cfg, unmapped: List[str]) -> Dict[str, Any]:
    notes = list(cfg.get("dataNotes") or [])
    skipped = sum(sum(r.skipped.values()) for r in reports)
    merged = sum(r.merged for r in reports)
    if skipped or merged:
        notes.append(f"{skipped} source rows were skipped as non-test rows (footnotes, video references, a soot "
                     f"cleaning run) and {merged} continuation rows were merged into the row above; see "
                     "pipeline/mappings for the rules.")
    if unmapped:
        notes.append(f"{len(unmapped)} experimental table(s) have no mapping yet: {', '.join(unmapped)}.")
    return {
        "contractVersion": contract_version(),
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": cfg["source"],
        "counts": {"investigations": len(investigations), "rows": len(tests), "tables": len(tables)},
        "tables": tables,
        "quality": cfg["quality"],
        "dataNotes": notes,
    }


def validate(out_dir: Path) -> int:
    proc = subprocess.run([sys.executable, str(REPO_ROOT / "contracts" / "validate.py"), str(out_dir)],
                          capture_output=True, text=True)
    for line in (proc.stdout + proc.stderr).strip().splitlines():
        (_log.info if proc.returncode == 0 else _log.error)("validate: %s", line)
    return proc.returncode


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--config", type=Path, help="alternative ingest config JSON (for paths)")
    p.add_argument("--out", type=Path, help="output folder (default data/processed)")
    p.add_argument("--mappings", type=Path, default=MAPPINGS_DIR)
    p.add_argument("--no-validate", action="store_true")
    p.add_argument("-v", "--verbose", action="store_true")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    log.setup(args.verbose)
    settings = load_settings(args.config)
    raw_dir = settings.raw_dir
    out_dir = args.out or (REPO_ROOT / "data" / "processed")
    cfg = json.loads((CONFIG_DIR / "contract.json").read_text(encoding="utf-8"))
    scenarios = json.loads((CONFIG_DIR / "scenarios.json").read_text(encoding="utf-8"))

    if not any(raw_dir.glob("PSI-*/metadata.json")):
        _log.error("no investigations in %s; run `python3 -m pipeline` (or pipeline.ingest) first", raw_dir)
        return 2

    mappings = load_mappings(args.mappings)
    tests, tables, reports = build_tests(raw_dir, mappings, settings.extraction)
    unmapped = unmapped_tables(raw_dir, mappings)
    for f in unmapped:
        _log.warning("no mapping for %s: add pipeline/mappings/<name>.json", f)
    investigations = build_investigations(raw_dir, tests, cfg, settings)
    meta = build_meta(tests, tables, investigations, reports, cfg, unmapped)

    out_dir.mkdir(parents=True, exist_ok=True)
    write_json(out_dir / "tests.json", tests)
    write_json(out_dir / "investigations.json", investigations)
    write_json(out_dir / "scenarios.json", scenarios)
    write_json(out_dir / "meta.json", meta)
    _log.info("wrote %s: %d tests, %d investigations, %d scenarios, %d tables",
              out_dir, len(tests), len(investigations), len(scenarios), len(tables))
    if args.no_validate:
        return 0
    return validate(out_dir)


if __name__ == "__main__":
    sys.exit(main())
