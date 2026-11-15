"""DOCX → text blocks and tables in document order.

Text and tables are handled by separate functions (`_paragraph_block`, `_table_block`);
the body walker only dispatches. Paragraph numbers count every body paragraph, empty ones
included, so `location.paragraph` is stable for citations.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional, Tuple

from pipeline.extractors.base import ExtractionResult, Extractor, TableBlock, TextBlock
from pipeline.extractors.tables import grid_to_table

_HEADING = re.compile(r"^(heading|überschrift|titre)\s*(\d+)$", re.I)


def _paragraph_block(par, index: int) -> Optional[TextBlock]:
    text = par.text.strip()
    if not text:
        return None
    style = par.style.name if par.style is not None else None
    kind, level = "paragraph", None
    if style:
        m = _HEADING.match(style.strip())
        if m:
            kind, level = "heading", int(m.group(2))
        elif style.strip().lower() == "title":
            kind, level = "heading", 0
        elif style.strip().lower() == "caption":
            kind = "caption"
        elif "list" in style.lower():
            kind = "list-item"
    if kind == "paragraph" and par._p.pPr is not None and par._p.pPr.numPr is not None:
        kind = "list-item"
    return TextBlock(text=text, kind=kind, level=level, style=style, location={"paragraph": index})


def _table_block(table, index: int, max_rows: Optional[int]) -> Tuple[Optional[TableBlock], List[str]]:
    grid = []
    for row in table.rows:
        # Merged cells repeat their text in every grid position they span; this keeps columns aligned.
        grid.append([cell.text.strip() for cell in row.cells])
    return grid_to_table(grid, name=f"Table {index}", location={"table": index}, max_rows=max_rows)


class DocxExtractor(Extractor):
    name = "docx"
    version = "1.1.0"
    extensions = ("docx",)

    def extract(self, path: Path) -> ExtractionResult:
        from docx import Document
        from docx.table import Table
        from docx.text.paragraph import Paragraph

        result = ExtractionResult()
        doc = Document(str(path))
        p_index = t_index = 0
        for child in doc.element.body.iterchildren():
            tag = child.tag.rsplit("}", 1)[-1]
            if tag == "p":
                p_index += 1
                block = _paragraph_block(Paragraph(child, doc), p_index)
                if block:
                    result.blocks.append(block)
            elif tag == "tbl":
                t_index += 1
                table, warnings = _table_block(Table(child, doc), t_index, self.row_limit())
                self.count_rows(table)
                result.warnings.extend(warnings)
                if table is not None:
                    result.blocks.append(table)
        if not result.blocks:
            result.status = "partial"
            result.warnings.append("document has no text or tables")
        return result
