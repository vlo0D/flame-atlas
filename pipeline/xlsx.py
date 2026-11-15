"""Minimal .xlsx reader on the standard library: cell text by sheet and cell reference.

Values are returned as the strings stored in the file (shared strings resolved, numbers as written),
so a filled value can always be traced to an exact sheet and cell.
"""

from __future__ import annotations

import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
PKG_REL = "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship"


def col_index(ref: str) -> int:
    """'B12' -> 2 (1-based column number)."""
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(0):
        n = n * 26 + ord(ch) - 64
    return n


def row_index(ref: str) -> int:
    return int(re.search(r"\d+", ref).group(0))


def read_workbook(path: str | Path) -> dict[str, dict[str, str]]:
    """Return {sheet name: {cell ref: text}} for every non-empty cell."""
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                shared.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        targets = {r.get("Id"): r.get("Target") for r in rels.iter(PKG_REL)}
        book = ET.fromstring(z.read("xl/workbook.xml"))

        sheets: dict[str, dict[str, str]] = {}
        for sheet in book.find("m:sheets", NS):
            target = targets[sheet.get(REL_NS)].lstrip("/")
            target = target if target.startswith("xl/") else "xl/" + target
            root = ET.fromstring(z.read(target))
            cells: dict[str, str] = {}
            for c in root.iter(f"{{{NS['m']}}}c"):
                kind = c.get("t")
                if kind == "inlineStr":
                    text = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                else:
                    v = c.find("m:v", NS)
                    if v is None or v.text is None:
                        continue
                    text = shared[int(v.text)] if kind == "s" else v.text
                if text.strip():
                    cells[c.get("r")] = text
            sheets[sheet.get("name")] = cells
        return sheets


def rows(cells: dict[str, str]) -> dict[int, dict[int, str]]:
    """{row number: {column number: text}} for one sheet."""
    out: dict[int, dict[int, str]] = {}
    for ref, text in cells.items():
        out.setdefault(row_index(ref), {})[col_index(ref)] = text
    return dict(sorted(out.items()))


def col_letter(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s
