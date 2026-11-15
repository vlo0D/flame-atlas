# pipeline

Data pipeline for Flame Atlas. Spec, plan and tasks: [`specs/001-psi-ingest/`](../specs/001-psi-ingest/).

## Run

```bash
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline
```

That one command searches PSI for `combustion`, keeps the Combustion Science investigations,
downloads their `pdf`, `docx`, `csv` and `xlsx` files (never the `Raw Data` folder; the sensor
telemetry named in `config/telemetry.json` is fetched by a separate step, see below) and writes:

| Path | Content |
|---|---|
| **`data/processed/tests.json`** | **contract**: every experimental-table row as a `TestRecord` |
| **`data/processed/investigations.json`** | **contract**: 24 investigation cards |
| **`data/processed/scenarios.json`** | **contract**: environment presets (from `config/scenarios.json`) |
| **`data/processed/meta.json`** | **contract**: build passport, table list, data notes |
| `data/raw/<id>/metadata.json`, `files.json` | PSI metadata verbatim; every file and why it was taken or skipped |
| `data/extracted/<id>/<file>.json`, `index.json` | text and tables of each document with source locations |

The contract files follow [`contracts/README.md`](../contracts/README.md) and are checked with
`contracts/validate.py` at the end of the build; the run fails if they do not match.
The first full run takes about 20 minutes for downloads (PSI builds file trees of large
investigations slowly) plus the document extraction; `--skip-documents` gives the contract files only.

How the contract files are made:

* `tests.json`: each experimental table has a mapping in [`mappings/`](mappings) (column → field, unit,
  special cells); [`normalize/engine.py`](normalize/engine.py) applies it to every row. Cells stay verbatim
  in `raw`; anything not readable with certainty is `null` with a reason in `notes`.
* `investigations.json`: identification, years, publications from PSI metadata; fuels, conditions and
  test stats computed from `tests.json`; claims are verbatim sentences of the PSI texts with quotes
  checked by code; pillars, platform, facility, insert from [`config/contract.json`](config/contract.json).
* `meta.json`: contract version read from `contracts/types.ts`, counts, tables, `dataNotes`.

Options:

```bash
python3 -m pipeline --skip-documents                # contract files only (fast)
python3 -m pipeline --skip-download                 # rebuild from data/raw without the network
python3 -m pipeline --ids PSI-25 PSI-99             # download only these investigations
python3 -m pipeline --ext pdf docx csv xlsx pptx    # formats (a format needs an extractor, see below)
python3 -m pipeline --max-size-mb 20                # skip larger files
python3 -m pipeline --dry-run                       # list what would be downloaded
python3 -m pipeline --no-pdf-tables                 # PDF text only, faster
python3 -m pipeline --force                         # download and extract again
```

Stages can also run separately: `python3 -m pipeline.ingest`, `python3 -m pipeline.build`,
`python3 -m pipeline.extract`, `python3 -m pipeline.validate_extracted`.
Tests: `python3 -m unittest discover -s tests -t .`

Defaults live in [`config/ingest.json`](config/ingest.json): search query (`combustion`), research
area filter (`Combustion Science`), formats (`pdf, docx, csv, xlsx`), excluded folders (`Raw Data`),
size limit (60 MB), HTTP pause and retries, PDF limits.

Both stages are incremental: ingest skips files already on disk with the listed size;
extract skips documents whose JSON has the same sha256 and extractor version.

## Output: one document

```json
{
  "investigationId": "PSI-25", "format": "docx", "status": "ok", "warnings": [],
  "source": { "fileName": "...", "folder": "Science Documents", "key": "psi-data/PSI-25/...", "sha256": "..." },
  "blocks": [
    { "type": "text", "id": "b1", "kind": "heading", "level": 1, "text": "...", "location": { "paragraph": 1 } },
    { "type": "table", "id": "b2", "name": "Table 1", "confidence": "high", "columns": ["..."],
      "rows": [ { "sourceRow": 1, "raw": { "Column": "verbatim cell" } } ], "location": { "table": 1 } }
  ]
}
```

* Text is verbatim (only outer whitespace trimmed), so quotes can be checked by code (AGENTS.md §2.5).
* Table cells are raw strings, `sourceRow` = data row number in the source (1 = first row after the header),
  as the contract requires for `tests.json` (`raw`, `sourceRow`).
* PDF tables are detected heuristically: `confidence: "low"`.
* Schemas: [`schema/`](schema). `index.json` carries investigation metadata in the contract's field names
  (`id`, `acronym`, `title`, `doi`, `url`, `kind`, `platform`, `facility`, `yearStart`, `yearEnd`, `publications`)
  plus the verbatim PSI texts (`objective`, `approach`, ...) for building cards and checking quotes.

## Extending

**New format** (e.g. `pptx`): add `extractors/pptx_extractor.py` with a subclass of `Extractor`
(`name`, `version`, `extensions = ("pptx",)`, `extract(path) -> ExtractionResult`), register it in
`extractors/__init__.py`, add `"pptx"` to `selection.allowedExtensions`. Reuse `tables.grid_to_table` for grids.

**New experimental table**: add `mappings/<name>.json` (format in [`mappings/README.md`](mappings/README.md));
the build warns about every downloaded table without a mapping.

**New source** (e.g. NTRS): implement `sources/base.Source` (`discover`, `details`, `list_files`,
`download_url`) and register it in `SOURCES` in `ingest.py`; set `source.name` in the config.

**New selection rule**: add it to `selection.decide` with its own `reason` string.

Bump an extractor's `version` when its output changes: extract will then redo those documents.

## Sensor telemetry

Some tables leave out the pressure or oxygen of a test that the experiment's own sensors recorded.
Those logs are in `Raw Data`, next to videos and archives the pipeline never downloads.

```
.venv/bin/python -m pipeline.telemetry            # download the listed logs (about 300 MB), rebuild the summaries
.venv/bin/python -m pipeline.telemetry --offline  # rebuild from logs already in data/raw
```

`config/telemetry.json` names the files and the sensor columns. The step writes one line per test
(median, minimum, maximum and number of readings) to `data/derived/<id>_telemetry.csv`. These small
files are committed, so `python -m pipeline.build` needs neither the logs nor the network. A mapping
reads a summary through `join` with `"root": "derived"` (`mappings/README.md`).
