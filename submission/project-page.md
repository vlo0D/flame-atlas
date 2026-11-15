# Project page (English only)

Field names match the Space Apps project form. Numbers come from `data/processed` as of the last build;
re-check them on the Methodology screen before submitting. Fields marked TODO need a person.

## Project Name

Flame Atlas

## High-Level Project Summary

Flame Atlas turns NASA's microgravity combustion research into a fire-safety tool for crewed habitats.
It reads all 24 combustion investigations in NASA Physical Sciences Informatics (PSI), merges their 22
experiment tables into one table of 1,872 individual tests in common units, and lets an engineer describe
a crew environment (oxygen, pressure, gravity, airflow, fuel) to see which investigations tested
conditions closest to it, with a transparent score and a source for every value. It also makes the
gaps visible: of all those tests, only 20 were run in the oxygen-enriched, low-pressure atmosphere planned
for lunar and Mars habitats, all of them gas-burner flames, and no solid material was tested above
22.7 % oxygen. Knowing what has not been tested is as important for fire safety as knowing what has.
SI (a language model) reads NASA's tables, test matrices and operator notes into that one table and writes
a short brief that interprets each preset environment; code checks every value it reads and every number
it writes against the NASA source, and shows the source next to it.

## Link to Project Demo

TODO: public link to the slides (7 at most) or the video (30 seconds at most). Must open without a login.

## Link to Final Project

https://github.com/vlo0D/flame-atlas (the README links to the live app: https://vlo0d.github.io/flame-atlas/)

## Detailed Project Description

### What it does

- **Scenario.** Choose a preset (ISS cabin, lunar or Mars habitat, pressurized rover, EVA suit) or enter your
  own oxygen, pressure, gravity, airflow, fuel state and fire-safety focus. The screen shows how many tests
  with that fuel were run near the environment, sets the environment beside the range NASA actually tested,
  and ranks the 24 investigations by how close their test conditions are. Every score is broken into seven
  parts, and the card shows its closest tests and how many of the 100 points could be checked against data.
  For a preset, an **SI brief** puts these numbers into a few sentences; code checks every number and
  investigation name in it, and "What was checked" lists the facts behind each sentence.
- **Tests.** One table of 1,989 rows (1,872 individual tests plus test-day and test-matrix summaries) from
  22 NASA tables. Filter by investigation, fuel state, oxygen, pressure, airflow, row type and outcome;
  export to CSV or JSON for modelling. Every row opens its NASA file, row number, original cells and the
  notes that quote the NASA document a value came from. The outcome of 75 BASS tests, read by SI from the
  operators' notes, carries an SI mark and its quote.
- **Coverage.** A grid of oxygen against pressure or airflow with the number of tests in each cell, the
  exploration atmosphere marked, and the data gaps counted. Each count opens exactly the rows it counted.
- **Investigations.** A card per investigation with objectives, setup, conditions, fuels, publications and
  what varied between its tests. Every statement carries a word-for-word quote and a link to its source.
- **Methodology.** How complete each condition and result is, where each value came from, how the numbers
  are computed, how the data was checked, how SI powers the dashboard, and its limits.

### How it works

1. A Python pipeline calls the PSI API, downloads the metadata, the 22 experiment tables and the documents
   that explain their columns.
2. Each table has a JSON mapping (which column feeds which field, in which unit, how to read special cells).
   Code applies the mapping to every row the same way and keeps the original cells and row number.
3. When a table leaves a condition out but the same investigation records it in another NASA document,
   the value is taken from there, marked as such, and the document is quoted in the row's notes. Oxygen,
   pressure and airflow of the 121 BASS tests come from its As Run Test Matrix this way, and the pressure of
   95 SAFFIRE and SAME-R tests is the median reading of each test's own sensor telemetry.
4. The BASS table has no column for what happened in a test. A language model read the operators' free-text
   notes in NASA's As Run Test Matrix; code keeps the ignition, outcome or burn time it found only when the
   words it quotes are in the NASA cell character for character.
5. Investigation cards are built from PSI metadata; code checks that every quote exists in the source text.
6. The pipeline writes four JSON files that follow a published data contract and validates them.
7. A static web app (Next.js, TypeScript) reads those files. Ranking, coverage and gaps are pure functions
   with unit tests that run in the browser: no server, no database.
8. For each preset environment a language model wrote a short brief from the numbers the app computes.
   Each sentence lists the facts it rests on; the app re-checks every number and name against the data in
   the browser and does not show a sentence that fails. No model is called at run time.

### Benefits

- Engineers and researchers get, in a minute, an answer that otherwise takes days of reading 24 data pages
  and 352 publication records: which experiments are relevant to their environment, and which are not.
- Modellers get one clean, documented table with units converted and the source of every value.
- Mission planners see the gaps (oxygen-enriched low pressure, solid materials, partial gravity) before
  a habitat is designed around assumptions that were never tested.

### What we hope to achieve

Make the limits of existing microgravity fire data visible, so that the next flight experiments target the
conditions crews will actually live in, and give modellers a trustworthy starting dataset.

### Tools, languages, software

Python (data pipeline: requests, openpyxl, python-docx, pdfplumber), TypeScript, Next.js with static export,
React, Tailwind CSS, Vitest, GitHub Actions and GitHub Pages. Details in the References field.

### Data quality and limits

- 1,989 rows from 22 tables; 1,872 are individual tests. Oxygen is reported for 1,479 tests, pressure for
  1,258, airflow for 793, the outcome for 623. Missing values are shown as "not reported", never as zero.
- Automated checks: over 2,100 oxygen, pressure and airflow values in 8 tables were compared with their
  source cells after unit conversion and all matched. TODO: result of the 40-value hand check in
  `data/review/sample-40.csv`.
- The ranking weights and the rules SI followed when reading the operators' notes are a first version and
  have not been reviewed by a combustion specialist. TODO: result of the 20-value hand check of the note
  readings in `data/review/si-notes-sample.csv`.
- The score compares test conditions; it is not a safety rating.

## Use of Super Intelligence (SI)

SI does four jobs in Flame Atlas. In each one a language model reads or writes, and ordinary code checks the
result against its NASA source before it reaches a screen. The model works ahead of time and its output is
a file in the repository, so the dashboard runs without a key or a server and gives the same answer every time.

- **In the product: interpreting an environment.** For each of the five preset environments Claude Fable 5.2
  wrote a short "SI brief" from the numbers the Scenario screen computes: tests near the environment, the
  ranges actually tested, the top of the ranking, the gaps. Every sentence lists the facts it rests on. Code
  checks every number and investigation name in a sentence against those facts, in a unit test and again in
  the browser, and does not show a sentence that fails. In this build 26 of 26 sentences pass, with 98
  numbers and 24 names checked; "What was checked" under the brief shows the facts.
- **In the data: reading operator notes.** The BASS table has no column for what happened in a test, but the
  operators described it in free text in NASA's As Run Test Matrix. Claude Fable 5.2 read the 121 notes and
  found the ignition of 113 tests, the outcome of 75 and the burn time of 17. Code keeps a value only when
  the words the model quotes are in the NASA cell character for character (205 values kept, none rejected),
  and the Tests screen shows the quote beside the value.
- **In the data: one table from 22.** The AI assistant proposed how each NASA table maps onto the common
  fields, and found conditions a table leaves out in other NASA files (the BASS test matrix, SAFFIRE and
  SAME-R sensor telemetry, the SPICE final report). Each mapping is a readable JSON file; deterministic code
  applies it to every row and keeps the original cells, and a script compared over 2,100 converted values
  with their source cells.
- **Writing code.** Claude Code (models Claude Fable 5.2 and Claude Opus 5.5) helped write the web app, the
  data pipeline and their tests, working from architecture rules and a data contract the team wrote first.
  The team read the changes and checked them with unit tests (169 for the site, 44 for the pipeline), type
  checks, linting, contract validation and manual testing in the browser.

What SI does not do: it does not set or adjust a score, it does not fill a value that no NASA file reports,
and it does not draw conclusions about how materials burn. Ranking, coverage and gaps are computed by open,
tested code in the browser. Investigation cards quote NASA metadata word for word, and no model writes them.
The briefs and the note readings were written in a Claude Code session, not through an API; the instructions
the model followed are in the repository (`apps/web/src/content/briefs.prompt.md`,
`pipeline/mappings/si/README.md`). TODO: a person checks the 20-value sample of the note readings.

## NASA Data

- NASA Physical Sciences Informatics (PSI), Combustion Science: metadata, experiment tables and documents of
  24 investigations: ACME Flame Design, ACME BRE, ACME CLD Flame, ACME E-FIELD Flames, ACME s-Flame,
  ACME CFI-G, BASS, BASS-II, CFI, DAFT / DAFT-2, FLEX, FLEX-2, SAFFIRE-I, SAFFIRE-II, SAFFIRE-III, SAME,
  SAME-R, SPICE, SLICE, and ground investigations PSI-60, PSI-62, PSI-115, PSI-117 and PSI-142.
  https://psi.nasa.gov (CC0-1.0)
- Habitat atmosphere values used in the presets: the "Potential Considerations" section of the Flame in Freefall
  challenge page.

## Space Agency Partner Data and Other References

See `submission/references.md`.
