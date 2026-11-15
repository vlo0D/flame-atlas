# Project page: text for the submission form (English only)

Each block is the text of the form field of the same name. The numbers come from `data/processed`
(build of 15 November 2026) and match the Methodology screen. The places for images are marked `[Image: ...]`;
the files are in `submission/screenshots/` and go in through Insert → Inline Image in the editor of the
Project Details field.

The live form of 2026 differs from the guide in three fields:

- **Summary** takes at most 1,500 characters; the text below has 1,088.
- **Use of Super Intelligence (SI)** is a list of options, not a text. Ticked: Research or Information
  Gathering; Data Analysis and Interpretation; Building SI/ML Into the Project; Coding, Debugging, or
  Troubleshooting; Writing, Editing, or Translation; Visual Design or Image Creation; Presentation, Video,
  or Audio. The text of that section stays here for the README and for questions from the organisers.
- **NASA Data** and **Space Agency Partner & Other Data** are lists of links, each with a name. The links
  entered are listed at the end of those two sections.

| Field of the Space Apps form | Name in the local checklist |
|---|---|
| Project Name | Project Title |
| High-Level Project Summary | High-Level Project Summary |
| Link to Project Demo | Project Demo |
| Link to Final Project | Final Project Link |
| Detailed Project Description | Detailed Project Description |
| Use of Super Intelligence (SI) | AI Tools |
| NASA Data | NASA Data & References |
| Space Agency Partner Data and Other References | NASA Data & References |

## Project Name

Flame Atlas

## High-Level Project Summary

Flame Atlas turns NASA's microgravity combustion research into a fire-safety tool for crewed habitats.
It reads all 24 combustion investigations in NASA Physical Sciences Informatics (PSI), merges their 22
experiment tables into one table of 1,872 individual tests in common units, and lets an engineer describe
a crew environment (oxygen, pressure, gravity, airflow, fuel) to see which investigations tested
conditions closest to it, with an open score and a source for every value. It also makes the gaps visible:
of all those tests, only 20 were run in the oxygen-enriched, low-pressure atmosphere planned for lunar and
Mars habitats, all of them gas-burner flames, and no solid material was tested above 22.7 % oxygen.
Knowing what has not been tested matters for fire safety as much as knowing what has.
SI (a language model) reads NASA's tables, test matrices and operator notes into that one table and writes
a short brief that interprets each preset environment; code checks every value it reads and every number
it writes against the NASA source, and shows the source next to it.

## Link to Project Demo

https://vlo0d.github.io/flame-atlas/demo/flame-atlas-demo.pdf

Seven slides, PDF. The same file on GitHub, if the first link is blocked:
https://github.com/vlo0D/flame-atlas/blob/main/apps/web/public/demo/flame-atlas-demo.pdf

## Link to Final Project

https://github.com/vlo0D/flame-atlas

The README opens with the link to the live app: https://vlo0d.github.io/flame-atlas/

## Detailed Project Description

### The problem

Lunar and Mars habitat concepts plan an oxygen-enriched, reduced-pressure atmosphere: at least 30 % oxygen at
70.3 kPa (10.2 psi) or less, in partial gravity. Materials burn differently there than in an ISS cabin, and
a crew cannot leave. NASA has run 24 combustion investigations that bear on this, but their results sit in
22 tables with different columns and units and in hundreds of documents. Nobody can ask them one question.

### What it does

[Image: scenario-lunar-habitat.png]

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

[Image: tests-bass-si-row.png]

### What the data shows

[Image: coverage-solid-fuel.png]

- Of 1,872 individual tests, 20 were run inside the exploration atmosphere, and all 20 are gas-burner flames
  (ACME CFI-G).
- No solid material, which is what actually burns in a habitat, was tested above 22.7 % oxygen. Every
  solid-fuel test that reports pressure was run at ISS cabin pressure, 98–104 kPa.
- No test was run at real partial gravity. E-FIELD Flames only simulates it with an electric field.
- For the ISS cabin, 154 of the 379 solid-fuel tests sit within 5 points of oxygen and 15 kPa of pressure.
  For a lunar or Mars habitat, none do.

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

### How SI powers it, and how it is checked

[Image: scenario-si-brief-checked.png]

SI reads and writes; ordinary code checks each result against its NASA source before it reaches a screen.

- **One table from 22.** SI proposed how each NASA table maps onto the common fields and found conditions
  a table leaves out in other NASA files. A script compared over 2,100 converted oxygen, pressure and airflow
  values in 8 tables with their source cells: all match within 2 %.
- **Operator notes.** SI read the 121 notes of the BASS operators and found the ignition of 113 tests, the
  outcome of 75 and the burn time of 17. A value is kept only when the quoted words are in the NASA cell:
  205 kept, none rejected. The quote is shown beside the value.
- **SI brief.** For each of the five preset environments SI wrote a short interpretation. Code checks every
  number and investigation name in it, in a unit test and again in the browser: 26 of 26 sentences pass, with
  98 numbers and 24 names checked.
- SI does not set or adjust a score, does not fill a value that no NASA file reports, and does not draw
  conclusions about how materials burn.
- Everything SI produced is marked: an SI badge in the app, the model's name in the brief file and in the
  notes of each row it read, and a line in the footer of every demo slide.

### What is creative about it

- It answers with a scenario, not a search. The user describes an environment, and the tool brings the
  evidence to it and says how far each investigation is from it, part by part.
- It treats "nobody tested this" as a result. The gaps are counted and drawn on the same grid as the tests,
  and every count opens the rows behind it.
- SI works only where it can be checked. Every value it reads carries a word-for-word NASA quote, and every
  number it writes is checked again by code in the browser.

### Benefits

- Engineers and researchers get, in a minute, an answer that otherwise means reading 24 data pages
  and 352 publication records: which experiments are relevant to their environment, and which are not.
- Modellers get one clean, documented table with units converted and the source of every value.
- Mission planners see the gaps (oxygen-enriched low pressure, solid materials, partial gravity) before
  a habitat is designed around assumptions that were never tested.

### Intended impact

Make the limits of existing microgravity fire data visible, so that the next flight experiments target the
conditions crews will actually live in, and give modellers a trustworthy starting dataset.

### What we considered

- The users are researchers and engineers: a simple screen is fine, a wrong number is not. A value NASA
  does not report stays "not reported" and earns no points in the ranking.
- Traceability: every value leads to its NASA file, row and original cell.
- A table row is not always a test: rows that sum up a test day or a test-matrix range are marked and are
  not counted as tests.
- Reproducibility: a static site with no server, no key and no model call at run time gives the same answer
  every time, and the code, the mappings and the data contract are open.

### Tools, languages, software

Python (data pipeline: requests, openpyxl, python-docx, pdfplumber), TypeScript, Next.js with static export,
React, Tailwind CSS, Vitest, ESLint, GitHub Actions and GitHub Pages; Claude Code as the SI assistant.
Details in the References field.

### Data quality and limits

- 1,989 rows from 22 tables; 1,872 are individual tests. Oxygen is reported for 1,479 tests, pressure for
  1,258, airflow for 793, the outcome for 623. Missing values are shown as "not reported", never as zero.
- Automated checks: over 2,100 oxygen, pressure and airflow values in 8 tables were compared with their
  source cells after unit conversion, and all match within 2 %. The site has 179 unit tests and the pipeline 44.
- The ranking weights and the rules SI followed when reading the operators' notes are a first version.
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
  data pipeline and their tests, working from architecture rules and a data contract the team agreed on first.
  The changes were checked with unit tests (179 for the site, 44 for the pipeline), type checks, linting,
  contract validation and testing in the browser.
- **Planning and documents.** An AI assistant helped research approaches and draft the work plan, the team
  documents, the text of this page and the layout of the demo slides.

What SI does not do: it does not set or adjust a score, it does not fill a value that no NASA file reports,
and it does not draw conclusions about how materials burn. Ranking, coverage and gaps are computed by open,
tested code in the browser. Investigation cards quote NASA metadata word for word, and no model writes them.
The briefs and the note readings were written in a Claude Code session, not through an API; the instructions
the model followed are in the repository (`apps/web/src/content/briefs.prompt.md`,
`pipeline/mappings/si/README.md`).

How SI output is marked: an SI badge next to the brief and next to every value read from a note; the model's
name in `apps/web/src/content/briefs.json` and in the notes of each row; a footer line on every demo slide.
No image, video or audio was generated: every picture is a screenshot of the app.

## NASA Data

- **NASA Physical Sciences Informatics (PSI) data repository, Combustion Science** (https://psi.nasa.gov,
  CC0-1.0). This is the only data source of the project. Through the PSI API we used the metadata, the 22
  experiment tables and the science documents of all 24 combustion investigations:
  ACME Flame Design (PSI-10), ACME BRE (PSI-20), ACME CLD Flame (PSI-21), ACME E-FIELD Flames (PSI-22),
  ACME s-Flame (PSI-23), BASS-II (PSI-25), BASS (PSI-26), CFI (PSI-39), DAFT / DAFT-2 (PSI-47), FLEX-2 (PSI-68),
  FLEX (PSI-69), SAFFIRE-I (PSI-98), SAFFIRE-II (PSI-99), SAFFIRE-III (PSI-100), SAME-R (PSI-101), SAME (PSI-102),
  SLICE (PSI-106), SPICE (PSI-107), ACME CFI-G (PSI-159), and the ground investigations PSI-60, PSI-62, PSI-115,
  PSI-117 and PSI-142.
- **Science documents inside PSI** that supply values the tables leave out: the BASS As Run Test Matrix
  (oxygen, pressure, airflow and the operators' notes of 121 tests), the sensor telemetry of SAFFIRE-I, -II,
  -III and SAME-R (pressure of 95 tests), and the SPICE final report.
- **NASA Space Apps Challenge 2026, "Flame in Freefall" challenge page**, section "Potential Considerations":
  the atmosphere of the preset environments (at least 30 % oxygen at 10.2 psi or less for habitats and rovers,
  100 % oxygen at 4.3 psi for a spacesuit).
  https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- **NASA background pages** used for the problem statement: Combustion Science at NASA Glenn Research Center,
  "A Researcher's Guide to International Space Station Combustion Science", the Apollo 1 mission page, and "25 Years Ago: Fire Aboard
  Space Station Mir". Links are in the References field.

Links entered in the form (name, then address):

1. NASA Physical Sciences Informatics (PSI), Combustion Science: metadata, 22 experiment tables and science documents of 24 investigations (CC0-1.0) — https://psi.nasa.gov/physci/repo/search?q=combustion
2. PSI-26 BASS (Burning and Suppression of Solids): experiment table and As Run Test Matrix — https://doi.org/10.60555/58h4-dy80
3. PSI-159 ACME CFI-G: experiment tables, the only tests run in the exploration atmosphere — https://doi.org/10.60555/cyt1-kh64
4. PSI-101 SAME-R: experiment table and sensor telemetry — https://doi.org/10.60555/2np7-jv14
5. PSI-107 SPICE: experiment table and final report — https://doi.org/10.60555/9kbh-e962
6. NASA Space Apps Challenge 2026: Flame in Freefall challenge page (habitat and spacesuit atmospheres) — https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
7. NASA Glenn Research Center: Combustion Science — https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
8. NASA: A Researcher's Guide to International Space Station Combustion Science — https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/
9. NASA: Apollo 1 — https://www.nasa.gov/mission/apollo-1/
10. NASA History: 25 Years Ago: Fire Aboard Space Station Mir — https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/

## Space Agency Partner Data and Other References

No Space Agency Partner data was used. Everything else the project uses:

NASA resources
- NASA Physical Sciences Informatics (PSI), Combustion Science: https://psi.nasa.gov/physci/repo/search?q=combustion (CC0-1.0)
- NASA Glenn Research Center, Combustion Science: https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
- A Researcher's Guide to International Space Station Combustion Science: https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/
- Flame in Freefall challenge page: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- Apollo 1: https://www.nasa.gov/mission/apollo-1/
- 25 Years Ago: Fire Aboard Space Station Mir: https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/

Software libraries (all open source)
- requests (Apache-2.0), openpyxl (MIT), python-docx (MIT), pdfplumber with pdfminer.six (MIT): the Python data pipeline
- Next.js 16 (MIT), React 19 (MIT), TypeScript 5 (Apache-2.0), Tailwind CSS 4 (MIT): the web app
- Vitest 4 (MIT), ESLint 9 (MIT): tests and code checks
- Geist and Geist Mono typefaces by Vercel (SIL Open Font License 1.1), from Google Fonts: the app and the slides

Services
- GitHub, GitHub Actions and GitHub Pages: code hosting, checks, the live app and the demo slides

SI tools
- Claude Code with Claude Fable 5.2 and Claude Opus 5.5 (Anthropic): code, table mappings, tests, documents, slide layout
- Claude Fable 5.2 in a Claude Code session: the SI briefs and the reading of the BASS operators' notes
- BMAD Method 6.12.4 and Spec Kit: document structure for the architecture and the pipeline specification

Images and media
- Every image in the app, the README and the slides is a screenshot of Flame Atlas itself. No third-party
  image, video or music is used, and none was generated.

The same list with links to every library is in `submission/references.md` in the repository.

Links entered in the form (name, then address):

1. Next.js 16 (MIT): web app framework, static export — https://nextjs.org
2. React 19 (MIT): user interface — https://react.dev
3. TypeScript 5 (Apache-2.0) — https://www.typescriptlang.org
4. Tailwind CSS 4 (MIT): styling — https://tailwindcss.com
5. Vitest 4 (MIT): unit tests of the site — https://vitest.dev
6. ESLint 9 (MIT): code checks — https://eslint.org
7. requests (Apache-2.0): HTTP client for the PSI API — https://github.com/psf/requests
8. openpyxl (MIT): reading .xlsx tables — https://foss.heptapod.net/openpyxl/openpyxl
9. python-docx (MIT): reading .docx text and tables — https://github.com/python-openxml/python-docx
10. pdfplumber (MIT): reading .pdf text and tables — https://github.com/jsvine/pdfplumber
11. Geist and Geist Mono typefaces (SIL OFL 1.1): the app and the demo slides — https://vercel.com/font
12. GitHub Pages and GitHub Actions: hosting of the app and the demo slides, automated checks — https://pages.github.com
13. Claude Code with Claude Fable 5.2 and Claude Opus 5.5 (SI tool): code, table mappings, SI briefs, reading of operator notes, documents, slide layout — https://claude.com/claude-code
14. BMAD Method 6.12.4: structure of the architecture document — https://github.com/bmad-code-org/BMAD-METHOD
15. Spec Kit: structure of the pipeline specification — https://github.com/github/spec-kit
16. Flame Atlas repository: the full list of references — https://github.com/vlo0D/flame-atlas/blob/main/submission/references.md

## Before pressing Submit for Judging

- Every member is visible on the Members tab of the team page, all at the same Local Event.
- Open the demo link and the project link in a private browser window: both must open without a login.
- Tick both consent boxes, press Submit for Judging, then open the project page from another device.
