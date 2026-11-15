"""Download manifest for the SI fill: which PSI files the full solution needs, and why.

    python3 -m pipeline.fill_manifest      # needs .cache/psi/inventory-all.csv (python3 -m pipeline.inventory)

Writes data/review/si-fill-download.csv: one row per file with its group, priority and purpose,
and prints totals per group. Nothing is downloaded here.

Priorities:
    core         download for the full solution
    conditional  download only if a sample shows that core files do not hold the value (see docs/13-si-fill-plan.md)
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INVENTORY_ALL = ROOT / ".cache" / "psi" / "inventory-all.csv"
REVIEW_NEED = ROOT / "data" / "review" / "psi-inventory.csv"
OUT = ROOT / "data" / "review" / "si-fill-download.csv"

DOC = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".rtf"}
TABLE = {".csv", ".xls", ".xlsx", ".txt"}
DOC_MAX_BYTES = 60 * 1024 * 1024

FLEX_FAMILY = {"PSI-69", "PSI-68", "PSI-39"}
ACME = {"PSI-10", "PSI-20", "PSI-21", "PSI-22", "PSI-23", "PSI-159"}
SAFFIRE = {"PSI-98", "PSI-99", "PSI-100"}
SMOKE = {"PSI-101", "PSI-102", "PSI-47"}
SPICE = {"PSI-107"}


def ext(r: dict) -> str:
    return r["extension"].strip().lower()


def classify(r: dict, need: set[tuple[str, str]]) -> tuple[str, str, str] | None:
    """Return (group, priority, purpose) or None when the file is not needed."""
    inv, folder, name, e, size = r["investigation"], r["folder"], r["file_name"], ext(r), int(r["bytes"])

    if (inv, name) in need:
        return "1 tables and column dictionaries", "core", "rows to fill; meaning and units of columns"

    if folder in ("Science Documents", "Reports", "Reference Data") and e in DOC and size <= DOC_MAX_BYTES:
        return "2 documents", "core", "values and quotes for fills from documents (conditions, outcomes)"

    if folder == "Raw Data" and inv in FLEX_FAMILY and e in (".txt", ".csv"):
        if re.search(r"settings", name, re.IGNORECASE):
            return None  # camera settings: 6k small files, nothing to fill
        return "3 FLEX, FLEX-2, CFI per-test series", "core", "test sheets, droplet diameter vs time, chamber and radiometer readings"
    if folder == "Raw Data" and inv in FLEX_FAMILY and e == ".pxp":
        return "6 CFI Igor files", "conditional", "droplet diameter in Igor Pro format, only if no text series exists"

    if folder == "Raw Data" and inv in ACME and e in (".txt", ".csv"):
        if name.endswith("_data.csv"):
            return "7 ACME sensor series", "conditional", "per-test sensor time series, only if TP/as-run files lack pressure or O2"
        if "CameraConfigure" in name:
            return None  # camera settings: nothing to fill
        return "4 ACME per-test test points and comments", "core", "test point conditions, as-run values, operator comments"

    if folder == "Raw Data" and inv in SAFFIRE and e in DOC:
        return "5 Saffire, SAME, SPICE, DAFT data", "core", "sensor and telemetry data, data descriptions"
    if folder in ("Raw Data", "Analyzed Data") and inv in SMOKE | SPICE and e in DOC:
        return "5 Saffire, SAME, SPICE, DAFT data", "core", "smoke and flame-length data, run logs"
    if folder == "Analyzed Data" and e in TABLE:
        return "5 Saffire, SAME, SPICE, DAFT data", "core", "analyzed tables"

    return None


def main() -> None:
    rows = list(csv.DictReader(open(INVENTORY_ALL, encoding="utf-8")))
    need = {(r["investigation"], r["file_name"]) for r in csv.DictReader(open(REVIEW_NEED, encoding="utf-8")) if r["need"] == "need"}

    out = []
    for r in rows:
        c = classify(r, need)
        if c:
            group, priority, purpose = c
            out.append({
                "group": group, "priority": priority, "investigation": r["investigation"], "folder": r["folder"],
                "subfolder": r["subfolder"], "file_name": r["file_name"], "bytes": r["bytes"],
                "version": r["version"], "purpose": purpose,
            })
    out.sort(key=lambda x: (x["group"], int(x["investigation"].split("-")[1]), x["file_name"]))

    with open(OUT, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    totals = defaultdict(lambda: [0, 0])
    for x in out:
        totals[(x["priority"], x["group"])][0] += 1
        totals[(x["priority"], x["group"])][1] += int(x["bytes"])
    for prio in ("core", "conditional"):
        n_all = b_all = 0
        for (p, g), (n, b) in sorted(totals.items()):
            if p == prio:
                print(f"  {prio:11} {g:42} {n:6} files {b / 1e9:7.3f} GB")
                n_all += n
                b_all += b
        print(f"  {prio:11} {'TOTAL':42} {n_all:6} files {b_all / 1e9:7.3f} GB")
    print(f"written {OUT.relative_to(ROOT)} ({len(out)} rows)")


if __name__ == "__main__":
    main()
