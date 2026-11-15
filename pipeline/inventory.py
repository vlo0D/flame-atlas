"""Inventory of every file NASA PSI lists for the Combustion Science investigations.

Downloads no data files: it only reads file listings and metadata.

    python3 -m pipeline.inventory            # uses the on-disk cache in .cache/psi
    python3 -m pipeline.inventory --refresh  # re-fetches everything from PSI

Writes:
    data/review/psi-inventory.csv   one row per file we need or may need: investigation, folder, name, size, why
    data/review/psi-inventory.json  per-investigation and per-folder totals of all files
    .cache/psi/inventory-all.csv    the same columns for all files, raw data included (not committed)

PSI endpoints (no login, CC0):
    GET  /geode-py/ws/repo/search?term=&source=psi&type=investigation&size=300   all investigations
    GET  /geode-py/ws/repo/investigations/<ID>                                   metadata of one investigation
    POST /geode-py/ws/files/v2  {"folder": "", "fileType": "study",
                                 "studyId": "<ID>", "version": <n>}            full file tree
    GET  /geode-py/ws/studies/<ID>/download?file=<name>&version=<v>&redirect=false  temporary S3 link

The metadata field `added[]` is only the diff against the previous version of an
investigation (it is empty for PSI-99, PSI-69 and others), so the file tree comes from files/v2.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import time
import urllib.request
from collections import defaultdict
from pathlib import Path

BASE = "https://psi.nasa.gov/geode-py/ws"
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".cache" / "psi"
OUT_DIR = ROOT / "data" / "review"
RESEARCH_AREA = "Combustion Science"
PAUSE_S = 0.5

# What our project needs.
# need   - the pipeline downloads it: tables, column dictionaries, test matrices (all small)
# maybe  - documents for later work (card texts, conditions missing from a table, ground-study data)
# skip   - raw data, calibration, engineering, presentations, media, archives: out of scope (AGENTS.md, rule 12)
DOC_EXT = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf"}
TABULAR_EXT = {".csv", ".xls", ".xlsx", ".txt"}
MAYBE_MAX_BYTES = 60 * 1024 * 1024

# Checked in order against the file name, only for files with a DOC_EXT extension
# outside the Raw Data folder. First match wins.
NAME_RULES = [
    (r"read\s*_?me", "need", "column dictionary (ReadMe)"),
    (r"\bDoD\b", "need", "column dictionary (Description of Data)"),
    (r"data[\s_-]*interpretation", "need", "column dictionary (data interpretation)"),
    (r"data[\s_-]*file[\s_-]*description", "need", "column dictionary (data file description)"),
    (r"data[\s_-]*organization", "need", "column dictionary (data organization)"),
    (r"test[\s._-]*matri", "need", "test matrix: conditions missing from the table"),
    (r"test[\s_-]*summary|data[\s_-]*summary", "need", "test summary: conditions per test"),
    (r"final[\s_-]*(science[\s_-]*)?rep|finalrpt|summary[\s_-]*report", "maybe", "final report: card texts, findings"),
    (r"\bSRD\b|science[\s_-]*requirements", "maybe", "science requirements: planned conditions"),
]
NAME_RULES = [(re.compile(p, re.IGNORECASE), need, why) for p, need, why in NAME_RULES]

FOLDER_DEFAULT = {
    "Experimental table": ("need", "experimental table"),
    "Science Documents": ("maybe", "science document"),
    "Reports": ("maybe", "report"),
    "Reference Data": ("maybe", "reference document"),
    # Processed results; for ground investigations without an experimental table (PSI-117) the only data.
    "Analyzed Data": ("maybe", "analyzed data table"),
    # ISA-Tab copy of the metadata the JSON API already returns.
    "Investigation Metadata Files": ("skip", "duplicate of the metadata API"),
}


def fetch(url: str, cache_name: str, refresh: bool, body: dict | None = None) -> dict:
    path = CACHE / cache_name
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = json.loads(resp.read())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload))
    time.sleep(PAUSE_S)
    return payload


def walk(nodes: list[dict], folder_path: list[str]):
    """Yield (folder path, file node) for every file in a files/v2 tree."""
    for node in nodes:
        if node.get("directory") is False:
            yield folder_path, node
        else:
            name = node.get("displayName") or node.get("key", "").rstrip("/").split("/")[-1]
            yield from walk(node.get("files") or [], folder_path + [name])


def classify(top: str, name: str, size: float) -> tuple[str, str]:
    """Return (need, reason)."""
    ext = Path(name).suffix.lower()
    if top == "Experimental table":
        return FOLDER_DEFAULT[top]
    if top in ("Raw Data", "Calibration") or ext not in DOC_EXT:
        return "skip", f"{top}: raw data, calibration, media or archive"
    for rule, need, why in NAME_RULES:
        if rule.search(name):
            return need, why
    need, why = FOLDER_DEFAULT.get(top, ("skip", f"{top}: out of scope"))
    if need == "maybe" and top == "Analyzed Data" and ext not in TABULAR_EXT:
        return "skip", "analyzed data that is not a table"
    if need == "maybe" and size > MAYBE_MAX_BYTES:
        return "skip", f"{why}, larger than 60 MB"
    return need, why


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--refresh", action="store_true", help="ignore the cache and re-fetch from PSI")
    args = parser.parse_args()

    search = fetch(f"{BASE}/repo/search?term=&source=psi&type=investigation&size=300", "search.json", args.refresh)
    hits = [h["_source"] for h in search["hits"]["hits"]]
    ids = sorted(
        (h["Accession"] for h in hits if h.get("Research Area") == RESEARCH_AREA),
        key=lambda a: int(a.split("-")[1]),
    )
    print(f"PSI investigations: {len(hits)}, {RESEARCH_AREA}: {len(ids)}")

    rows = []
    summary = {}
    for acc in ids:
        meta = fetch(f"{BASE}/repo/investigations/{acc}", f"{acc}/metadata.json", args.refresh)
        version = meta.get("version")
        tree = fetch(
            f"{BASE}/files/v2",
            f"{acc}/files-v{version}.json",
            args.refresh,
            body={"folder": "", "fileType": "study", "studyId": acc, "version": version},
        )
        per_folder = defaultdict(lambda: {"files": 0, "bytes": 0})
        for folder, node in walk(tree.get("files") or [], []):
            top = node.get("sortingCategory") or (folder[0] if folder else "")
            name = node["key"].split("/")[-1]
            size = float(node.get("bytes_size") or 0)
            need, reason = classify(top, name, size)
            per_folder[top]["files"] += 1
            per_folder[top]["bytes"] += size
            rows.append({
                "investigation": acc,
                "acronym": meta.get("investigationAcronym") or "",
                "folder": top,
                "subfolder": "/".join(folder[1:]),
                "file_name": name,
                "extension": Path(name).suffix.lower(),
                "bytes": int(size),
                "version": node.get("version"),
                "restricted": bool(node.get("restricted") or node.get("restrictedAccess")),
                "need": need,
                "reason": reason,
            })
        summary[acc] = {
            "acronym": meta.get("investigationAcronym") or "",
            "title": meta.get("title"),
            "projectType": meta.get("projectType"),
            "version": version,
            "totalFileSizeMetadata": meta.get("totalFileSize"),
            "experimentalTables": [t["file_name"] for t in meta.get("experimentalTable") or []],
            "publications": len(meta.get("publications") or []),
            "folders": dict(per_folder),
        }
        files = sum(f["files"] for f in per_folder.values())
        print(f"  {acc:8} {summary[acc]['acronym'][:22]:22} files={files:6}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # The repository keeps only the files we need or may need; the full list (66k rows, mostly
    # raw data) stays in the cache.
    for path, subset in (
        (OUT_DIR / "psi-inventory.csv", [r for r in rows if r["need"] != "skip"]),
        (CACHE / "inventory-all.csv", rows),
    ):
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(subset)
    (OUT_DIR / "psi-inventory.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")

    totals = defaultdict(lambda: [0, 0])
    for r in rows:
        totals[r["need"]][0] += 1
        totals[r["need"]][1] += r["bytes"]
    print(f"files: {len(rows)}")
    for need, (n, b) in sorted(totals.items()):
        print(f"  {need:6} {n:6} files {b / 1e9:10.3f} GB")


if __name__ == "__main__":
    main()
