# Flame Atlas

**See what NASA has already burned in microgravity, and what it has not, before a crew lives there.**

Flame Atlas is a web dashboard for the NASA Space Apps Challenge 2026 challenge
*Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data*.
It turns the 24 combustion investigations in NASA Physical Sciences Informatics (PSI) into one
searchable table of tests, ranks the investigations for a crew environment you describe, and
shows where the data has gaps.

**Live app:** <https://vlo0d.github.io/flame-atlas/>

## What it does

| Screen | What you get |
|---|---|
| **Scenario** | Pick a preset (ISS cabin, lunar or Mars habitat, pressurized rover, EVA suit) or type your own oxygen, pressure, gravity, airflow and fuel. See how many NASA tests were run near that environment, the environment set beside what was actually tested, and all 24 investigations ranked by how close their test conditions are, with a breakdown of every score. |
| **Tests** | One table of 1,989 rows from 22 NASA experiment tables, in common fields and units. Filter by investigation, fuel, oxygen, pressure, airflow, row type and outcome; export the filtered rows to CSV or JSON. Every row opens its source file, row number and original cells. |
| **Coverage** | A grid of oxygen against pressure or airflow: how many individual tests sit in each cell, where the exploration atmosphere is, and the data gaps. Every count links to exactly the rows it counted. |
| **Investigations** | A card for each investigation: objective, setup, conditions, fuels and publications, with a word-for-word quote and link for every statement. |
| **Methodology** | Where the data comes from, how complete each condition is, how the numbers are computed, how it was checked, and its limits. |

## What the data shows

Lunar and Mars habitat concepts use an oxygen-enriched, reduced-pressure atmosphere: at least 30 % oxygen
at 70.3 kPa (10.2 psi) or less. In the PSI data:

- Of 1,872 individual tests, **20 were run inside that atmosphere, and all 20 are gas-burner flames** (ACME CFI-G).
- **No solid material, which is what actually burns in a habitat, was tested above 22.7 % oxygen.**
  Every solid-fuel test that reports pressure was run at ISS cabin pressure, 98–102 kPa.
- No test was run at real partial gravity. E-FIELD Flames only simulates it with an electric field.

For the ISS cabin itself, 141 solid-fuel tests sit within 5 points of oxygen and 15 kPa of pressure.

## How it works

```
NASA PSI API ──> Python pipeline ──> 4 JSON files ──> static web app
(metadata,       (one JSON mapping    (data contract   (ranking, coverage and
 tables,          per table, applied   in contracts/,   gaps computed in the
 documents)       by code; checked)    validated)       browser; no server)
```

- **Pipeline** (`pipeline/`, Python): downloads PSI metadata, the 22 experiment tables and the documents that
  explain them; maps each table to common fields and units with a JSON mapping applied by code; fills a
  condition from another NASA document of the same investigation only when the table leaves it out (for
  example the BASS As Run Test Matrix), marking the value and quoting the source; writes and validates the
  four files of the data contract.
- **Data contract** (`contracts/`): JSON schemas, TypeScript types and a dependency-free validator.
- **Site** (`apps/web/`): Next.js static export with TypeScript and Tailwind. Ranking, coverage and gaps are
  pure functions with unit tests; the site makes no network calls and runs no AI model.

### Rules the data follows

- **No statement without a source.** Every card statement carries a citation and a verbatim quote, and code
  drops a statement whose quote is not in the source text.
- **Empty is better than a guess.** A value the source does not give stays empty and is shown as
  "not reported", never as zero. The ranking gives an unreported condition no points and says so.
- **The original is always kept.** Every normalized row keeps its original cells and its row number in the
  NASA file.
- **Not every row is a test.** Rows that summarise a test day, a test-matrix range or a published figure are
  marked and are not counted as tests.

## Run it yourself

Site (Node.js 20 or later):

```bash
cd apps/web
npm install
npm run dev        # http://localhost:3000
npm test           # unit tests
npm run build      # static site in apps/web/out
```

Data (Python 3.11 or later):

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python -m pipeline                    # download from PSI and rebuild data/processed
.venv/bin/python -m pipeline.build              # rebuild from what is already downloaded
python3 contracts/validate.py data/processed    # check the data against the contract
```

## Repository

| Path | What is there |
|---|---|
| `apps/web/` | the web app |
| `pipeline/` | the data pipeline and the table mappings |
| `contracts/` | the data contract between the pipeline and the site |
| `data/processed/` | the four files the site reads |
| `data/raw/` | the 22 NASA tables and investigation metadata (documents are downloaded, not committed) |
| `data/review/` | samples for checking the data by hand |
| `submission/` | project page text and references |
| `docs/` | team documents, in Ukrainian; start with [docs/kit-readme.md](docs/kit-readme.md) |

## Data and credits

All data comes from [NASA Physical Sciences Informatics, Combustion Science](https://psi.nasa.gov/physci/repo/search?q=combustion),
published under CC0-1.0. Libraries, tools and other references are listed in
[submission/references.md](submission/references.md). How AI tools were used is described on the
Methodology screen and in [docs/si-usage-log.md](docs/si-usage-log.md).
