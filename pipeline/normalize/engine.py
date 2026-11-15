"""Mapping engine: one experimental table + its mapping JSON → contract TestRecords.

The mapping (pipeline/mappings/<table>.json) says which column feeds which contract field,
in which unit, and how to read special cells. The engine applies it identically to every row:
no per-row judgement, no guessing (AGENTS.md §2.3). Spec of the mapping format:
pipeline/mappings/README.md.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from pipeline.extractors.base import TableRow
from pipeline.normalize import values as V
from pipeline.normalize.fuel import fix_autoincrement, parse_fuel
from pipeline.normalize.join import make_key, match as join_match

CONTRACT_FIELDS = [
    "id", "investigationId", "tableFile", "sourceRow", "granularity", "label", "date",
    "fuelName", "fuelState", "fuelGeometry", "fuelRaw", "thicknessMm", "widthMm", "diameterMm",
    "o2PctMin", "o2PctMax", "o2PctValues", "o2PctApprox", "o2PctFinal", "diluent",
    "pressureKpaMin", "pressureKpaMax", "co2Pct",
    "flowCmSMin", "flowCmSMax", "flowDirection", "gravity",
    "ignited", "outcome", "burnTimeS", "spreadRateMmS", "coolFlame", "notes",
    "raw", "inferred", "confidence", "mappingVersion",
]

# field name in mapping → (contract field(s), dimension, kind)
NUMERIC = {
    "o2Pct": (("o2PctMin", "o2PctMax"), "pct", "range"),
    "o2PctFinal": (("o2PctFinal",), "pct", "single"),
    "co2Pct": (("co2Pct",), "pct", "single"),
    "pressureKpa": (("pressureKpaMin", "pressureKpaMax"), "pressure", "range"),
    "flowCmS": (("flowCmSMin", "flowCmSMax"), "speed", "range"),
    "thicknessMm": (("thicknessMm",), "length", "single"),
    "widthMm": (("widthMm",), "length", "single"),
    "diameterMm": (("diameterMm",), "length", "single"),
    "burnTimeS": (("burnTimeS",), "time", "single"),
    "spreadRateMmS": (("spreadRateMmS",), "spread", "single"),
}
LIMITS = {"pct": (0, 100), "pressure": (1e-9, None), "speed": (0, None), "length": (1e-9, None),
          "time": (0, None), "spread": (0, None)}
_CONFIDENCE = {"high": 2, "medium": 1, "low": 0}
_PLACEHOLDER = re.compile(r"\{([^{}]+)\}")


@dataclass
class TableReport:
    tableFile: str
    rowsIn: int = 0
    records: int = 0
    skipped: Dict[str, int] = field(default_factory=dict)
    merged: int = 0
    filled: Dict[str, int] = field(default_factory=dict)


class Row:
    """One source row while it is being normalized."""

    def __init__(self, src: TableRow):
        self.src = src
        self.rec: Dict[str, Any] = {k: None for k in CONTRACT_FIELDS}
        self.rec.update({"o2PctApprox": False, "flowDirection": "unknown", "inferred": []})
        self.notes: List[str] = []
        self.confidence = "high"
        # Cells of the joined file's row (mapping key `join`), read as "@Column".
        self.joined: Optional[Dict[str, str]] = None
        self.joined_used: List[str] = []

    def cell(self, column: Optional[str]) -> Optional[str]:
        if not column:
            return None
        if column.startswith("@"):
            if self.joined is None:
                return None
            name = column[1:]
            if name not in self.joined:
                raise KeyError(f"column {name!r} not in the joined file (columns: {list(self.joined)})")
            return self.joined[name]
        if column not in self.src.raw:
            raise KeyError(f"column {column!r} not in table (columns: {list(self.src.raw)})")
        return self.src.raw[column]

    def infer(self, *names: str) -> None:
        for n in names:
            if n not in self.rec["inferred"]:
                self.rec["inferred"].append(n)

    def lower(self, level: str) -> None:
        if _CONFIDENCE[level] < _CONFIDENCE[self.confidence]:
            self.confidence = level

    def note(self, text: Optional[str]) -> None:
        if text and text not in self.notes:
            self.notes.append(text)


# --- field handlers -----------------------------------------------------------------

def _numeric(row: Row, name: str, spec: Dict[str, Any]) -> None:
    targets, dim, kind = NUMERIC[name]
    if "value" in spec:  # value from a document, not from the table
        vals = spec["value"] if isinstance(spec["value"], list) else [spec["value"]]
        _assign(row, name, targets, kind, [float(v) for v in vals], approx=bool(spec.get("approx")), is_range=False)
        row.infer(*targets)
        row.note(spec.get("note"))
        return
    raw = row.cell(spec["column"])
    if V.is_null_word(raw):
        return
    q = V.parse_quantity(raw, multi=spec.get("multi", False), allow_text=spec.get("allowText", False))
    if q is None:
        row.note(f"{spec['column'].strip()}: {raw.strip()!r} is not a readable number; left null.")
        row.lower("medium")
        return
    if spec.get("excelPercent") and q.unit == "%" and q.values and all(v > 100 for v in q.values):
        q.values = [v / 100 for v in q.values]  # "2100%" = 21 shown in Excel percent format
        row.note(f"{spec['column'].strip()}: {raw.strip()!r} read as {', '.join(f'{v:g}' for v in q.values)} "
                 "(spreadsheet percent-format artifact).")
        row.lower("medium")
    # A unit written in the cell wins over the column unit from the mapping.
    converted = V.convert(q.values, q.unit, spec.get("unit"), dim)
    if converted is None:
        row.note(f"{spec['column'].strip()}: unit of {raw.strip()!r} does not match {spec.get('unit')!r}; left null.")
        row.lower("low")
        return
    lo, hi = LIMITS[dim]
    if any((lo is not None and v < lo) or (hi is not None and v > hi) for v in converted):
        row.note(f"{spec['column'].strip()}: {raw.strip()!r} is outside the valid range; left null.")
        row.lower("low")
        return
    if q.approx:
        row.lower("medium")
        if kind == "range" and name != "o2Pct":
            row.note(f"{spec['column'].strip()}: source value {raw.strip()!r} is approximate or uncertain.")
    _assign(row, name, targets, kind, converted, approx=q.approx, is_range=q.is_range, raw=raw, spec=spec)
    if spec["column"].startswith("@"):  # taken from the joined file, not from this table
        row.infer(*targets)
        row.joined_used.append(f"{spec['column'][1:].strip()} = {raw.strip()!r}")


def _assign(row: Row, name: str, targets: Tuple[str, ...], kind: str, vals: List[float], *, approx: bool,
            is_range: bool, raw: Optional[str] = None, spec: Optional[Dict[str, Any]] = None) -> None:
    if kind == "single":
        if len(vals) != 1:
            row.note(f"{(spec or {}).get('column', name).strip()}: several values {raw.strip()!r}; left null.")
            row.lower("medium")
            return
        row.rec[targets[0]] = vals[0]
        if approx and raw:
            row.note(f"{spec['column'].strip()}: source value {raw.strip()!r} is approximate.")
        return
    row.rec[targets[0]], row.rec[targets[1]] = min(vals), max(vals)
    if name == "o2Pct":
        row.rec["o2PctApprox"] = approx
        if len(vals) > 1 and not is_range:
            row.rec["o2PctValues"] = sorted(set(vals))
            row.rec["o2PctMin"], row.rec["o2PctMax"] = min(row.rec["o2PctValues"]), max(row.rec["o2PctValues"])


def _label(row: Row, spec: Dict[str, Any]) -> None:
    if spec.get("from") == "date":
        row.rec["label"] = row.rec["date"]
    elif spec.get("column"):
        v = (row.cell(spec["column"]) or "").strip()
        if spec.get("regex"):
            m = re.match(spec["regex"], v)
            v = m.group(1).strip() if m else v
        row.rec["label"] = v or None


def _date(row: Row, spec: Dict[str, Any]) -> None:
    if "parts" in spec:
        p = spec["parts"]
        row.rec["date"] = V.date_from_parts(row.cell(p["year"]), row.cell(p["month"]), row.cell(p["day"]))
    else:
        row.rec["date"] = V.parse_date(row.cell(spec["column"]), spec["format"])
    if row.rec["date"] is None and spec.get("noteIfMissing"):
        row.note(spec["noteIfMissing"].format(**_fmt_cells(row)))


def _fuel(row: Row, spec: Dict[str, Any]) -> None:
    if "value" in spec:  # fuel named by the table header or documents, not by a cell
        f = parse_fuel(spec["value"], spec)
        row.rec["fuelName"], row.rec["fuelState"], row.rec["fuelGeometry"] = f.name, f.state, f.geometry
        row.infer("fuelName")
        row.note(spec.get("note"))
        return
    raw = row.cell(spec["column"]) if spec.get("column") else None
    if spec.get("column"):
        row.rec["fuelRaw"] = raw if raw and raw.strip() else None
    text = raw
    if spec.get("nameFromColumn"):
        text = row.cell(spec["nameFromColumn"])
    f = parse_fuel(text, spec)
    row.rec["fuelName"], row.rec["fuelState"], row.rec["fuelGeometry"] = f.name, f.state, f.geometry
    if f.name is None:
        row.rec["fuelState"] = None if not spec.get("stateWithoutName") else row.rec["fuelState"]
        row.rec["fuelGeometry"] = None if not spec.get("stateWithoutName") else row.rec["fuelGeometry"]
    for k_src, k_dst in (("thickness_mm", "thicknessMm"), ("width_mm", "widthMm"), ("diameter_mm", "diameterMm")):
        v = getattr(f, k_src)
        if v is not None:
            row.rec[k_dst] = v
    row.infer(*f.inferred)
    for n in f.notes:
        row.note(n)
    row.lower(f.confidence)


def _flow_direction(row: Row, spec: Dict[str, Any]) -> None:
    if "value" in spec:
        row.rec["flowDirection"] = spec["value"]
        if spec["value"] != "unknown":
            row.infer("flowDirection")
        return
    v = (row.cell(spec["column"]) or "").strip().lower()
    row.rec["flowDirection"] = spec.get("map", {}).get(v, "unknown")


def _diluent(row: Row, spec: Dict[str, Any]) -> None:
    if "value" in spec:
        row.rec["diluent"] = spec["value"]
        row.infer("diluent")
        return
    if "fractions" in spec:
        parts = []
        for gas, col in spec["fractions"].items():
            q = V.parse_quantity(row.cell(col))
            if q and len(q.values) == 1 and q.values[0] > 0:
                parts.append(gas)
        row.rec["diluent"] = "+".join(parts) or None
    elif "column" in spec and spec.get("findall"):
        v = row.cell(spec["column"]) or ""
        found = list(dict.fromkeys(re.findall(spec["regex"], v)))
        row.rec["diluent"] = " or ".join(spec.get("map", {}).get(x, x) for x in found) or None
    elif "column" in spec:
        v = row.cell(spec["column"]) or ""
        m = re.search(spec["regex"], v)
        if m:
            token = m.group(1)
            fixed = fix_autoincrement(token) if spec.get("fixAutoIncrement") else token
            if fixed != token:
                row.note(f"{spec['column'].strip()}: {v.strip()!r} shows a spreadsheet auto-increment artifact; diluent read as {fixed}.")
                row.lower("medium")
            row.rec["diluent"] = spec.get("map", {}).get(fixed, fixed)
    if spec.get("inferred") and row.rec["diluent"]:
        row.infer("diluent")


def _lookup(spec: Dict[str, Any], value: Optional[str]) -> Tuple[bool, Any]:
    v = (value or "").strip().lower()
    table = {k.lower(): val for k, val in (spec.get("map") or {}).items()}
    if v in table:
        return True, table[v]
    for prefix, val in (spec.get("prefixMap") or {}).items():
        if v.startswith(prefix.lower()):
            return True, val
    return False, None


def _ignited(row: Row, spec: Dict[str, Any]) -> None:
    rule = spec.get("rule", "map")
    if rule == "value":
        row.rec["ignited"] = spec["value"]
        row.infer("ignited")
    elif rule == "countPositive":
        q = V.parse_quantity(row.cell(spec["column"]))
        if q and len(q.values) == 1:
            row.rec["ignited"] = q.values[0] > 0
    elif rule == "burnTime":
        if row.rec["burnTimeS"] is not None and row.rec["burnTimeS"] > 0:
            row.rec["ignited"] = True
            row.infer("ignited")
    elif rule == "map":
        found, val = _lookup(spec, row.cell(spec["column"]))
        if found:
            row.rec["ignited"] = val


def _simple_map(row: Row, field_name: str, spec: Dict[str, Any]) -> None:
    found, val = _lookup(spec, row.cell(spec["column"]))
    if found:
        row.rec[field_name] = val


def _fmt_cells(row: Row) -> Dict[str, str]:
    return {k: v.strip() for k, v in row.src.raw.items()}


def render(template: str, row: Row) -> Optional[str]:
    """'{Col A} flames on {Col B}.' → text, or None if any referenced cell is empty."""
    out = template
    for name in _PLACEHOLDER.findall(template):
        if name.startswith("="):  # computed value, e.g. {=o2PctFinal}
            val = row.rec.get(name[1:])
            if val is None:
                return None
            out = out.replace("{" + name + "}", f"{val:g}" if isinstance(val, float) else str(val))
            continue
        val = row.src.raw.get(name)
        if V.is_null_word(val):
            return None
        out = out.replace("{" + name + "}", val.strip())
    return out


# --- table level --------------------------------------------------------------------

def normalize_table(mapping: Dict[str, Any], rows: List[TableRow],
                    joined: Optional[Dict[str, Dict[str, str]]] = None) -> Tuple[List[Dict[str, Any]], TableReport]:
    report = TableReport(tableFile=mapping["tableFile"], rowsIn=len(rows))
    footnotes = _collect_footnotes(mapping, rows)
    work: List[Row] = []
    for src in rows:
        reason = _skip_reason(mapping, src)
        if reason:
            report.skipped[reason] = report.skipped.get(reason, 0) + 1
            continue
        cont = mapping.get("continuation")
        if cont and work and V.is_null_word(src.raw.get(cont["whenEmpty"])):
            prev = work[-1]
            vals = "; ".join(f"{c.strip()} = {src.raw[c].strip()!r}" for c in cont["collect"] if src.raw.get(c, "").strip())
            prev.note(f"Continuation row {src.source_row}: {vals}.")
            report.merged += 1
            continue
        work.append(_normalize_row(mapping, src, footnotes, joined))

    records = [_finish(mapping, r) for r in work]
    _assign_ids(mapping, records)
    report.records = len(records)
    for f in ("o2PctMin", "pressureKpaMin", "flowCmSMin", "outcome", "fuelName", "date"):
        report.filled[f] = sum(1 for r in records if r[f] is not None)
    return records, report


def _skip_reason(mapping: Dict[str, Any], src: TableRow) -> Optional[str]:
    for rule in mapping.get("skipRows") or []:
        if re.search(rule["regex"], src.raw.get(rule["column"], "") or ""):
            return rule["reason"]
    fn = mapping.get("footnotes")
    if fn and re.search(fn["regex"], src.raw.get(fn["column"], "") or ""):
        return "footnote row"
    return None


def _collect_footnotes(mapping: Dict[str, Any], rows: List[TableRow]) -> Dict[str, str]:
    fn = mapping.get("footnotes")
    out: Dict[str, str] = {}
    if not fn:
        return out
    for r in rows:
        m = re.search(fn["regex"], r.raw.get(fn["column"], "") or "")
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def _normalize_row(mapping: Dict[str, Any], src: TableRow, footnotes: Dict[str, str],
                   joined: Optional[Dict[str, Dict[str, str]]] = None) -> Row:
    row = Row(src)
    row.rec["raw"] = dict(src.raw)
    row.confidence = mapping.get("confidence", "high")
    join = mapping.get("join")
    if join:
        cells = [src.raw.get(name) for name in join["key"]["table"]]
        row.joined = join_match(joined, make_key(cells))
        join_key = ", ".join(f"{s.strip()} {(c or '').strip()}" for s, c in zip(join["key"]["source"], cells))
        if row.joined is None:
            row.note(f"No row with {join_key} in {join['label']}.")
    if "date" in mapping:
        _date(row, mapping["date"])
    _label(row, mapping.get("label") or {})
    if "fuel" in mapping:
        _fuel(row, mapping["fuel"])
    for name, spec in (mapping.get("fields") or {}).items():
        if name not in NUMERIC:
            raise ValueError(f"{mapping['tableFile']}: unknown numeric field {name!r}")
        _numeric(row, name, spec)
    _flow_direction(row, mapping.get("flowDirection") or {"value": "unknown"})
    if "diluent" in mapping:
        _diluent(row, mapping["diluent"])
    for name in ("outcome", "coolFlame"):
        if name in mapping:
            _simple_map(row, name, mapping[name])
    if "ignited" in mapping:
        _ignited(row, mapping["ignited"])
    if mapping.get("ignitedIfCoolFlame") and row.rec["coolFlame"] is True:
        row.rec["ignited"] = True
    for ov in mapping.get("overrides") or []:
        if re.search(ov["regex"], row.src.raw.get(ov["column"], "") or ""):
            row.rec.update(ov["set"])
            row.infer(*ov.get("inferred", []))  # values taken from a document, not from this cell
            if ov.get("confidence"):
                row.lower(ov["confidence"])
            row.note(ov.get("note"))
    if join and row.joined_used:
        row.note(f"Taken from {join['label']}, row with {join_key}: {'; '.join(row.joined_used)}.")
        row.lower(join.get("confidence", "medium"))
    gravity = mapping["gravity"]
    row.rec["gravity"] = gravity["value"]
    row.infer("gravity")
    for tpl in (mapping.get("notes") or {}).get("templates", []):
        row.note(render(tpl, row))
    for text in (mapping.get("notes") or {}).get("static", []):
        row.note(text)
    if footnotes:
        refs = set((mapping.get("footnotes") or {}).get("applyToAll", []))
        for cell in src.raw.values():
            refs.update(re.findall(r"(?i)\bnote\s*(\d+)\b", cell or ""))
        for k in sorted(refs):
            if k in footnotes:
                row.note(f"Note {k}: {footnotes[k]}")
    return row


def _finish(mapping: Dict[str, Any], row: Row) -> Dict[str, Any]:
    rec = row.rec
    rec["investigationId"] = mapping["investigationId"]
    rec["tableFile"] = mapping["tableFile"]
    rec["sourceRow"] = row.src.source_row
    rec["granularity"] = mapping["granularity"]
    rec["notes"] = " ".join(row.notes) or None
    rec["confidence"] = row.confidence
    rec["mappingVersion"] = mapping["mappingVersion"]
    return {k: rec[k] for k in CONTRACT_FIELDS}


def _assign_ids(mapping: Dict[str, Any], records: List[Dict[str, Any]]) -> None:
    prefix = f"{mapping['investigationId']}:{mapping['tableId']}:"
    by_label = mapping.get("idFrom", "label") == "label"
    counts = Counter(r["label"] for r in records if r["label"])
    id_column = mapping.get("idColumn")
    for r in records:
        if id_column and (r["raw"].get(id_column) or "").strip():
            r["id"] = f"{prefix}{r['raw'][id_column].strip().replace(':', '-')}"
            continue
        label = (r["label"] or "").replace(":", "-")
        if not by_label or not label:
            r["id"] = f"{prefix}r{r['sourceRow']}"
        elif counts[r["label"]] > 1:
            r["id"] = f"{prefix}{label}-r{r['sourceRow']}"
        else:
            r["id"] = f"{prefix}{label}"
