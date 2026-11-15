"""Rows of a second PSI file joined to an experimental table by a key column.

Some tables leave out conditions that the same investigation records in another file
(for BASS: oxygen, pressure and airflow are in the As Run Test Matrix, not in the table).
A mapping names that file in `join` (pipeline/mappings/README.md); the engine reads its
cells through `@Column` references and marks every value taken this way in `inferred`.
The table's own `raw` is never changed.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence


def cell_text(value: Any) -> str:
    """A spreadsheet cell as text: 12.0 → "12", None → ""."""
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def key_text(value: Any) -> str:
    return cell_text(value).strip().lower()


def load_join(raw_dir: Path, investigation_id: str, spec: Dict[str, Any]) -> Dict[str, Dict[str, str]]:
    """{key: {column: text}} for every data row of the joined file.

    spec: {"file": path under data/raw/<id>/ (an xlsx sheet), or under data/derived/ when
    "root" is "derived" (a csv written by pipeline/telemetry.py), "sheet": name, "headerRow":
    1-based row with the column names, "key": {"table": [columns], "source": [columns]}}: the
    key is the cells of those columns together, in order. A key that appears twice is an error:
    one row of the joined file answers for one key.
    """
    derived = spec.get("root") == "derived"
    path = (raw_dir.parent / "derived" / spec["file"]) if derived else (raw_dir / investigation_id / spec["file"])
    if not path.exists():
        raise FileNotFoundError(f"join file not found: {path}")
    rows = _read(path, spec.get("sheet"))
    header_row = spec.get("headerRow", 1)
    header = [cell_text(c) for c in rows[header_row - 1]]
    key_columns = spec["key"]["source"]
    for name in key_columns:
        if name not in header:
            raise KeyError(f"{path.name}: key column {name!r} not in {header}")
    out: Dict[str, Dict[str, str]] = {}
    for values in rows[header_row:]:
        record = {name: cell_text(v) for name, v in zip(header, values) if name}
        first = key_text(record.get(key_columns[0]))
        if not first or (not derived and not first.isdigit()):
            continue  # setup notes, dilution checks and blank rows have no test number
        key = make_key(record.get(name) for name in key_columns)
        if key in out:
            raise ValueError(f"{path.name}: key {key!r} appears twice in columns {key_columns}")
        out[key] = record
    return out


def _read(path: Path, sheet: Optional[str]) -> List[Sequence[Any]]:
    if path.suffix.lower() == ".csv":
        with path.open(newline="", encoding="utf-8") as handle:
            return list(csv.reader(handle))
    from openpyxl import load_workbook  # imported here so the engine runs without it

    return list(load_workbook(path, read_only=True, data_only=True)[sheet].iter_rows(values_only=True))


def table_key(spec: Dict[str, Any], cells: Iterable[Any]) -> List[str]:
    """The table's key cells, each cut down by `key.tablePattern` when the mapping gives one.

    The pattern's first group is the part that names the test in the joined file: SAME-R
    labels the second measurement of run 58 as "58a", and its telemetry knows only run 58.
    """
    pattern = spec["key"].get("tablePattern")
    out = []
    for cell in cells:
        text = cell_text(cell)
        found = re.search(pattern, text) if pattern else None
        out.append(found.group(1) if found else text)
    return out


def make_key(values: Iterable[Any]) -> str:
    return " | ".join(key_text(v) for v in values)


def match(joined: Optional[Dict[str, Dict[str, str]]], key: Optional[str]) -> Optional[Dict[str, str]]:
    if not joined or key is None:
        return None
    return joined.get(key)
