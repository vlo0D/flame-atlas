"""Values a language model read from free-text notes, accepted only with a verbatim quote.

Some investigations record what happened in a test as an operator's note, not as a column
(BASS: "Test Observations and Anomalies" in the As Run Test Matrix). A language model reads each
note ahead of time and writes what it found to a readings file in pipeline/mappings/si/, with the
exact words it relied on. This module decides, with ordinary code, which of those readings go
into the data:

* the quote must be in the note's cell, character for character;
* `outcome` must be a value of the contract; `ignited` a boolean;
* a burn time must be the number written in the quote, with its unit;
* `ignited` and `outcome` must not contradict each other;
* a value the table already has is never replaced.

Anything else is rejected and listed in data/review/si-notes-rejected.csv. The model is not
called here: a rebuild reads the same file and gives the same result.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

FIELDS = ("ignited", "outcome", "burnTimeS")
OUTCOMES = ("self-extinguished", "flow-terminated", "burned-out", "blowoff", "disruption", "not-ignited", "other")
MAX_BURN_TIME_S = 3600

# "40 s", "4 seconds", "~ 4.75 min", "2 minute"
_DURATION = re.compile(r"(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?)\b", re.IGNORECASE)


def load_readings(mappings_dir: Path, spec: Dict[str, Any]) -> Dict[str, Any]:
    """The readings file named by a mapping's `siNotes.readings`, relative to pipeline/mappings/."""
    path = mappings_dir / spec["readings"]
    data = json.loads(path.read_text(encoding="utf-8"))
    for key in ("model", "sourceFile", "readings"):
        if key not in data:
            raise KeyError(f"{path.name}: missing {key!r}")
    data["readings"] = {" | ".join(part.strip().lower() for part in k.split("|")): v
                        for k, v in data["readings"].items()}
    return data


def durations_in(quote: str) -> List[float]:
    """Every duration written in the quote, in seconds."""
    out = []
    for number, unit in _DURATION.findall(quote):
        out.append(float(number) * (60 if unit.lower().startswith("m") else 1))
    return out


def _problem(field: str, entry: Any, text: str, current: Any) -> Optional[str]:
    """Why a reading cannot be accepted, or None when it can."""
    if not isinstance(entry, dict) or "value" not in entry:
        return "the reading has no value"
    value, quote = entry["value"], entry.get("quote")
    if current is not None:
        return "the table already has a value for this field"
    if not isinstance(quote, str) or not quote.strip():
        return "no quote"
    if quote not in text:
        return "the quote is not in the note word for word"
    if field == "ignited":
        if not isinstance(value, bool):
            return "ignited must be true or false"
    elif field == "outcome":
        if value not in OUTCOMES:
            return f"{value!r} is not an outcome of the contract"
    elif field == "burnTimeS":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 < value <= MAX_BURN_TIME_S:
            return f"burn time must be a number of seconds between 0 and {MAX_BURN_TIME_S}"
        if not any(abs(found - value) < 1e-6 for found in durations_in(quote)):
            return "the quote does not state this duration"
    return None


def read_note(text: Optional[str], reading: Optional[Dict[str, Any]], current: Dict[str, Any],
              ) -> Tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    """Accepted readings {field: {"value", "quote"}} and rejected ones [{"field", "value", "quote", "reason"}].

    `text` is the note's cell, `reading` the model's entry for this row, `current` the record so far.
    """
    accepted: Dict[str, Dict[str, Any]] = {}
    rejected: List[Dict[str, Any]] = []
    if not reading:
        return accepted, rejected

    def reject(field: str, entry: Any, reason: str) -> None:
        entry = entry if isinstance(entry, dict) else {}
        rejected.append({"field": field, "value": entry.get("value"), "quote": entry.get("quote"), "reason": reason})

    for field in FIELDS:
        entry = reading.get(field)
        if entry is None:
            continue  # the model found nothing in the note for this field
        reason = _problem(field, entry, text or "", current.get(field))
        if reason:
            reject(field, entry, reason)
        else:
            accepted[field] = {"value": entry["value"], "quote": entry["quote"]}

    # The two fields describe one event; a contradiction rejects both.
    ignited = accepted.get("ignited", {}).get("value", current.get("ignited"))
    outcome = accepted.get("outcome", {}).get("value", current.get("outcome"))
    contradiction = (ignited is True and outcome == "not-ignited") or (
        ignited is False and outcome not in (None, "not-ignited"))
    if contradiction:
        for field in ("ignited", "outcome"):
            if field in accepted:
                reject(field, accepted.pop(field), "ignited and outcome contradict each other")
    return accepted, rejected
