# Table mappings

One JSON file per PSI experimental table. `pipeline/normalize/engine.py` applies it to every row
and produces contract `TestRecord`s (`contracts/README.md`). A mapping is data, not code: to fix a
column or a unit, edit the JSON and run `python3 -m pipeline --skip-download --skip-documents`.
The engine must keep reproducing `data/fixtures/tests.json` (`tests/pipeline/test_normalize.py`).

## Keys

| Key | Meaning |
|---|---|
| `tableFile`, `investigationId` | PSI file name and investigation |
| `tableId` | middle part of record ids: `PSI-25:BASS-II:B1` |
| `mappingVersion` | bump when the output changes |
| `granularity` | `test`, `test-day`, `matrix-row`, `reference` |
| `comment` | why the non-obvious decisions were made |
| `label` | `{"column": "Test #"}` or `{"from": "date"}` |
| `idFrom`, `idColumn` | ids from the label (default), from the row number (`"row"`), or from another column |
| `date` | `{"column", "format"}` with format `m/d/y`, `d-mon-yy`, `yyyy-mon-dd`, `yyddd`, `gmt-doy-year`; or `{"parts": {"year", "month", "day"}}` |
| `fuel` | `{"column", "parser": "solid" \| "gas" \| "liquid" \| "plain", "state", "geometry"}`; `defaultMaterial` + `defaultMaterialFor` (geometries) + `defaultMaterialNote`; `fixAutoIncrement`; `stripAfter`; or `{"value": "C2H4"}` when the fuel is named by a header |
| `fields` | numeric fields: `o2Pct`, `o2PctFinal`, `co2Pct`, `pressureKpa`, `flowCmS`, `thicknessMm`, `widthMm`, `diameterMm`, `burnTimeS`, `spreadRateMmS`. Each is `{"column", "unit"}` (+ `multi`, `allowText`, `excelPercent`, `approx`) or `{"value", "note"}` for a value taken from a document (marked in `inferred`; `"value": [lo, hi]` with `"range": true` is an interval, `approx` and `confidence` say how far to trust it) |
| `flowDirection` | `{"value": "quiescent"}` or `{"column", "map"}` |
| `diluent` | `{"value"}`, `{"fractions": {"N2": "col", ...}}`, or `{"column", "regex"}` (+ `findall`, `fixAutoIncrement`, `inferred`) |
| `ignited` | `{"rule": "countPositive" \| "burnTime" \| "map" \| "value", ...}`; `ignitedIfCoolFlame` |
| `outcome`, `coolFlame` | `{"column", "map"}` or `{"column", "prefixMap"}` |
| `join` | values from a second file of the same investigation, one row per test: `{"file": path under data/raw/<id>/, "label": words for the notes, "sheet", "headerRow" (1-based), "key": {"table": [columns], "source": [columns]}, "confidence"}`. With `"root": "derived"` the file is a csv in `data/derived/` written by `pipeline/telemetry.py`; `shortLabel` replaces `label` in the note of a row that has no match; `key.tablePattern` is a regex whose first group is the part of the table cell that names the test there. A field reads a joined cell as `{"column": "@Column", ...}`; every such value is listed in `inferred`, the cells used are quoted in `notes`, and `raw` keeps only the table's own columns. A key that appears twice in the joined file stops the build |
| `siNotes` | values a language model read from a free-text column of the joined file: `{"column": "@Column", "readings": path under pipeline/mappings/, "label": words for the notes, "confidence"}`. The readings file (format and rules in [`si/README.md`](si/README.md)) gives `ignited`, `outcome` and `burnTimeS` per row with the exact words each rests on. The engine keeps a value only when its quote is in the cell character for character, lists it in `inferred` and quotes it in `notes`; it never replaces a value of the table. Rejected readings go to `data/review/si-notes-rejected.csv` |
| `overrides` | `[{"column", "regex", "set": {...}, "note", "inferred", "confidence"}]` applied after the fields; for values taken from a document, list the fields in `inferred`, lower `confidence` and quote the source verbatim in `note` |
| `gravity` | `{"value": "micro" \| "normal" \| "partial-simulated", "source"}`; always listed in `inferred` |
| `notes` | `{"templates": ["{Column} text"], "static": ["text"]}`; a template is dropped when a cell it uses is empty |
| `skipRows` | `[{"column", "regex", "reason"}]` for rows that are not tests (counted in the build log and `meta.dataNotes`) |
| `footnotes` | `{"column", "regex", "applyToAll"}`: footnote rows become notes of the rows that cite them |
| `continuation` | `{"whenEmpty": "Test Day", "collect": [...]}`: rows that only continue the row above are merged into its notes |

## Units

Cell units win over the column unit. Supported: `%`, `fraction`, `kPa`, `Pa`, `atm`, `bar`, `psi`, `mmHg`,
`mm`, `cm`, `m`, `micron`, `in`, `cm/s`, `mm/s`, `m/s`, `s`, `min`. Converted values are rounded to
2 decimals (4 significant digits below 1). Text such as `RAMPED`, `n/a`, `Insignificant` becomes `null`;
an ambiguous number such as `037 mm` becomes `null` with a note. The cell is always kept in `raw`.
