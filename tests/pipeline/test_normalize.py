"""Normalization tests: value parsing, fuel parsing, mapping engine vs the hand-made fixtures."""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from pipeline.extractors.base import TableRow
from pipeline.normalize import values as V
from pipeline.normalize.engine import CONTRACT_FIELDS, normalize_table
from pipeline.normalize.fuel import parse_fuel
from pipeline.settings import REPO_ROOT

MAPPINGS = {json.loads(p.read_text())["tableFile"]: json.loads(p.read_text())
            for p in (REPO_ROOT / "pipeline" / "mappings").glob("*.json")}
FIXTURES = json.loads((REPO_ROOT / "data" / "fixtures" / "tests.json").read_text())


class ValuesTest(unittest.TestCase):
    def q(self, s, **kw):
        q = V.parse_quantity(s, **kw)
        return None if q is None else (q.values, q.approx, q.is_range, q.unit)

    def test_shapes(self):
        self.assertEqual(self.q("22.2"), ([22.2], False, False, None))
        self.assertEqual(self.q("~ 22.1"), ([22.1], True, False, None))
        self.assertEqual(self.q("21.5 - 21.7"), ([21.5, 21.7], False, True, None))
        self.assertEqual(self.q("22.1 to 22.0"), ([22.1, 22.0], False, True, None))
        self.assertEqual(self.q("21; 26.5; 40"), ([21, 26.5, 40], False, False, None))
        self.assertEqual(self.q("0.5; 1.0; or 3.0")[0], [0.5, 1.0, 3.0])
        self.assertEqual(self.q("0.61 mm"), ([0.61], False, False, "mm"))
        self.assertEqual(self.q("30%-40%"), ([30, 40], False, True, "%"))

    def test_nulls_and_ambiguity(self):
        for s in ("", "n/a", "none", "RAMPED", "Insignificant", "-", "037 mm"):
            self.assertIsNone(V.parse_quantity(s), s)

    def test_text_numbers_ignore_formula_digits(self):
        self.assertEqual(self.q("~30% and ~21% O2 with He", allow_text=True)[0], [30, 21])

    def test_convert(self):
        self.assertEqual(V.convert([757.7], None, "mmHg", "pressure"), [101.02])
        self.assertEqual(V.convert([0.389822946], None, "fraction", "pct"), [38.98])
        self.assertEqual(V.convert([0.61], "mm", "cm", "length"), [0.61])  # unit in the cell wins
        self.assertEqual(V.convert([2.1], None, "mm/s", "spread"), [2.1])
        self.assertIsNone(V.convert([1], "atm", None, "length"))

    def test_dates(self):
        self.assertEqual(V.parse_date("2/19/2014", "m/d/y"), "2014-02-19")
        self.assertEqual(V.parse_date("9-Mar-17", "d-mon-yy"), "2017-03-09")
        self.assertEqual(V.parse_date("2012-FEB-13 SLICE testing with ", "yyyy-mon-dd"), "2012-02-13")
        self.assertEqual(V.parse_date("17319", "yyddd"), "2017-11-15")
        self.assertEqual(V.parse_date("GMT 54 (2005)", "gmt-doy-year"), "2005-02-23")
        self.assertEqual(V.date_from_parts("2019", "Sept.", "11"), "2019-09-11")


class FuelTest(unittest.TestCase):
    def test_solid(self):
        f = parse_fuel("100 micron PMMA film   2 cm wide", {"parser": "solid"})
        self.assertEqual((f.name, f.state, f.geometry, f.thickness_mm, f.width_mm), ("PMMA", "solid", "film", 0.1, 20))
        f = parse_fuel('1/4" clear rod', {"parser": "solid", "defaultMaterial": "PMMA", "defaultMaterialFor": ["rod"]})
        self.assertEqual((f.name, f.diameter_mm, f.inferred), ("PMMA", 6.35, ["fuelName"]))

    def test_gas_artifacts(self):
        f = parse_fuel("40% CH7", {"parser": "gas", "fixAutoIncrement": True})
        self.assertEqual((f.name, f.confidence), ("CH4", "low"))
        self.assertEqual(parse_fuel("100% C2H6", {"parser": "gas"}).name, "C2H6")  # real ethane stays


class EngineVsFixturesTest(unittest.TestCase):
    """The engine must reproduce every hand-normalized fixture row from its raw cells."""

    def test_fixtures(self):
        for fx in FIXTURES:
            with self.subTest(fx["id"]):
                mapping = MAPPINGS[fx["tableFile"]]
                records, _ = normalize_table(mapping, [TableRow(source_row=fx["sourceRow"], raw=fx["raw"])])
                self.assertEqual(len(records), 1)
                rec = records[0]
                self.assertEqual(list(rec), CONTRACT_FIELDS)
                # Fields the mapping fills from a document on purpose (e.g. BASS-II pressure from the
                # Summary Report) may go beyond the fixture, but only where the fixture had null.
                from_documents = set(rec["inferred"]) - set(fx["inferred"])
                for key in CONTRACT_FIELDS:
                    if key in ("notes", "mappingVersion", "confidence"):
                        continue
                    if key == "inferred":
                        self.assertEqual(sorted(set(rec[key]) - from_documents), sorted(fx[key]))
                    elif key in from_documents:
                        self.assertIsNone(fx[key], key)
                        self.assertIsNotNone(rec[key], key)
                    else:
                        self.assertEqual(rec[key], fx[key], key)
                if not from_documents:
                    self.assertEqual(rec["confidence"], fx["confidence"])

    def test_skip_footnotes_and_continuations(self):
        m = MAPPINGS["PSI-22_Experimental table_ACME E-FIELD Flames.csv"]
        cols = ["Test Type", "Test Day", "Year", "Month", "Date", "Mesh Polarity", "Fuel Bottle", "Fuel Conc",
                "Flames Ignited", "Notes"]
        r1 = dict.fromkeys(cols, "")
        r1.update({"Test Type": "x", "Test Day": "18078", "Year": "2018", "Month": "3", "Date": "19",
                   "Fuel Bottle": "100% CH4", "Fuel Conc": "70%", "Flames Ignited": "10"})
        r2 = dict.fromkeys(cols, "")
        r2["Fuel Conc"] = "100%"
        records, report = normalize_table(m, [TableRow(1, r1), TableRow(2, r2)])
        self.assertEqual((len(records), report.merged), (1, 1))
        self.assertIn("Continuation row 2", records[0]["notes"])
        self.assertEqual((records[0]["date"], records[0]["gravity"], records[0]["ignited"]),
                         ("2018-03-19", "partial-simulated", True))


@unittest.skipUnless(any((REPO_ROOT / "data" / "raw").glob("PSI-*/metadata.json")), "needs data/raw from pipeline.ingest")
class BuildContractTest(unittest.TestCase):
    def test_build_validates(self):
        with tempfile.TemporaryDirectory() as d:
            proc = subprocess.run([sys.executable, "-m", "pipeline.build", "--out", d], cwd=REPO_ROOT,
                                  capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
            tests = json.loads((Path(d) / "tests.json").read_text())
            cards = json.loads((Path(d) / "investigations.json").read_text())
            for c in cards:  # every claim quote is a verbatim citation
                for claim in [c["summary"], *c["objectives"], *c["measurements"], *c["fireSafetyRelevance"]]:
                    self.assertTrue(claim["citations"][0]["quote"])
            self.assertGreater(len(tests), 1900)
            analogs = {c["id"]: c["fuelAnalogOf"] for c in cards if c.get("fuelAnalogOf")}
            self.assertEqual(set(analogs), {"PSI-20"})
            self.assertEqual(analogs["PSI-20"]["states"], ["solid", "liquid"])
            quote = analogs["PSI-20"]["claim"]["citations"][0]["quote"]
            meta = json.loads((REPO_ROOT / "data" / "raw" / "PSI-20" / "metadata.json").read_text())
            self.assertIn(quote, meta["objective"])
            self.assertEqual(json.loads((Path(d) / "meta.json").read_text())["contractVersion"], "1.1.0")


if __name__ == "__main__":
    unittest.main()


class JoinTest(unittest.TestCase):
    """Values taken from a second file of the same investigation (mapping key `join`)."""

    MAPPING = {
        "tableFile": "t.csv", "investigationId": "PSI-26", "tableId": "T", "mappingVersion": "1",
        "granularity": "test", "label": {"column": "Test #"},
        "join": {"label": "the matrix", "key": {"table": ["Run", "Test #"], "source": ["run no.", "test no."]}},
        "fields": {"o2Pct": {"column": "@O2", "unit": "fraction"}, "pressureKpa": {"column": "@p, atm", "unit": "atm"}},
        "gravity": {"value": "micro", "source": "ISS"},
    }

    def rows(self):
        return [TableRow(source_row=1, raw={"Run": "24", "Test #": "12-R"}),
                TableRow(source_row=2, raw={"Run": "24", "Test #": "12-R2"}),
                TableRow(source_row=3, raw={"Run": "99", "Test #": "1"})]

    def test_fills_from_the_matching_row_and_keeps_raw(self):
        joined = {"24 | 12-r": {"O2": "0.211", "p, atm": "0.97"}, "24 | 12-r2": {"O2": "0.25", "p, atm": "1"}}
        records, _ = normalize_table(self.MAPPING, self.rows(), joined)
        first, second, missing = records
        self.assertEqual((first["o2PctMin"], first["pressureKpaMin"]), (21.1, 98.29))
        self.assertEqual(second["o2PctMin"], 25)
        self.assertEqual(first["raw"], {"Run": "24", "Test #": "12-R"})
        self.assertIn("pressureKpaMin", first["inferred"])
        self.assertEqual(first["confidence"], "medium")
        self.assertIn("Taken from the matrix, row with run no. 24, test no. 12-R: O2 = '0.211'", first["notes"])
        self.assertIsNone(missing["o2PctMin"])
        self.assertIn("No row with run no. 99, test no. 1 in the matrix.", missing["notes"])
