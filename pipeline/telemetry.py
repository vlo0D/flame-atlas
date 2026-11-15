"""Per-test conditions measured by an experiment's own sensors.

Some PSI tables leave out the ambient pressure or oxygen of a test, while the sensor
telemetry of the same test records it once a second or faster. Those files sit in the
`Raw Data` folder, which the pipeline otherwise skips because of its videos and archives.

This step downloads only the telemetry files named in pipeline/config/telemetry.json,
reduces each to one line per test (median, minimum, maximum and number of readings of
each chosen sensor) and writes data/derived/<id>_telemetry.csv. That small file is
committed; a mapping then reads it through `join` like any other second file.

    python -m pipeline.telemetry            # download what is missing, rebuild the summaries
    python -m pipeline.telemetry --offline  # rebuild from files already in data/raw
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "pipeline" / "config" / "telemetry.json"
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data" / "derived"
PSI = "https://psi.nasa.gov"
TELEMETRY_FOLDER = "Raw Data"


def listed_files(investigation_id: str, pattern: str) -> List[Dict[str, Any]]:
    """Files of the investigation's PSI listing whose name matches the pattern, in name order."""
    listing = json.loads((RAW_DIR / investigation_id / "files.json").read_text(encoding="utf-8"))
    rx = re.compile(pattern)
    return sorted((f for f in listing["files"] if rx.search(f["fileName"])), key=lambda f: f["fileName"])


def local_path(investigation_id: str, file_name: str) -> Path:
    return RAW_DIR / investigation_id / TELEMETRY_FOLDER / file_name


def download(investigation_id: str, remote: Dict[str, Any]) -> Path:
    import requests  # imported here so the offline rebuild runs without it

    dest = local_path(investigation_id, remote["fileName"])
    if dest.exists() and dest.stat().st_size == remote.get("sizeBytes"):
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    link = requests.get(
        f"{PSI}/geode-py/ws/studies/{investigation_id}/download"
        f"?file={quote(remote['fileName'], safe='')}&version={remote.get('version') or 1}&redirect=false",
        timeout=60,
    ).text.strip().strip('"')
    if not link.startswith("http"):
        raise RuntimeError(f"no download link for {remote['fileName']}: {link[:120]}")
    part = dest.with_suffix(dest.suffix + ".part")
    with requests.get(link, stream=True, timeout=600) as response:
        response.raise_for_status()
        with part.open("wb") as out:
            for chunk in response.iter_content(1 << 20):
                out.write(chunk)
    part.replace(dest)
    return dest


def read_rows(path: Path, sheet: Optional[str]) -> Iterator[Sequence[Any]]:
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8", errors="replace") as handle:
            yield from csv.reader(handle)
        return
    from openpyxl import load_workbook

    book = load_workbook(path, read_only=True, data_only=True)
    try:
        yield from book[sheet].iter_rows(values_only=True)
    finally:
        book.close()


def number(value: Any) -> Optional[float]:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).strip())
    except ValueError:
        return None


def summarise(values: List[float]) -> Dict[str, str]:
    if not values:
        return {"median": "", "min": "", "max": "", "readings": "0"}
    return {
        "median": f"{statistics.median(values):.4g}",
        "min": f"{min(values):.4g}",
        "max": f"{max(values):.4g}",
        "readings": str(len(values)),
    }


def reduce_file(path: Path, source: Dict[str, Any]) -> Dict[str, Dict[str, List[float]]]:
    """{test key: {output name: readings}} for one telemetry file.

    `keyColumn` splits a file that holds several tests by the cell of that column (rows whose
    cell is in `skipKeys` are idle time between tests); without it the whole file is one test
    whose key comes from the file name. `valid` drops readings outside [min, max]: a sensor
    that is off or not yet sampled reports a filler value.
    """
    rows = read_rows(path, source.get("sheet"))
    header: List[str] = []
    for index, row in enumerate(rows, start=1):
        if index == source.get("headerRow", 1):
            header = ["" if c is None else str(c).strip() for c in row]
            break
    columns = source["columns"]
    for spec in columns.values():
        if spec["column"] not in header:
            raise KeyError(f"{path.name}: column {spec['column']!r} not in {header[:60]}")
    at = {name: header.index(spec["column"]) for name, spec in columns.items()}
    key_at = header.index(source["keyColumn"]) if source.get("keyColumn") else None
    skip_keys = set(source.get("skipKeys") or [])
    out: Dict[str, Dict[str, List[float]]] = {}
    for row in rows:
        if key_at is None:
            key = ""
        else:
            if key_at >= len(row):
                continue
            key = str(row[key_at]).strip()
            if not key or key in skip_keys:
                continue
        bucket = out.setdefault(key, {name: [] for name in columns})
        for name, spec in columns.items():
            value = number(row[at[name]]) if at[name] < len(row) else None
            if value is None:
                continue
            valid = spec.get("valid")
            if valid and not (valid[0] <= value <= valid[1]):
                continue
            bucket[name].append(value)
    return out


def build_source(source: Dict[str, Any], offline: bool) -> Tuple[List[str], List[Dict[str, str]]]:
    investigation_id = source["investigationId"]
    columns = source["columns"]
    fields = ["test", "file"]
    for name in columns:
        fields += [f"{name} {stat}" for stat in ("median", "min", "max", "readings")]
    merged: Dict[str, Dict[str, Any]] = {}
    for remote in listed_files(investigation_id, source["files"]):
        path = local_path(investigation_id, remote["fileName"])
        if not offline:
            path = download(investigation_id, remote)
        if not path.exists():
            raise FileNotFoundError(f"telemetry file not downloaded: {path}")
        file_key = None
        if source.get("keyFromFile"):
            file_key = source["keyFromFile"].format(*re.search(source["files"], remote["fileName"]).groups())
        for key, readings in reduce_file(path, source).items():
            test = file_key if file_key is not None else source.get("keyFormat", "{0}").format(key)
            entry = merged.setdefault(test, {"files": [], "readings": {name: [] for name in columns}})
            entry["files"].append(remote["fileName"])
            for name, values in readings.items():
                entry["readings"][name].extend(values)
    records = []
    for test in sorted(merged, key=lambda t: [int(x) if x.isdigit() else x for x in re.split(r"(\d+)", t)]):
        entry = merged[test]
        record = {"test": test, "file": "; ".join(entry["files"])}
        for name in columns:
            for stat, text in summarise(entry["readings"][name]).items():
                record[f"{name} {stat}"] = text
        records.append(record)
    return fields, records


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--offline", action="store_true", help="do not download, use files already in data/raw")
    parser.add_argument("--only", help="investigation id, for example PSI-99")
    args = parser.parse_args(list(argv) if argv is not None else None)
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for source in config["sources"]:
        if args.only and source["investigationId"] != args.only:
            continue
        fields, records = build_source(source, args.offline)
        out = OUT_DIR / source["output"]
        with out.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            writer.writerows(records)
        print(f"{source['investigationId']}: {len(records)} tests -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
