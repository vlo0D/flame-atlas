"""PSI metadata → fields named as in the contract's `Investigation` (contracts/types.ts).

Only facts present in the metadata are filled; everything else is null. Fields that need
judgement (pillars, fuels, conditions, claims) are left to later pipeline stages.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

_PAREN = re.compile(r"\(([^()]+)\)\s*$")
_YEAR = re.compile(r"(\d{4})")

TEXT_FIELDS = {
    "objective": "objective",
    "approach": "approach",
    "hypothesis": "hypothesis",
    "researchImpacts": "researchImpacts",
    "description": "description",
}


def short_name(value: Optional[str]) -> Optional[str]:
    """'International Space Station (ISS)' → 'ISS'; plain names are returned as is."""
    if not value or not value.strip():
        return None
    m = _PAREN.search(value.strip())
    return m.group(1).strip() if m else value.strip()


def year_of(value: Optional[str]) -> Optional[int]:
    """Year from PSI dates such as '01-01-2010' or '31-Dec-2022'."""
    if not value:
        return None
    m = _YEAR.search(value)
    return int(m.group(1)) if m else None


def _str(value: Any) -> Optional[str]:
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def kind_of(project_type: Optional[str]) -> Optional[str]:
    if not project_type:
        return None
    pt = project_type.lower()
    if "ground" in pt:
        return "ground"
    if "microgravity" in pt or "flight" in pt:
        return "flight"
    return None


def publications(details: Dict[str, Any]) -> List[Dict[str, Any]]:
    out = []
    for p in details.get("publications") or []:
        title = _str(p.get("title"))
        if not title:
            continue
        out.append({"title": title, "year": year_of(_str(p.get("year")) or _str(p.get("date"))),
                    "doi": _str(p.get("doi"))})
    return out


def to_record(details: Dict[str, Any], psi_url: str) -> Dict[str, Any]:
    doi = _str(details.get("doi"))
    texts = {key: _str(details.get(src)) for key, src in TEXT_FIELDS.items()}
    return {
        "id": details.get("accession"),
        "acronym": _str(details.get("investigationAcronym")),
        "title": _str(details.get("title")) or details.get("accession"),
        "doi": doi,
        "url": f"https://doi.org/{doi}" if doi else psi_url,
        "psiUrl": psi_url,
        "kind": kind_of(details.get("projectType")),
        "platform": short_name(details.get("flightProgram")),
        "facility": short_name(details.get("experimentHardware")),
        "yearStart": year_of(details.get("investigationStartDate")),
        "yearEnd": year_of(details.get("investigationEndDate")),
        "researchArea": _str(details.get("researchArea")),
        "subResearchArea": _str(details.get("subResearchArea")),
        "managingCenter": _str(details.get("managingNasaCenter")),
        "license": _str(details.get("licenseIdentifier")),
        "version": details.get("version"),
        "texts": texts,
        "publications": publications(details),
        "derived": ["platform", "facility", "kind", "yearStart", "yearEnd", "url"],
    }
