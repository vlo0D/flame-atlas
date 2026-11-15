"""XLSX → one table per non-empty sheet (cached cell values, not formulas)."""
from __future__ import annotations

from pathlib import Path

from pipeline.extractors.base import ExtractionResult, Extractor
from pipeline.extractors.tables import cell_to_str, grid_to_table


class XlsxExtractor(Extractor):
    name = "xlsx"
    version = "1.1.0"
    extensions = ("xlsx", "xlsm")

    def extract(self, path: Path) -> ExtractionResult:
        from openpyxl import load_workbook  # local import: optional dependency per format

        result = ExtractionResult()
        wb = load_workbook(path, read_only=True, data_only=True)
        try:
            for ws in wb.worksheets:
                max_rows = self.row_limit()
                grid = []
                for row in ws.iter_rows(values_only=True):
                    grid.append([cell_to_str(v) for v in row])
                    if max_rows is not None and len(grid) > max_rows + 50:
                        break
                table, warnings = grid_to_table(grid, name=ws.title, location={"sheet": ws.title},
                                                max_rows=max_rows)
                result.warnings.extend(warnings)
                self.count_rows(table)
                if table is not None:
                    result.blocks.append(table)
                else:
                    result.warnings.append(f"sheet {ws.title!r} is empty")
        finally:
            wb.close()
        if not result.blocks:
            result.status = "partial"
            result.warnings.append("no non-empty sheets")
        return result
