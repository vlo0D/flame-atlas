"""A fixed random sample of the values a language model read from operator notes, for a person to check.

    python3 -m pipeline.review_si_notes            # writes data/review/si-notes-sample.csv
    python3 -m pipeline.review_si_notes --n 30 --seed 2

Each line gives the value in data/processed/tests.json, the words the model quoted and the whole
note from the NASA file. The reviewer reads the note, decides whether the value follows from it,
and fills `checked_by` and `correct` (yes / no). The code has already checked that the quote is in
the note; only a person can check that the value is the right reading of it.
Needs the joined file in data/raw (python3 -m pipeline.ingest).
"""
from __future__ import annotations

import argparse
import csv
import json
import random
from pathlib import Path

from pipeline.normalize.join import load_join, make_key, table_key
from pipeline.normalize.si_notes import FIELDS, load_readings
from pipeline.settings import REPO_ROOT

MAPPINGS_DIR = Path(__file__).resolve().parent / "mappings"
COLUMNS = ["n", "record_id", "field", "value_in_data", "quote", "note_in_source", "source_file", "source_row",
           "checked_by", "correct", "comment"]


def candidates() -> list:
    tests = json.loads((REPO_ROOT / "data" / "processed" / "tests.json").read_text(encoding="utf-8"))
    out = []
    for path in sorted(MAPPINGS_DIR.glob("*.json")):
        mapping = json.loads(path.read_text(encoding="utf-8"))
        if not mapping.get("siNotes"):
            continue
        join = mapping["join"]
        joined = load_join(REPO_ROOT / "data" / "raw", mapping["investigationId"], join)
        readings = load_readings(MAPPINGS_DIR, mapping["siNotes"])
        column = mapping["siNotes"]["column"].lstrip("@")
        for record in tests:
            if record["tableFile"] != mapping["tableFile"]:
                continue
            key = make_key(table_key(join, (record["raw"].get(name) for name in join["key"]["table"])))
            reading, row = readings["readings"].get(key), joined.get(key)
            if not reading or not row:
                continue
            for field in FIELDS:
                entry = reading.get(field)
                # Only values that made it into the data: the quote check may have turned a reading down.
                if entry and field in record["inferred"] and record[field] == entry["value"]:
                    out.append({"record_id": record["id"], "field": field, "value_in_data": record[field],
                                "quote": entry["quote"], "note_in_source": row.get(column, ""),
                                "source_file": readings["sourceFile"], "source_row": key})
    return out


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--n", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--out", type=Path, default=REPO_ROOT / "data" / "review" / "si-notes-sample.csv")
    args = parser.parse_args(argv)

    rows = candidates()
    sample = random.Random(args.seed).sample(rows, min(args.n, len(rows)))
    sample.sort(key=lambda item: (item["record_id"], item["field"]))
    with args.out.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=COLUMNS)
        writer.writeheader()
        for n, item in enumerate(sample, 1):
            writer.writerow({"n": n, **item, "checked_by": "", "correct": "", "comment": ""})
    print(f"wrote {args.out.relative_to(REPO_ROOT)}: {len(sample)} of {len(rows)} values read from notes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
