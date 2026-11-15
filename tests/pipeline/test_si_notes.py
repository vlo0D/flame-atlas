"""Readings of free-text notes by a language model: what the quote check accepts and what it turns down."""
import json
import tempfile
import unittest
from pathlib import Path

from pipeline.extractors.base import TableRow
from pipeline.normalize.engine import normalize_table
from pipeline.normalize.si_notes import durations_in, load_readings, read_note

NOTE = "Ignited quickly, all blue.  Got sooty at 3.5 minutes, burned for ~ 4.75 min.  Went out on its own after 75 seconds."
EMPTY = {"ignited": None, "outcome": None, "burnTimeS": None}


def reading(**fields):
    return {name: {"value": value, "quote": quote} for name, (value, quote) in fields.items()}


class ReadNoteTest(unittest.TestCase):
    def test_accepts_a_value_whose_quote_is_in_the_note(self):
        accepted, rejected = read_note(NOTE, reading(ignited=(True, "Ignited quickly"),
                                                     outcome=("self-extinguished", "Went out on its own"),
                                                     burnTimeS=(285, "burned for ~ 4.75 min")), EMPTY)
        self.assertEqual({k: v["value"] for k, v in accepted.items()},
                         {"ignited": True, "outcome": "self-extinguished", "burnTimeS": 285})
        self.assertEqual(rejected, [])

    def test_rejects_a_quote_that_is_not_in_the_note_word_for_word(self):
        for quote in ("ignited quickly", "Ignited quickly, all blue. Got sooty", "the flame blew off", ""):
            with self.subTest(quote):
                accepted, rejected = read_note(NOTE, reading(ignited=(True, quote)), EMPTY)
                self.assertEqual(accepted, {})
                self.assertEqual(len(rejected), 1)

    def test_rejects_a_value_outside_the_contract(self):
        _, rejected = read_note(NOTE, reading(outcome=("quenched", "Went out on its own"),
                                              ignited=("yes", "Ignited quickly")), EMPTY)
        self.assertEqual(sorted(item["field"] for item in rejected), ["ignited", "outcome"])

    def test_a_burn_time_must_be_the_duration_written_in_its_quote(self):
        ok, _ = read_note(NOTE, reading(burnTimeS=(75, "after 75 seconds")), EMPTY)
        self.assertEqual(ok["burnTimeS"]["value"], 75)
        for value, quote in ((80, "after 75 seconds"), (285, "Went out on its own"), (0, "after 75 seconds"),
                             (99999, "after 75 seconds")):
            with self.subTest(value=value, quote=quote):
                accepted, rejected = read_note(NOTE, reading(burnTimeS=(value, quote)), EMPTY)
                self.assertEqual((accepted, len(rejected)), ({}, 1))

    def test_never_replaces_a_value_the_table_has(self):
        accepted, rejected = read_note(NOTE, reading(outcome=("self-extinguished", "Went out on its own")),
                                       {**EMPTY, "outcome": "blowoff"})
        self.assertEqual(accepted, {})
        self.assertIn("already has a value", rejected[0]["reason"])

    def test_rejects_ignition_and_outcome_that_contradict_each_other(self):
        accepted, rejected = read_note(NOTE, reading(ignited=(True, "Ignited quickly"),
                                                     outcome=("not-ignited", "Went out on its own")), EMPTY)
        self.assertEqual(accepted, {})
        self.assertEqual(len(rejected), 2)

    def test_no_reading_or_no_note_gives_nothing(self):
        self.assertEqual(read_note(NOTE, None, EMPTY), ({}, []))
        accepted, rejected = read_note(None, reading(ignited=(True, "Ignited quickly")), EMPTY)
        self.assertEqual((accepted, len(rejected)), ({}, 1))

    def test_durations(self):
        self.assertEqual(durations_in("~ 40 s burn"), [40])
        self.assertEqual(durations_in("2 minute burn, then 4 seconds"), [120, 4])
        self.assertEqual(durations_in("at 16:19:34"), [])


class EngineTest(unittest.TestCase):
    MAPPING = {
        "tableFile": "t.csv", "investigationId": "PSI-1", "tableId": "T", "mappingVersion": "1", "granularity": "test",
        "label": {"column": "Test #"}, "gravity": {"value": "micro", "source": "flight"},
        "join": {"label": "the matrix", "sheet": "as run", "key": {"table": ["Test #"], "source": ["test no."]}},
        "siNotes": {"column": "@Notes", "readings": "si/x.json", "label": "the matrix"},
    }
    JOINED = {"7": {"test no.": "7", "Notes": NOTE}, "8": {"test no.": "8", "Notes": "No pictures."}}
    READINGS = {"model": "Test Model", "sourceFile": "matrix.xlsx", "readings": {
        "7": reading(ignited=(True, "Ignited quickly"), outcome=("self-extinguished", "Went out on its own"),
                     burnTimeS=(75, "after 75 seconds")),
        "8": reading(ignited=(True, "nice flame")),
    }}

    def test_accepted_values_are_marked_inferred_and_quoted_in_the_notes(self):
        rows = [TableRow(1, {"Test #": "7"}), TableRow(2, {"Test #": "8"}), TableRow(3, {"Test #": "9"})]
        records, report = normalize_table(self.MAPPING, rows, self.JOINED, self.READINGS)
        first, second, third = records
        self.assertEqual((first["ignited"], first["outcome"], first["burnTimeS"]), (True, "self-extinguished", 75))
        for name in ("ignited", "outcome", "burnTimeS"):
            self.assertIn(name, first["inferred"])
        self.assertIn('outcome = self-extinguished ("Went out on its own")', first["notes"])
        self.assertIn("Read by SI (Test Model)", first["notes"])
        self.assertEqual(first["confidence"], "medium")
        self.assertEqual(first["raw"], {"Test #": "7"})  # the table's own cells are never changed
        # A reading whose quote is not in the note leaves the field empty and is reported.
        self.assertIsNone(second["ignited"])
        self.assertNotIn("ignited", second["inferred"])
        self.assertIsNone(third["ignited"])
        self.assertEqual(report.siAccepted, 3)
        self.assertEqual([(item["field"], item["quote"]) for item in report.siRejected], [("ignited", "nice flame")])

    def test_without_readings_the_mapping_behaves_as_before(self):
        records, report = normalize_table(self.MAPPING, [TableRow(1, {"Test #": "7"})], self.JOINED)
        self.assertIsNone(records[0]["outcome"])
        self.assertEqual((report.siAccepted, report.siRejected), (0, []))

    def test_load_readings_normalizes_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp) / "si"
            folder.mkdir()
            (folder / "x.json").write_text(json.dumps({"model": "M", "sourceFile": "f.xlsx",
                                                       "readings": {"24 | 12-R": {}}}))
            self.assertEqual(list(load_readings(Path(tmp), {"readings": "si/x.json"})["readings"]), ["24 | 12-r"])


if __name__ == "__main__":
    unittest.main()
