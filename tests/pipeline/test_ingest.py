"""Ingest tests: file tree parsing, metadata lists, selection rules, contract-style metadata."""
from __future__ import annotations

import unittest

from pipeline import investigation, selection
from pipeline.sources.base import RemoteFile, dedupe_files
from pipeline.sources.psi import parse_metadata_lists, parse_tree, split_key

CFG = {"allowedExtensions": ["pdf", "docx", "csv", "xlsx"], "excludeFolders": ["Raw Data"],
       "includeFolders": [], "maxFileSizeMb": 60}

TREE = {"files": [
    {"displayName": "Experimental table", "files": [
        {"directory": False, "key": "psi-data/PSI-99/Experimental table/PSI-99_Experimental table_SAFFIRE-2.csv",
         "bytes_size": 1973, "version": 1, "sortingCategory": "Experimental table", "subcategory": "", "visible": True}]},
    {"displayName": "Raw Data", "files": [{"displayName": "Reduced Gravity", "files": [
        {"directory": False, "key": "psi-data/PSI-99/Raw Data/PSI-99_Raw Data_SAFFIRE-II Operations.pdf",
         "bytes_size": 13974.0, "version": 1, "sortingCategory": "Raw Data",
         "subcategory": "Reduced Gravity/SAFFIRE-II F1C1", "visible": True}]}]},
    {"displayName": "Science Documents", "files": [
        {"directory": False, "key": "psi-data/PSI-99/Science Documents/PSI-99_Science Documents_SAFFIRE-II Readme.docx",
         "bytes_size": 134425.0, "version": 1, "sortingCategory": "Science Documents", "visible": True},
        {"directory": False, "key": "psi-data/PSI-99/Science Documents/hidden.pdf", "bytes_size": 1, "visible": False}]},
]}


class TreeTest(unittest.TestCase):
    def test_split_key(self):
        self.assertEqual(split_key("psi-data/PSI-25/Science Documents/a/b.docx", "PSI-25"),
                         ("Science Documents", "a", "b.docx"))

    def test_split_key_keeps_slash_inside_psi_file_name(self):
        key = "psi-data/PSI-22/Engineering Documents/PSI-22_Engineering Documents_S1101MFS0004_rev_A - ACME/CIR Integrated Pneumatic Schematic.pdf"
        self.assertEqual(split_key(key, "PSI-22"), ("Engineering Documents", None,
                         "PSI-22_Engineering Documents_S1101MFS0004_rev_A - ACME/CIR Integrated Pneumatic Schematic.pdf"))

    def test_parse_tree_walks_nested_folders_and_skips_hidden(self):
        files = parse_tree(TREE, "PSI-99")
        self.assertEqual(len(files), 3)
        raw = [f for f in files if f.folder == "Raw Data"][0]
        self.assertEqual(raw.subfolder, "Reduced Gravity/SAFFIRE-II F1C1")
        self.assertEqual(raw.size_bytes, 13974)

    def test_dedupe_merges_origins(self):
        details = {"experimentalTable": [{
            "file_name": "PSI-99_Experimental table_SAFFIRE-2.csv", "file_size": 1973, "version": 1,
            "s3_path": "psi-data/PSI-99/Experimental table/PSI-99_Experimental table_SAFFIRE-2.csv"}], "added": []}
        files = dedupe_files(parse_tree(TREE, "PSI-99") + parse_metadata_lists(details, "PSI-99"))
        csv = [f for f in files if f.extension == "csv"][0]
        self.assertEqual(sorted(csv.origin), ["experimentalTable", "tree"])
        self.assertEqual(len(files), 3)


class CacheTest(unittest.TestCase):
    def test_wrong_listing_size_is_cached_after_first_download(self):
        import tempfile
        from pathlib import Path
        from pipeline.ingest import is_cached
        with tempfile.TemporaryDirectory() as d:
            dest = Path(d) / "a.pdf"
            dest.write_bytes(b"x" * 10)
            f = RemoteFile(key="k", file_name="a.pdf", folder="Reports", subfolder=None, size_bytes=7, version=1)
            self.assertFalse(is_cached(dest, f))
            self.assertTrue(is_cached(dest, f, {"k": {"sizeBytes": 7, "downloadedBytes": 10}}))
            self.assertFalse(is_cached(dest, f, {"k": {"sizeBytes": 8, "downloadedBytes": 10}}))  # listing changed


class SelectionTest(unittest.TestCase):
    def _f(self, key, size=100, folder="Science Documents"):
        return RemoteFile(key=key, file_name=key.rsplit("/", 1)[-1], folder=folder, subfolder=None,
                          size_bytes=size, version=1)

    def test_rules(self):
        cases = [
            (self._f("a/ReadMe.docx"), True, "selected"),
            (self._f("a/Table.CSV"), True, "selected"),
            (self._f("a/ops.pdf", folder="Raw Data"), False, "folder-excluded:Raw Data"),
            (self._f("a/video.mp4"), False, "extension:mp4"),
            (self._f("a/old.doc"), False, "extension:doc"),
            (self._f("a/big.pdf", size=61 * 1024 * 1024), False, "too-large:61.0MB"),
        ]
        for f, selected, reason in cases:
            selection.decide(f, CFG)
            self.assertEqual((f.selected, f.reason), (selected, reason), f.key)

    def test_include_folders(self):
        f = selection.decide(self._f("a/x.pdf", folder="Reports"), dict(CFG, includeFolders=["Science Documents"]))
        self.assertEqual(f.reason, "folder-not-included:Reports")


class InvestigationRecordTest(unittest.TestCase):
    def test_contract_style_fields(self):
        details = {"accession": "PSI-25", "investigationAcronym": "BASS-II",
                   "title": "Burning and Suppression of Solids - II", "doi": "10.60555/4qc4-de67",
                   "projectType": "Microgravity Investigation", "investigationStartDate": "01-01-2010",
                   "investigationEndDate": "12-31-2022", "flightProgram": "International Space Station (ISS)",
                   "experimentHardware": "Microgravity Science Glovebox (MSG)", "objective": "Study flames.",
                   "hypothesis": "", "publications": [{"title": "Paper", "doi": "10.1/x"}], "version": 2}
        rec = investigation.to_record(details, "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25")
        self.assertEqual(rec["url"], "https://doi.org/10.60555/4qc4-de67")
        self.assertEqual((rec["kind"], rec["platform"], rec["facility"]), ("flight", "ISS", "MSG"))
        self.assertEqual((rec["yearStart"], rec["yearEnd"]), (2010, 2022))
        self.assertIsNone(rec["texts"]["hypothesis"])  # empty string → null
        self.assertEqual(rec["publications"], [{"title": "Paper", "year": None, "doi": "10.1/x"}])


if __name__ == "__main__":
    unittest.main()
