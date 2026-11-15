"""Fuel cell → name, state, geometry and sample dimensions.

Rules are deterministic and conservative: a dimension is filled only when the cell says
what it is ("2 cm wide", "100 micron", '1/4" rod', "2 cm sphere"). Everything the rules
do not recognise stays null; the original text is always kept in `fuelRaw`.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from pipeline.normalize.values import inches_or_quantity, round_value

# (pattern, canonical name, state, default geometry). First match wins.
MATERIALS = [
    (r"\bpmma\s*&\s*nomex\b", "PMMA and Nomex", "solid", None),
    (r"\bpmma\b", "PMMA", "solid", None),
    (r"\b(sibal|cotton-fiberglass)\b", "SIBAL fabric", "solid", "fabric"),
    (r"\bnomex\b", "Nomex", "solid", "fabric"),
    (r"\bsilicone\b", "Silicone", "solid", "sheet"),
    (r"\bkapton\b", "Kapton", "solid", None),
    (r"\bteflon\b", "Teflon", "solid", None),
    (r"\blampwick\b", "Lampwick", "solid", None),
    (r"\bpyrell\b", "Pyrell", "solid", None),
    (r"\bultem\b", "Ultem", "solid", "sheet"),
    (r"\bjapan wax\b", "Japan wax", "solid", None),
    (r"\b(paraffin|parrafin)\b", "Paraffin wax", "solid", None),
    (r"\bcandle\b", "Wax", "solid", "candle"),
    (r"\bwax\b", "Wax", "solid", None),
    (r"\bdibutyl phthalate\b", "Dibutyl phthalate", "liquid", None),
    (r"\barizona road dust\b", "Arizona Road Dust (ARD Fine)", "aerosol", None),
]

GEOMETRIES = [
    (r"\bcandle\b", "candle"),
    (r"\bspher(e|ical)\b", "sphere"),
    (r"\brod\b", "rod"),
    (r"\bslab\b", "slab"),
    (r"\bfilm\b", "film"),
    (r"\bsheet\b", "sheet"),
    (r"\bfabric\b", "fabric"),
]

# Spreadsheet auto-increment artifacts seen in ACME tables: "CH5"…"CH14" after "CH4",
# "C2H5"…"C2H11" after "C2H4", "N3"…"N6" after "N2". C2H6 (ethane) is a real fuel in SLICE,
# so artifacts are only fixed where the mapping enables `fixAutoIncrement`.
_AUTOINC = [(re.compile(r"^C2H(\d+)$"), "C2H4"), (re.compile(r"^CH(\d+)$"), "CH4"), (re.compile(r"^N(\d+)$"), "N2")]


def fix_autoincrement(token: str) -> str:
    for pattern, canonical in _AUTOINC:
        if pattern.match(token) and token != canonical:
            return canonical
    return token


@dataclass
class Fuel:
    name: Optional[str] = None
    state: Optional[str] = None
    geometry: Optional[str] = None
    thickness_mm: Optional[float] = None
    width_mm: Optional[float] = None
    diameter_mm: Optional[float] = None
    inferred: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    confidence: str = "high"


def parse_solid(text: str, cfg: Dict[str, Any]) -> Fuel:
    low = text.lower()
    f = Fuel(state="solid")
    for pattern, name, state, geom in MATERIALS:
        if re.search(pattern, low):
            f.name, f.state, f.geometry = name, state, geom
            break
    for pattern, geom in GEOMETRIES:
        if re.search(pattern, low):
            f.geometry = geom
            break
    if f.name is None and cfg.get("defaultMaterial") and f.geometry in (cfg.get("defaultMaterialFor") or []):
        f.name = cfg["defaultMaterial"]
        f.inferred.append("fuelName")
        f.notes.append(cfg.get("defaultMaterialNote") or f"Material {f.name} taken from the investigation documents.")
        f.confidence = "medium"

    # Thickness: "100 micron", "0.2 mm" next to "thick" or film/slab context, "1 mm thick".
    m = re.search(r"(\d+(?:\.\d+)?)\s*micron", low)
    if m:
        f.thickness_mm = round_value(float(m.group(1)) / 1000)
    else:
        m = re.search(r"(\d+(?:\.\d+)?)\s*mm\b(?:\s*thick)?", low)
        if m and f.geometry in ("film", "slab", "sheet", None) and "rod" not in low:
            f.thickness_mm = round_value(float(m.group(1)))

    # Width: "2 cm wide"; a bare "N cm" next to a film, slab or fabric is the strip width.
    m = re.search(r"(\d+(?:\.\d+)?)\s*cm\s*wide", low)
    if m:
        f.width_mm = round_value(float(m.group(1)) * 10)
    elif f.geometry in ("film", "slab", "fabric", "sheet"):
        m = re.search(r"(\d+(?:\.\d+)?)\s*cm\b(?!\s*thick)", low)
        if m:
            f.width_mm = round_value(float(m.group(1)) * 10)

    # Diameter: spheres "2 cm sphere", rods '1/4" rod', '0.5" black rod', '1/4 black rod'.
    if f.geometry == "sphere":
        m = re.search(r"(\d+(?:\.\d+)?)\s*cm", low)
        if m:
            f.diameter_mm = round_value(float(m.group(1)) * 10)
    elif f.geometry == "rod":
        m = re.match(r'\s*(\d+/\d+|\d*\.\d+|\d+)\s*(")?', text)
        if m and ("/" in m.group(1) or m.group(2)):
            f.diameter_mm = inches_or_quantity(m.group(1) + '"')
            if f.diameter_mm is not None and not m.group(2):
                f.notes.append("Rod diameter read as inches (no unit in the source cell).")
                f.confidence = "medium"
    if "opposed" in low or "oppsed" in low:
        f.notes.append("Source cell mentions opposed flow.")
    return f


_PCT_PREFIX = re.compile(r"^\s*\d+(?:\.\d+)?\s*%\s*")
_FORMULA = re.compile(r"\b(C\d*H\d+|H2|CH\d+)\b")


def parse_gas(text: str, cfg: Dict[str, Any]) -> Fuel:
    """'100% C2H4', '20% C2H4 (balance N2)', '44.4% H2 with CH4', 'Ethylene', '30% butane'."""
    f = Fuel(state="gas", geometry=cfg.get("geometry", "burner"))
    s = text.strip()
    tokens = _FORMULA.findall(s)
    if tokens:
        fixed = [fix_autoincrement(t) if cfg.get("fixAutoIncrement") else t for t in tokens]
        if fixed != tokens:
            f.notes.append(f"Fuel cell {s!r} shows a spreadsheet auto-increment artifact; read as {'/'.join(dict.fromkeys(fixed))}.")
            f.inferred.append("fuelName")
            f.confidence = "low"
        f.name = "/".join(dict.fromkeys(fixed))
    else:
        name = _PCT_PREFIX.sub("", s)
        name = re.sub(r"\(.*?\)", "", name).strip()
        name = re.split(r"\s+(?:with|including|where)\b", name)[0].strip()
        f.name = name or None
    if _PCT_PREFIX.match(s) and not s.strip().startswith("100"):
        f.notes.append(f"Fuel stream: {s}.")
    return f


def parse_liquid(text: str, cfg: Dict[str, Any]) -> Fuel:
    """'Methanol', 'IsoOctane (pure)', 'Heptane (50%) IsoOctane (50%) (mixture)', 'C12H26'."""
    f = Fuel(state="liquid", geometry=cfg.get("geometry", "droplet"))
    s = text.strip()
    f.name = re.sub(r"\s*\(pure\)\s*$", "", s).strip() or None
    return f


def parse_fuel(text: Optional[str], cfg: Dict[str, Any]) -> Fuel:
    if text is None or not text.strip():
        return Fuel()
    kind = cfg.get("parser", "plain")
    cleaned = text.strip()
    if cfg.get("stripAfter"):
        cleaned = re.split(cfg["stripAfter"], cleaned)[0].strip()
    if kind == "solid":
        f = parse_solid(cleaned, cfg)
    elif kind == "gas":
        f = parse_gas(cleaned, cfg)
    elif kind == "liquid":
        f = parse_liquid(cleaned, cfg)
    else:
        f = Fuel(name=cleaned, state=cfg.get("state"), geometry=cfg.get("geometry"))
        low = cleaned.lower()
        for pattern, name, state, geom in MATERIALS:
            if re.search(pattern, low):
                f.name, f.state = name, state
                f.geometry = f.geometry or geom
                break
    if cfg.get("state") and f.state is None:
        f.state = cfg["state"]
    if cfg.get("geometry") and f.geometry is None:
        f.geometry = cfg["geometry"]
    return f
