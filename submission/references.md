# References (English, goes into the project form)

Every external resource must be listed, even if it is open source or freely available.
Everyone adds a line when they bring something in; roles B and E clean it up on Sunday.

## NASA data and resources

- NASA Physical Sciences Informatics (PSI) Data Repository, Combustion Science — https://psi.nasa.gov/physci/repo/search?q=combustion (CC0-1.0)
- NASA Glenn Research Center, Combustion Science — https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/
- A Researcher's Guide to International Space Station Combustion Science — https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science/
- NASA Space Apps Challenge 2026, "Flame in Freefall" challenge page — https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/

## Software libraries

| Library | Purpose | License | Link |
|---|---|---|---|
| requests | HTTP client for the PSI API | Apache-2.0 | https://github.com/psf/requests |
| openpyxl | reading .xlsx tables | MIT | https://foss.heptapod.net/openpyxl/openpyxl |
| python-docx | reading .docx text and tables | MIT | https://github.com/python-openxml/python-docx |
| pdfplumber (pdfminer.six) | reading .pdf text and tables | MIT | https://github.com/jsvine/pdfplumber |
| Next.js 16 | web app framework, static export | MIT | https://nextjs.org |
| React 19 | user interface | MIT | https://react.dev |
| TypeScript 5 | typed JavaScript | Apache-2.0 | https://www.typescriptlang.org |
| Tailwind CSS 4 | styling | MIT | https://tailwindcss.com |
| Vitest 4 | unit tests of the site | MIT | https://vitest.dev |
| ESLint 9 | code checks | MIT | https://eslint.org |

## Services

| Service | Purpose |
|---|---|
| GitHub, GitHub Actions, GitHub Pages | code hosting, checks and the live app |

## AI tools

| Tool / model | Purpose |
|---|---|
| Claude Code (Claude Fable 5.2, Claude Opus 5.5) | writing the web app, the data pipeline, the table mappings and their tests; checked by unit tests, contract validation and review |
| Claude Fable 5.2, in a Claude Code session | in the product: wrote the SI brief of each preset environment (`apps/web/src/content/briefs.json`) and read the BASS operators' notes for ignition, outcome and burn time (`pipeline/mappings/si/PSI-26_BASS-notes.json`); code checks every number, name and quote against the data |
| BMAD Method 6.12.4 | structure for the architecture document of the web app |
| Spec Kit (document structure only) | structure for the pipeline specification in `specs/001-psi-ingest` |

## Images and media

| Item | Source | License |
|---|---|---|
| | | |
