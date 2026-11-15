# Demo slides (7 at most, English only)

The demo is a seven-slide PDF. The guide allows seven slides including the title; more than seven makes the
project ineligible for global judging.

- **Public link for the form:** https://vlo0d.github.io/flame-atlas/demo/flame-atlas-demo.pdf
- **Source:** `submission/demo/slides.html` (one HTML file, screenshots in `submission/demo/img/` and
  `submission/screenshots/`).
- **Build:** `submission/demo/build.sh` prints the HTML to `apps/web/public/demo/flame-atlas-demo.pdf` with
  headless Chrome; GitHub Pages serves that file with the app.

The guide asks the slides to name the team, its members and the challenge, to show the project, to describe
the user experience and to say how NASA open data makes the solution possible.

| # | Slide | What it answers | Picture |
|---|---|---|---|
| 1 | Title | project, tagline, challenge, team name and members, live app | Scenario screen |
| 2 | The problem | habitats plan at least 30 % oxygen at 70.3 kPa or less; the data is in 24 investigations, 22 tables, 352 publication records | three atmospheres as oxygen and pressure bars |
| 3 | The solution | the user experience: set the environment, see what was tested near it, get 24 investigations ranked | the form, the findings card, the first card of the ranking |
| 4 | NASA open data | PSI → one mapping per table → one table of 1,872 tests → open any row, export | Tests table with a BASS row opened to its source |
| 5 | What the data shows | 0 of 379 solid-fuel tests in the exploration atmosphere; 22.7 % is the highest oxygen for a solid; 20 of 1,872 tests there, all gas flames; no partial gravity | Coverage grid, solid fuels only |
| 6 | SI-powered, and checkable | SI maps the tables, reads 121 operator notes, writes 5 briefs; code checks each result; what SI never does | SI brief with "What was checked" open |
| 7 | Impact and next steps | who gains (engineers, modellers, mission planners), what is next, links to the app and the repository | none |

Rules kept: one theme throughout, no images or music from outside (every picture is a screenshot of the app),
no people in the pictures, and a footer line on every slide that the layout was drafted with SI.

Slide 1 names the team (nonchalant, Kyiv) and its five members as they appear on the Members tab of the team page.
