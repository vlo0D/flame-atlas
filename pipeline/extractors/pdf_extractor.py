"""PDF → one text block per page, plus detected tables (low confidence).

Text and tables use separate functions. PDF tables are a heuristic of pdfplumber: they are
marked `confidence: "low"` and should be cross-checked before any number is used.
Pages without a text layer (scans) produce a warning; OCR is out of scope.
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from pipeline.extractors.base import ExtractionResult, Extractor, TableBlock, TextBlock
from pipeline.extractors.tables import grid_to_table


def _page_text(page) -> Optional[TextBlock]:
    text = (page.extract_text() or "").strip()
    if not text:
        return None
    return TextBlock(text=text, kind="page", location={"page": page.page_number})


def _page_tables(page, max_rows: Optional[int]) -> Tuple[List[TableBlock], List[str]]:
    tables: List[TableBlock] = []
    warnings: List[str] = []
    for k, grid in enumerate(page.extract_tables() or [], start=1):
        grid = [[(c or "").strip() for c in row] for row in grid if row]
        if len(grid) < 2:
            continue
        table, w = grid_to_table(grid, name=f"Page {page.page_number} table {k}",
                                 location={"page": page.page_number, "table": k},
                                 confidence="low", max_rows=max_rows)
        warnings.extend(w)
        if table is not None and table.rows:
            tables.append(table)
    return tables, warnings


class PdfExtractor(Extractor):
    name = "pdf"
    version = "1.1.0"
    extensions = ("pdf",)

    def extract(self, path: Path) -> ExtractionResult:
        import pdfplumber

        result = ExtractionResult()
        with_tables = self.options.get("pdfTables", True)
        max_pages = self.options.get("pdfMaxPages")
        empty_pages = 0
        with pdfplumber.open(str(path)) as pdf:
            result.pages = len(pdf.pages)
            for i, page in enumerate(pdf.pages):
                if max_pages is not None and i >= max_pages:
                    result.warnings.append(f"stopped after {max_pages} of {result.pages} pages")
                    result.status = "partial"
                    break
                try:
                    block = _page_text(page)
                    if block:
                        result.blocks.append(block)
                    else:
                        empty_pages += 1
                    if with_tables:
                        tables, warnings = _page_tables(page, self.row_limit())
                        for t in tables:
                            self.count_rows(t)
                        result.blocks.extend(tables)
                        result.warnings.extend(warnings)
                except Exception as exc:  # one broken page must not lose the whole document
                    result.warnings.append(f"page {page.page_number}: {type(exc).__name__}: {exc}")
                    result.status = "partial"
                finally:
                    page.close()  # free pdfminer layout cache on long reports
        if result.pages and empty_pages == result.pages:
            result.status = "partial"
            result.warnings.append("no-text-layer: no page has extractable text (scanned PDF?)")
        elif empty_pages:
            result.warnings.append(f"{empty_pages} page(s) without extractable text")
        return result
