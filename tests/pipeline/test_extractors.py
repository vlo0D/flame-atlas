"""Extractor tests: no network, files are generated in a temp folder."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from pipeline import extractors
from pipeline.extractors.base import TableBlock, TextBlock, blocks_to_json, stats
from pipeline.extractors.tables import cell_to_str, find_header, grid_to_table, unique_columns
from pipeline.validate_extracted import validate_document

BASS_II_CSV = (
    "﻿PI,Test #,Date,Fuel Sample Material,Air display,Calibrated initial O2 % by vol\r\n"
    "Bhattacharjee,B1,2/19/2014,100 micron PMMA film   2 cm wide,5,22.2\r\n"
    "\r\n"
    "Olson,B2,2/20/2014,PMMA rod,~ 10, 21.5 - 21.7\r\n"
)


def _doc(result, fmt="csv"):
    """Wrap an ExtractionResult like pipeline.extract does, for schema validation."""
    return {
        "schemaVersion": "1.0.0", "investigationId": "PSI-25", "format": fmt,
        "source": {"fileName": "x." + fmt, "folder": "Science Documents", "subfolder": None,
                   "key": "psi-data/PSI-25/Science Documents/x." + fmt, "version": 1, "sizeBytes": 1,
                   "sha256": "0" * 64, "localPath": "data/raw/PSI-25/x." + fmt,
                   "investigationUrl": "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25"},
        "extractor": {"name": fmt, "version": "1.0.0"}, "extractedAt": "2026-11-14T00:00:00+00:00",
        "status": result.status, "error": None, "warnings": result.warnings, "stats": stats(result),
        "blocks": blocks_to_json(result.blocks),
    }


class TableHelpersTest(unittest.TestCase):
    def test_cell_to_str(self):
        self.assertEqual(cell_to_str(None), "")
        self.assertEqual(cell_to_str(22.0), "22")
        self.assertEqual(cell_to_str(0.389822946), "0.389822946")
        self.assertEqual(cell_to_str(True), "TRUE")

    def test_header_skips_title_line(self):
        grid = [["BASS-II test matrix", "", ""], ["Test", "O2", "Flow"], ["B1", "22.2", "5"]]
        self.assertEqual(find_header(grid), 1)

    def test_unique_columns(self):
        cols, warnings = unique_columns(["A", "", "A"])
        self.assertEqual(cols, ["A", "column_2", "A (2)"])
        self.assertEqual(len(warnings), 2)

    def test_source_row_counts_blank_rows(self):
        table, _ = grid_to_table([["a", "b"], ["1", "2"], ["", ""], ["3", "4"]], "t", {})
        self.assertEqual([r.source_row for r in table.rows], [1, 3])


class CsvTest(unittest.TestCase):
    def test_bom_verbatim_cells_and_rows(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "BASS-II.csv"
            p.write_text(BASS_II_CSV, encoding="utf-8")
            res = extractors.for_extension("csv").extract(p)
        self.assertEqual(res.status, "ok")
        (table,) = res.blocks
        self.assertEqual(table.columns[0], "PI")  # BOM stripped
        self.assertEqual(table.rows[0].raw["Fuel Sample Material"], "100 micron PMMA film   2 cm wide")
        self.assertEqual(table.rows[1].raw["Calibrated initial O2 % by vol"], " 21.5 - 21.7")  # verbatim
        self.assertEqual([r.source_row for r in table.rows], [1, 3])
        self.assertEqual(validate_document(_doc(res), "csv"), [])

    def test_cp1252_fallback(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.csv"
            p.write_bytes("Material,Temp\nKapton,25 \xb0C\n".encode("cp1252"))
            res = extractors.for_extension("csv").extract(p)
        self.assertEqual(res.blocks[0].rows[0].raw["Temp"], "25 °C")
        self.assertTrue(any("cp1252" in w for w in res.warnings))


class XlsxTest(unittest.TestCase):
    def test_each_sheet_is_a_table(self):
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Matrix"
        ws.append(["BASS-II test matrix"])
        ws.append(["Test", "O2 %", "Flow"])
        ws.append(["B1", 22.2, 5])
        wb.create_sheet("Empty")
        notes = wb.create_sheet("Notes")
        notes.append(["Key", "Meaning"])
        notes.append(["OR", "over range"])
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "m.xlsx"
            wb.save(p)
            res = extractors.for_extension("xlsx").extract(p)
        names = [b.name for b in res.blocks]
        self.assertEqual(names, ["Matrix", "Notes"])
        matrix = res.blocks[0]
        self.assertEqual(matrix.header_row, 2)
        self.assertEqual(matrix.location, {"sheet": "Matrix"})
        self.assertEqual(matrix.rows[0].raw, {"Test": "B1", "O2 %": "22.2", "Flow": "5"})
        self.assertEqual(validate_document(_doc(res, "xlsx"), "xlsx"), [])

    def test_row_budget_per_document(self):
        from openpyxl import Workbook

        wb = Workbook()
        for title in ("A", "B"):
            ws = wb.create_sheet(title)
            ws.append(["n"])
            for i in range(30):
                ws.append([i])
        del wb["Sheet"]
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "big.xlsx"
            wb.save(p)
            res = extractors.for_extension("xlsx", {"maxRowsPerDocument": 40}).extract(p)
        a, b = res.blocks
        self.assertEqual((len(a.rows), a.truncated), (30, False))
        self.assertEqual((len(b.rows), b.truncated), (10, True))
        self.assertEqual(validate_document(_doc(res, "xlsx"), "xlsx"), [])


class DocxTest(unittest.TestCase):
    def test_text_and_tables_in_order(self):
        from docx import Document

        doc = Document()
        doc.add_heading("BASS-II ReadMe", level=1)
        doc.add_paragraph("")
        doc.add_paragraph("Air display is the flow speed in cm/s.")
        t = doc.add_table(rows=2, cols=2)
        t.cell(0, 0).text, t.cell(0, 1).text = "Column", "Meaning"
        t.cell(1, 0).text, t.cell(1, 1).text = "Fan display", "fan voltage x 10"
        doc.add_paragraph("First item", style="List Bullet")
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "r.docx"
            doc.save(p)
            res = extractors.for_extension("docx").extract(p)
        kinds = [(type(b).__name__, getattr(b, "kind", None)) for b in res.blocks]
        self.assertEqual(kinds, [("TextBlock", "heading"), ("TextBlock", "paragraph"),
                                 ("TableBlock", None), ("TextBlock", "list-item")])
        self.assertEqual(res.blocks[0].level, 1)
        self.assertEqual(res.blocks[1].location, {"paragraph": 3})  # empty paragraph 2 still counted
        self.assertEqual(res.blocks[2].rows[0].raw, {"Column": "Fan display", "Meaning": "fan voltage x 10"})
        self.assertEqual(validate_document(_doc(res, "docx"), "docx"), [])


def _minimal_pdf(text: str) -> bytes:
    """A one-page PDF with a text layer, written by hand (no PDF writer dependency)."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


class PdfTest(unittest.TestCase):
    def test_page_text(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "a.pdf"
            p.write_bytes(_minimal_pdf("Saffire objectives and status"))
            res = extractors.for_extension("pdf").extract(p)
        self.assertEqual(res.pages, 1)
        self.assertEqual(res.status, "ok")
        (block,) = [b for b in res.blocks if isinstance(b, TextBlock)]
        self.assertEqual(block.location, {"page": 1})
        self.assertIn("Saffire objectives", block.text)
        self.assertEqual(validate_document(_doc(res, "pdf"), "pdf"), [])


class RegistryTest(unittest.TestCase):
    def test_default_formats_have_extractors(self):
        for ext in ("pdf", "docx", "csv", "xlsx"):
            self.assertIsNotNone(extractors.for_extension(ext), ext)
        self.assertIsNone(extractors.for_extension("mp4"))


if __name__ == "__main__":
    unittest.main()
