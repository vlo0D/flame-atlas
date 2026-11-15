"""Grid helpers shared by table extractors: header detection, unique keys, cell → string."""
from __future__ import annotations

import datetime as _dt
from typing import Any, List, Optional, Sequence, Tuple

from pipeline.extractors.base import TableBlock, TableRow


def cell_to_str(value: Any) -> str:
    """Render a cell value as the string a person would read in the source. None → ""."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        if value.is_integer() and abs(value) < 1e15:
            return str(int(value))
        return repr(value)
    if isinstance(value, _dt.datetime):
        return value.isoformat(sep=" ") if (value.hour or value.minute or value.second) else value.date().isoformat()
    if isinstance(value, (_dt.date, _dt.time)):
        return value.isoformat()
    return str(value)


def is_blank(row: Sequence[str]) -> bool:
    return all(not (c or "").strip() for c in row)


def trim_trailing_blank_columns(grid: List[List[str]]) -> List[List[str]]:
    width = 0
    for row in grid:
        for i in range(len(row) - 1, -1, -1):
            if (row[i] or "").strip():
                width = max(width, i + 1)
                break
    return [list(row[:width]) + [""] * (width - len(row[:width])) for row in grid]


def find_header(grid: List[List[str]]) -> Optional[int]:
    """Index of the header row: the first row that fills at least half of the table width.

    Spreadsheets often start with a title line ("BASS-II test matrix") above the real header;
    that line fills one cell and is skipped. Returns None for an empty grid.
    """
    width = max((sum(1 for c in r if (c or "").strip()) for r in grid), default=0)
    if width == 0:
        return None
    need = max(1, (width + 1) // 2) if width > 1 else 1
    for i, row in enumerate(grid):
        if sum(1 for c in row if (c or "").strip()) >= need:
            return i
    return None


def unique_columns(header: Sequence[str]) -> Tuple[List[str], List[str]]:
    """Column keys equal to the header text verbatim; blanks and duplicates get suffixes."""
    cols: List[str] = []
    empty: List[int] = []
    dup: List[str] = []
    seen: dict = {}
    for i, name in enumerate(header, start=1):
        key = name if (name or "").strip() else f"column_{i}"
        if key != name:
            empty.append(i)
        if key in seen:
            seen[key] += 1
            key = f"{key} ({seen[key]})"
            dup.append(key)
        else:
            seen[key] = 1
        cols.append(key)
    warnings: List[str] = []
    if empty:
        warnings.append(f"{len(empty)} empty header(s) named column_<n> (columns {_ranges(empty)})")
    if dup:
        warnings.append(f"{len(dup)} duplicate header(s) renamed: {', '.join(dup[:5])}{' ...' if len(dup) > 5 else ''}")
    return cols, warnings


def _ranges(nums: List[int]) -> str:
    """[1, 2, 3, 7] -> '1-3, 7'"""
    out, start, prev = [], None, None
    for n in nums + [None]:
        if start is None:
            start = prev = n
        elif n is not None and n == prev + 1:
            prev = n
        else:
            out.append(f"{start}-{prev}" if prev != start else str(start))
            start = prev = n
    return ", ".join(out)


def grid_to_table(grid: List[List[str]], name: str, location: dict, *, confidence: str = "high",
                  max_rows: Optional[int] = None, row_offset: int = 0) -> Tuple[Optional[TableBlock], List[str]]:
    """Turn a raw grid into a TableBlock.

    `sourceRow` numbers data rows from 1 (the first row after the header), counting blank rows too,
    so it always matches a line in the source file. Fully blank rows are dropped.
    `row_offset` is added to `headerRow` when the grid is a slice of a larger source.
    """
    warnings: List[str] = []
    grid = trim_trailing_blank_columns([[c if c is not None else "" for c in r] for r in grid])
    h = find_header(grid)
    if h is None:
        return None, warnings
    if h > 0:
        warnings.append(f"{name}: {h} line(s) above the header skipped")
    columns, w = unique_columns(grid[h])
    warnings.extend(f"{name}: {x}" for x in w)

    rows: List[TableRow] = []
    truncated = False
    for n, row in enumerate(grid[h + 1:], start=1):
        if is_blank(row):
            continue
        if max_rows is not None and len(rows) >= max_rows:
            truncated = True
            warnings.append(f"{name}: truncated at {max_rows} rows")
            break
        if len(row) > len(columns):
            extra = [c for c in row[len(columns):] if (c or "").strip()]
            if extra:
                warnings.append(f"{name}: row {n} has {len(extra)} value(s) beyond the header")
        cells = list(row[:len(columns)]) + [""] * (len(columns) - len(row))
        rows.append(TableRow(source_row=n, raw=dict(zip(columns, cells))))
    table = TableBlock(name=name, columns=columns, rows=rows, location=location,
                       header_row=h + 1 + row_offset, confidence=confidence, truncated=truncated)
    return table, warnings
