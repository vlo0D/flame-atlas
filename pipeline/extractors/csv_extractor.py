"""CSV → one table. Cells are kept verbatim as strings; nothing is parsed as a number."""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import List, Tuple

from pipeline.extractors.base import ExtractionResult, Extractor
from pipeline.extractors.tables import grid_to_table

DEFAULT_ENCODINGS = ["utf-8-sig", "cp1252", "latin-1"]


def decode(data: bytes, encodings: List[str]) -> Tuple[str, str]:
    for enc in encodings:
        try:
            return data.decode(enc), enc
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1", errors="replace"), "latin-1(replace)"


class CsvExtractor(Extractor):
    name = "csv"
    version = "1.1.0"
    extensions = ("csv",)

    def extract(self, path: Path) -> ExtractionResult:
        result = ExtractionResult()
        text, enc = decode(path.read_bytes(), self.options.get("csvEncodings") or DEFAULT_ENCODINGS)
        if enc not in ("utf-8-sig", "utf-8"):
            result.warnings.append(f"decoded as {enc}, not UTF-8")
        text = text.lstrip("﻿")  # a second BOM survives some exports

        try:
            dialect = csv.Sniffer().sniff(text[:8192], delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        grid = [row for row in csv.reader(io.StringIO(text, newline=""), dialect)]

        table, warnings = grid_to_table(grid, name=path.stem, location={}, max_rows=self.row_limit())
        result.warnings.extend(warnings)
        if table is None:
            result.status = "partial"
            result.warnings.append("no table found (empty file)")
        else:
            result.blocks.append(table)
        return result
