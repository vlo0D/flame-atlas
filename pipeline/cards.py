"""Investigation cards (contract `Investigation`) from PSI metadata + tests.json.

* Identification, years, publications: PSI metadata (verbatim).
* Pillars, platform, facility, insert: pipeline/config/contract.json (team decision, not metadata).
* Fuels, conditions, testStats: computed from the normalized test rows.
* Claims (summary, objectives, measurements, fireSafetyRelevance): verbatim sentences of the PSI
  text fields, selected by fixed rules. Every quote is checked to be a substring of its source
  text; a claim whose quote is not found is dropped (AGENTS.md §2.5). No LLM is involved.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

from pipeline import investigation

_SENTENCE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\"'])|\n+")
_ENUM_ITEM = re.compile(r"(?:^|\s)\(?(\d{1,2})[).]\s+(.+?)(?=\s+\(?\d{1,2}[).]\s+|\n|$)", re.S)
MEASURE = re.compile(r"\b(measure[sd]?|measurements?|diagnostic\w*|camera\w*|sensor\w*|thermocouple\w*|radiometer\w*|"
                     r"images|spectro\w*|video|photograph\w*|photomultiplier\w*|recorded)\b", re.I)
# Sentences that mention a camera or a measurement but describe set-up or samples, not what was measured.
NOT_MEASURE = re.compile(r"\b(installed|attached|positioned|fuel source|sample material)\b", re.I)
# A summary sentence split only at sentence ends, so a lead-in such as "The objectives are to:" stays
# joined to the first item it introduces.
_SUMMARY_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\"'])")
# Objective sentences about running the project rather than its science.
GENERIC_SUMMARY = re.compile(r"^(?:\(?[A-Za-z0-9]{1,2}[.)]\s*)?(plan and support|support the flight)\b", re.I)
MAX_SUMMARY_CHARS = 400
_LIST_MARKER_END = re.compile(r"(?:^|\s)\(?[A-Za-z0-9]{1,2}[.)]$")
_LIST_MARKER_START = re.compile(r"^\(?[0-9]{1,2}[.)]+\s+")
SAFETY = re.compile(r"\b(fire\w*|safety|flammab\w*|suppress\w*|extinguish\w*|detect\w*|smoke|spacecraft|crew\w*)\b", re.I)
MAX_CLAIMS = 5
DILUENT_TOKENS = re.compile(r"\b(N2|CO2|He|Ar)\b")


def sentences(text: Optional[str]) -> List[str]:
    if not text:
        return []
    return [s.strip() for s in _SENTENCE.split(text) if s and len(s.strip()) > 20]


def summary_sentences(text: Optional[str]) -> List[str]:
    """Candidates for the one-line summary: whole sentences, never a bare lead-in ending with ':'."""
    if not text:
        return []
    # Rejoin a list marker such as "A." or "1." with the item it opens, keeping the original whitespace
    # so every chunk stays a verbatim substring of the source.
    parts = _SUMMARY_SPLIT.split(text)
    seps = _SUMMARY_SPLIT.findall(text)
    chunks: List[str] = []
    pending = ""
    for i, part in enumerate(parts):
        pending += part
        if i < len(seps) and _LIST_MARKER_END.search(part):
            pending += seps[i]
            continue
        chunks.append(pending)
        pending = ""
    if pending:
        chunks.append(pending)
    out = []
    for chunk in chunks:
        chunk = chunk.strip()
        if len(chunk) <= 20 or GENERIC_SUMMARY.match(chunk):
            continue
        if len(chunk) > MAX_SUMMARY_CHARS:  # several paragraphs without a full stop: fall back to lines
            out.extend(s for s in sentences(chunk) if not s.endswith(":") and not GENERIC_SUMMARY.match(s))
        elif not chunk.endswith(":"):
            out.append(chunk)
    return out


def enumerated(text: Optional[str]) -> List[str]:
    """Items of '1) ... 2) ...' lists; empty when the text has fewer than two items."""
    if not text:
        return []
    items = [m.group(2).strip().rstrip(";,") for m in _ENUM_ITEM.finditer(text)]
    return items if len(items) >= 2 else []


def collapse(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


class ClaimBuilder:
    def __init__(self, inv_id: str, url: str, texts: Dict[str, Optional[str]]):
        self.inv_id, self.url, self.texts = inv_id, url, texts
        self.dropped = 0

    def claim(self, field: str, quote: str) -> Optional[Dict[str, Any]]:
        source = self.texts.get(field) or ""
        if not quote or quote not in source:  # programmatic quote check
            self.dropped += 1
            return None
        return {"text": collapse(quote),
                "citations": [{"label": f"{self.inv_id} PSI metadata: {field}", "url": self.url, "quote": quote}]}

    def many(self, field: str, quotes: List[str]) -> List[Dict[str, Any]]:
        out, seen = [], set()
        for q in quotes:
            c = self.claim(field, q)
            if c and c["text"] not in seen:
                seen.add(c["text"])
                out.append(c)
            if len(out) >= MAX_CLAIMS:
                break
        return out


def build_claims(rec: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    texts = rec["texts"]
    cb = ClaimBuilder(rec["id"], rec["psiUrl"], texts)
    objective = sentences(texts.get("objective"))
    first_objective = summary_sentences(texts.get("objective"))
    summary = cb.claim("objective", first_objective[0]) if first_objective else None
    if summary:  # "2. Determine ..." reads as a fragment on its own; the quote keeps the marker
        summary["text"] = _LIST_MARKER_START.sub("", summary["text"])
    if summary is None:
        for field in ("description", "approach"):
            first = summary_sentences(texts.get(field))
            if first:
                summary = cb.claim(field, first[0])
                if summary:
                    break
    if summary is None:  # last resort: the title is a verbatim metadata field too
        cb.texts = dict(texts, title=rec["title"])
        summary = cb.claim("title", rec["title"])
    objectives = cb.many("objective", enumerated(texts.get("objective")) or objective[1:] or objective)
    measurements = cb.many("approach", [s for s in sentences(texts.get("approach"))
                                             if MEASURE.search(s) and not NOT_MEASURE.search(s)])
    safety = cb.many("researchImpacts", [s for s in sentences(texts.get("researchImpacts")) if SAFETY.search(s)])
    return {"summary": summary, "objectives": objectives, "measurements": measurements,
            "fireSafetyRelevance": safety}, cb.dropped


def _range(tests: List[Dict[str, Any]], lo: str, hi: str) -> Tuple[Optional[float], Optional[float]]:
    los = [t[lo] for t in tests if t[lo] is not None]
    his = [t[hi] for t in tests if t[hi] is not None]
    return (min(los) if los else None, max(his) if his else None)


def conditions(tests: List[Dict[str, Any]]) -> Dict[str, Any]:
    o2 = _range(tests, "o2PctMin", "o2PctMax")
    p = _range(tests, "pressureKpaMin", "pressureKpaMax")
    fl = _range(tests, "flowCmSMin", "flowCmSMax")
    diluents = sorted({tok for t in tests for tok in DILUENT_TOKENS.findall(t["diluent"] or "")})
    gravity = sorted({t["gravity"] for t in tests})
    return {"o2PctMin": o2[0], "o2PctMax": o2[1], "pressureKpaMin": p[0], "pressureKpaMax": p[1],
            "flowCmSMin": fl[0], "flowCmSMax": fl[1], "diluents": diluents, "gravity": gravity}


def fuels(tests: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    counts = Counter((t["fuelName"], t["fuelState"], t["fuelGeometry"]) for t in tests
                     if t["fuelName"] and t["fuelState"])
    return [{"name": n, "state": s, "geometry": g} for (n, s, g), _ in counts.most_common()]


def fuel_analog(inv_id: str, details: Dict[str, Any], spec: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Contract 1.1.0 `fuelAnalogOf`: only from pipeline/config/contract.json, with a verbatim quote."""
    if not spec:
        return None
    source = details.get(spec["field"]) or ""
    if spec["quote"] not in source:  # programmatic quote check: no quote, no claim
        raise ValueError(f"{inv_id}: fuelAnalogOf quote not found verbatim in PSI metadata field {spec['field']!r}")
    return {
        "states": list(spec["states"]),
        "claim": {"text": spec["text"],
                  "citations": [{"label": f"{inv_id} metadata: {spec['field']}", "url": spec["url"],
                                 "quote": spec["quote"]}]},
    }


def build_card(details: Dict[str, Any], psi_url: str, tests: List[Dict[str, Any]],
               curated: Dict[str, Any], curated_source: str,
               analogs: Optional[Dict[str, Any]] = None) -> Tuple[Dict[str, Any], int]:
    rec = investigation.to_record(details, psi_url)
    claims, dropped = build_claims(rec)
    cur = curated.get(rec["id"])
    if cur is None:
        raise KeyError(f"{rec['id']}: no entry in pipeline/config/contract.json 'investigations' "
                       "(pillarPrimary is required by the contract)")
    card = {
        "id": rec["id"],
        "acronym": rec["acronym"],
        "title": rec["title"],
        "doi": rec["doi"],
        "url": rec["url"],
        "kind": rec["kind"] or "flight",
        "platform": cur.get("platform"),
        "facility": cur.get("facility"),
        "insert": cur.get("insert"),
        "yearStart": rec["yearStart"],
        "yearEnd": rec["yearEnd"],
        "pillarPrimary": cur["pillarPrimary"],
        "pillarsSecondary": list(cur.get("pillarsSecondary") or []),
        "fuelStates": sorted({t["fuelState"] for t in tests if t["fuelState"]}),
        "fuels": fuels(tests),
        "fuelAnalogOf": fuel_analog(rec["id"], details, (analogs or {}).get(rec["id"])),
        "conditions": conditions(tests),
        "summary": claims["summary"],
        "objectives": claims["objectives"],
        "measurements": claims["measurements"],
        "fireSafetyRelevance": claims["fireSafetyRelevance"],
        "testStats": {
            "tableFiles": sorted({t["tableFile"] for t in tests}),
            "rowCount": len(tests),
            "granularities": sorted({t["granularity"] for t in tests}),
        },
        "publications": rec["publications"],
        "review": {
            "status": "unreviewed",
            "by": None,
            "notes": ("Generated by pipeline/build.py. Claims are verbatim sentences of the PSI metadata, quotes "
                      f"checked by code. Pillars, platform, facility and insert: {curated_source}."),
        },
    }
    return card, dropped
