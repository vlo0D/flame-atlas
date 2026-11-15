# Demo slides (7 at most, English only)

Seven slides including the title. Screenshots come from the live app: https://vlo0d.github.io/flame-atlas/
Use the dark or light theme consistently. Do not add images or music without a licence; PSI images are CC0.

## 1. Title

- **Flame Atlas**
- See what NASA has already burned in microgravity, and what it has not, before a crew lives there.
- Team name, members (no photos of members under 18), challenge: *Flame in Freefall*.

## 2. The problem

- A fire in a spacecraft cannot be escaped: Apollo 1, Mir 1997.
- Lunar and Mars habitat concepts plan **≥30 % oxygen at ≤70.3 kPa (10.2 psi)**: more oxygen, less pressure,
  partial gravity. Materials burn differently there.
- NASA's evidence is spread over 24 investigations, 22 tables in different units and formats.

## 3. The solution: Scenario

- Screenshot: Scenario with the lunar habitat preset (findings card and the top of the ranking).
- Describe the environment → see the tests near it, what was actually tested, and the 24 investigations
  ranked with an open, seven-part score.

## 4. The data: one table from 22

- 1,989 rows → 1,872 individual tests, one schema, converted units.
- Every value leads to its NASA file, row and original cell; missing values stay "not reported".
- Screenshot: Tests table with an open row source; mention CSV and JSON export.

## 5. The finding

- Of 1,872 tests, **20** were run in the exploration atmosphere, all gas-burner flames (ACME CFI-G).
- **No solid material was tested above 22.7 % oxygen**; every solid-fuel test with a pressure was at
  ISS cabin pressure (98–102 kPa).
- No real partial-gravity test exists.
- Screenshot: Coverage grid, oxygen against pressure, exploration atmosphere marked.

## 6. Why you can trust it

- AI helped write code and mappings; code applies the mappings, keeps original cells, and the site runs no
  AI model: every number is computed by tested code.
- Quotes on cards are checked against the source by code.
- Over 2,100 converted values compared with their source cells; TODO: the 40-value hand check.
- Methodology screen shows how complete each condition is and where each value came from.

## 7. What next

- Target the next flight experiments at solid materials in oxygen-enriched, low-pressure atmospheres.
- A combustion specialist to review the ranking weights.
- Links: live app https://vlo0d.github.io/flame-atlas/ and repository https://github.com/vlo0D/flame-atlas
