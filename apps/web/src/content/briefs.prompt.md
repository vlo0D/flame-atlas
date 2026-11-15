# Instructions for the SI brief (version 1)

These are the instructions the language model follows when it writes `briefs.json`.
Its only input is the facts file made by `npm run brief-facts`: for each preset environment,
a flat list of `key = value` computed by the same code that draws the Scenario screen.

## Task

For each preset environment write four to six sentences for a fire-safety engineer who has just
chosen that environment. Say, in this order:

1. how many tests with the environment's fuel were run near it;
2. how the environment compares with the conditions those tests covered;
3. which investigations rank highest and what in the data puts them there, with the caveat the facts give;
4. what the data does not cover: the exploration atmosphere, partial gravity.

## Rules

- Use only the facts given. Do not add anything from general knowledge about combustion.
- Do not draw physical conclusions and do not give a safety rating or a recommendation. The brief is about
  what was tested and what was not.
- Write every data value in digits, as the fact gives it or rounded. Do not compute new numbers
  (no sums, differences, ratios or percentages that are not facts).
- Name an investigation exactly as its fact names it.
- Use "no", "none", "zero" or "never" only for a fact that is 0 or not reported.
- Do not name a single test by its label.
- For every sentence list the keys of the facts it rests on. Every number and investigation name in the
  sentence must come from one of those keys.
- Plain English, one idea per sentence, no headings, no lists.

## Output

`briefs.json`: for each environment `{ "scenarioId": "...", "sentences": [ { "text": "...", "facts": ["key", ...] } ] }`.

## What happens next

`verifyBrief` in `src/domain/brief.ts` checks each sentence against the facts it cites. A unit test runs it on
the current data, so a brief that no longer matches the data fails the build. The site runs the same check
in the browser and does not show a sentence that fails.
