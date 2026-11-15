"""Cell value parsing: numbers, ranges, lists, approximations, units, dates.

Every function is pure and returns None for anything it cannot read with certainty
(AGENTS.md §2.2: null is better than a guess). The original cell always stays in `raw`.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple

# Words that mean "no number here" (compared lower-case, stripped).
NULL_WORDS = {"", "-", "--", "n/a", "na", "none", "null", "ramped", "insignificant", "complete", "acceleratory",
              "see fig. 5", "?", "unknown", "tbd"}

# Unit → (dimension, factor to the contract unit). Contract units: % vol, kPa, cm/s, mm, s, mm/s.
UNITS: Dict[str, Tuple[str, float]] = {
    "%": ("pct", 1.0), "percent": ("pct", 1.0), "fraction": ("pct", 100.0), "mole fraction": ("pct", 100.0),
    "kpa": ("pressure", 1.0), "pa": ("pressure", 0.001), "atm": ("pressure", 101.325), "bar": ("pressure", 100.0),
    "psi": ("pressure", 6.894757), "mmhg": ("pressure", 0.133322), "torr": ("pressure", 0.133322),
    "mm": ("length", 1.0), "cm": ("length", 10.0), "m": ("length", 1000.0), "micron": ("length", 0.001),
    "um": ("length", 0.001), "µm": ("length", 0.001), "in": ("length", 25.4), '"': ("length", 25.4),
    "cm/s": ("speed", 1.0), "mm/s": ("speed", 0.1), "m/s": ("speed", 100.0),
    "s": ("time", 1.0), "sec": ("time", 1.0), "min": ("time", 60.0), "ms": ("time", 0.001),
}
# Speeds converted to mm/s (spread rate) use this table instead.
SPEED_MM_S = {"mm/s": 1.0, "cm/s": 10.0, "m/s": 1000.0}

_NUM = r"[-+]?(?:\d+\.\d*|\.\d+|\d+)"
_UNIT_RE = r"(?:mole fraction|mmhg|torr|kpa|atm|bar|psi|pa|cm/s|mm/s|m/s|micron|µm|um|mm|cm|m|in|sec|min|ms|s|%|\")"


@dataclass
class Quantity:
    values: List[float]
    approx: bool = False
    is_range: bool = False
    unit: Optional[str] = None
    warnings: List[str] = field(default_factory=list)

    @property
    def min(self) -> float:
        return min(self.values)

    @property
    def max(self) -> float:
        return max(self.values)


def is_null_word(text: Optional[str]) -> bool:
    return text is None or text.strip().lower() in NULL_WORDS


def round_value(x: float) -> float:
    """2 decimals for |x| ≥ 1, 4 significant digits below 1; integers stay integers."""
    if math.isnan(x):
        return x
    if x == 0:
        return 0
    if float(x).is_integer():
        return int(x)
    digits = 2 if abs(x) >= 1 else 4 - int(math.floor(math.log10(abs(x)))) - 1
    r = round(x, digits)
    return int(r) if float(r).is_integer() else r


def _to_float(token: str) -> Optional[float]:
    token = token.strip()
    # "037 mm": a leading zero without a decimal point is a typo we cannot resolve (0.37? 37?).
    if re.fullmatch(r"0\d+", token.lstrip("+-")):
        return None
    try:
        return float(token)
    except ValueError:
        return None


def _fraction_inches(text: str) -> Optional[float]:
    """'1/4"' or '3/8' → inches as float."""
    m = re.fullmatch(r"\s*(\d+)\s*/\s*(\d+)\s*\"?\s*", text)
    if not m:
        return None
    return int(m.group(1)) / int(m.group(2))


def parse_quantity(text: Optional[str], *, multi: bool = False, allow_text: bool = False) -> Optional[Quantity]:
    """Read a numeric cell.

    Handles: "22.2", "~ 22.1", "21.5 - 21.7", "22.1 to 22.0", "21; 26.5; 40", "0.5; 1.0; or 3.0",
    "0.61 mm", "20 cm/s", "1 atm", "30%-40%". With `multi`, whitespace-separated readings
    ("3   5   approaching 10") are accepted and flagged approximate when words are present.
    With `allow_text`, numbers are pulled out of free text ("~30% and ~21% O2 with He").
    """
    if is_null_word(text):
        return None
    s = text.strip()
    q = Quantity(values=[])
    if "~" in s or "approx" in s.lower() or "(?)" in s:
        q.approx = True
    s_clean = s.replace("~", " ").replace("(?)", " ")

    unit_match = re.search(rf"(?<![A-Za-z]){_UNIT_RE}(?![A-Za-z])", s_clean, flags=re.I)
    if unit_match:
        q.unit = unit_match.group(0).lower()

    # Lists: semicolons, or the word "or" between numbers.
    if ";" in s_clean:
        parts = [p for p in re.split(r";|\bor\b", s_clean) if p.strip()]
        nums = [_first_number(p) for p in parts]
        if any(n is None for n in nums):
            return None
        q.values = [n for n in nums if n is not None]
        return q if q.values else None

    # Ranges: "a - b", "a to b", "a%-b%".
    m = re.fullmatch(rf"\s*({_NUM})\s*%?\s*(?:-|–|to)\s*({_NUM})\s*%?\s*{_UNIT_RE}?\s*", s_clean, flags=re.I)
    if m:
        a, b = _to_float(m.group(1)), _to_float(m.group(2))
        if a is None or b is None:
            return None
        q.values, q.is_range = [a, b], True
        return q

    # Single value with an optional unit.
    m = re.fullmatch(rf"\s*({_NUM})\s*{_UNIT_RE}?\s*", s_clean, flags=re.I)
    if m:
        v = _to_float(m.group(1))
        if v is None:
            q.warnings.append(f"ambiguous number {s!r}")
            return None
        q.values = [v]
        return q

    if multi or allow_text:
        # Digits glued to letters are part of names ("O2", "N2", "C2H4"), not values.
        nums = [_to_float(t) for t in re.findall(rf"(?<![A-Za-z\d.]){_NUM}", s_clean)]
        if not nums or any(n is None for n in nums):
            return None
        if re.search(r"[A-Za-z]", re.sub(rf"{_UNIT_RE}", "", s_clean, flags=re.I)) and not allow_text:
            q.approx = True
        q.values = [n for n in nums if n is not None]
        return q
    return None


def _first_number(part: str) -> Optional[float]:
    m = re.search(_NUM, part)
    return _to_float(m.group(0)) if m else None


def convert(values: List[float], unit: Optional[str], default_unit: Optional[str], dimension: str) -> Optional[List[float]]:
    """Convert to the contract unit of `dimension`. The unit written in the cell wins over the column unit."""
    u = (unit or default_unit or "").lower()
    if dimension == "spread":
        factor = SPEED_MM_S.get(u or "mm/s")
        return None if factor is None else [round_value(v * factor) for v in values]
    if not u:
        return [round_value(v) for v in values]
    entry = UNITS.get(u)
    if entry is None:
        return None
    dim, factor = entry
    if dim != dimension:
        return None
    return [round_value(v * factor) for v in values]


# --- dates ------------------------------------------------------------------------

MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


def month_number(text: str) -> Optional[int]:
    t = text.strip().lower().rstrip(".")
    if t.isdigit():
        n = int(t)
        return n if 1 <= n <= 12 else None
    return MONTHS.get(t[:3])


def _iso(y: int, m: int, d: int) -> Optional[str]:
    try:
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def parse_date(text: Optional[str], fmt: str) -> Optional[str]:
    """Supported formats: m/d/y, d-mon-yy, yyyy-mon-dd (prefix), yyddd, gmt-doy-year."""
    if is_null_word(text):
        return None
    s = text.strip()
    if fmt == "m/d/y":
        m = re.fullmatch(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", s)
        if m:
            y = int(m.group(3))
            return _iso(y + 2000 if y < 100 else y, int(m.group(1)), int(m.group(2)))
    elif fmt == "d-mon-yy":
        m = re.fullmatch(r"(\d{1,2})-([A-Za-z]{3,})-(\d{2,4})", s)
        if m and month_number(m.group(2)):
            y = int(m.group(3))
            return _iso(y + 2000 if y < 100 else y, month_number(m.group(2)), int(m.group(1)))
    elif fmt == "yyyy-mon-dd":
        m = re.match(r"(\d{4})-([A-Za-z]{3,})-(\d{1,2})", s)
        if m and month_number(m.group(2)):
            return _iso(int(m.group(1)), month_number(m.group(2)), int(m.group(3)))
    elif fmt == "yyddd":
        m = re.fullmatch(r"(\d{2})(\d{3})", s)
        if m:
            return _day_of_year(2000 + int(m.group(1)), int(m.group(2)))
    elif fmt == "gmt-doy-year":
        m = re.search(r"GMT\s*(\d{1,3})\s*\((\d{4})\)", s, flags=re.I)
        if m:
            return _day_of_year(int(m.group(2)), int(m.group(1)))
    return None


def _day_of_year(year: int, doy: int) -> Optional[str]:
    if not 1 <= doy <= 366:
        return None
    d = date(year, 1, 1) + timedelta(days=doy - 1)
    return d.isoformat() if d.year == year else None


def date_from_parts(year: Optional[str], month: Optional[str], day: Optional[str]) -> Optional[str]:
    if is_null_word(year) or is_null_word(month) or is_null_word(day):
        return None
    try:
        y, d = int(year.strip()), int(day.strip())
    except ValueError:
        return None
    m = month_number(month)
    return _iso(y, m, d) if m else None


def inches_or_quantity(text: str) -> Optional[float]:
    """Diameter of a rod given as '1/4"', '0.5"' or '3/8' (inches) → mm."""
    inch = _fraction_inches(text)
    if inch is not None:
        return round_value(inch * 25.4)
    m = re.fullmatch(rf"\s*({_NUM})\s*\"\s*", text)
    if m:
        v = _to_float(m.group(1))
        return None if v is None else round_value(v * 25.4)
    return None
