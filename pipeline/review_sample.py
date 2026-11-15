"""A fixed random sample of normalized values for a person to check against the source.

    python3 -m pipeline.review_sample            # writes data/review/sample-40.csv
    python3 -m pipeline.review_sample --n 60 --seed 2

Each line names the source file and row, the source cell exactly as written, and the value
in data/processed/tests.json. The reviewer fills `checked_by` and `correct` (yes / no) and
writes the totals into `quality` in pipeline/config/contract.json. The seed keeps the
sample the same between runs, so a half-done review is not lost.
"""
from __future__ import annotations

import argparse
import csv
import json
import random
import re
from typing import Dict, List, Optional

from pipeline.settings import REPO_ROOT

FIELDS = [
    ("o2PctMin", "oxygen, % by volume"),
    ("pressureKpaMin", "pressure, kPa"),
    ("flowCmSMin", "airflow speed, cm/s"),
    ("fuelName", "fuel"),
]
_JOINED = re.compile(r"Taken from (?P<file>.+?), row with (?P<row>[^:]+): (?P<cells>[^.]+(?:\.\d+[^.]*)*)\.")


def source_of(record: Dict, field: str) -> Optional[Dict[str, str]]:
    """Where the value came from: the table row, or the joined file named in the notes."""
    if field in record["inferred"]:
        m = _JOINED.search(record["notes"] or "")
        if not m:
            return None  # taken from a document quoted in the notes: checked when the note is read
        return {"file": m.group("file"), "row": m.group("row"), "cell": m.group("cells")}
    cells = "; ".join(f"{k.strip()} = {v.strip()!r}" for k, v in record["raw"].items() if v and v.strip())
    return {"file": record["tableFile"], "row": f"data row {record['sourceRow']}", "cell": cells}


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--n", type=int, default=40)
    p.add_argument("--seed", type=int, default=1)
    args = p.parse_args(argv)

    tests = json.loads((REPO_ROOT / "data" / "processed" / "tests.json").read_text(encoding="utf-8"))
    candidates = []
    for record in tests:
        for field, words in FIELDS:
            if record[field] is None:
                continue
            source = source_of(record, field)
            if source:
                candidates.append((record, field, words, source))
    sample = random.Random(args.seed).sample(candidates, min(args.n, len(candidates)))
    sample.sort(key=lambda c: (c[0]["investigationId"], c[0]["tableFile"], c[0]["sourceRow"], c[1]))

    out = REPO_ROOT / "data" / "review" / f"sample-{args.n}.csv"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["n", "record_id", "field", "value_in_data", "source_file", "source_row",
                    "source_cells", "checked_by", "correct", "comment"])
        for n, (record, field, words, source) in enumerate(sample, 1):
            hi = record.get(field.replace("Min", "Max")) if field.endswith("Min") else None
            value = record[field]
            span = f"{value} to {hi}" if hi is not None and hi != value else str(value)
            w.writerow([n, record["id"], words, span, source["file"], source["row"], source["cell"], "", "", ""])
    print(f"wrote {out} ({len(sample)} values from {len(candidates)} candidates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
