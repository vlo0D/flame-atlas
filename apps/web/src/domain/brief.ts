/**
 * The SI brief: a few sentences a language model wrote ahead of time about a preset environment,
 * and the code that decides whether each sentence may be shown (architecture rules AD-3, AD-12).
 *
 * The model is given only the facts built here, which come from the same functions that draw the
 * Scenario screen. It does not compute anything and does not set a score. verifyBrief then checks
 * every sentence against the facts it cites; a sentence that fails is not shown.
 */

import type { Investigation } from "@/generated/contract";
import { EXPLORATION_ATMOSPHERE, NEAR_SCENARIO } from "./config";
import { EXPLORATION_INTERVALS } from "./coverage";
import { NO_FILTERS, filterTests, rowRanges } from "./filters";
import { formatGravityLevels, formatList, kpaToPsi } from "./format";
import { collectGapFacts, testedConditions } from "./gaps";
import { checkedPoints, focusTier, rankInvestigations } from "./rank";
import { isTestRow } from "./rows";
import type {
  BriefFacts,
  BriefSentence,
  BriefSentenceCheck,
  BuildBriefFacts,
  FactValue,
  RankComponent,
  VerifyBrief,
} from "./types";

/** How many of the top-ranked investigations the facts describe. */
export const BRIEF_TOP_RANKS = 3;

const COMPONENT_WORDS: Record<RankComponent, string> = {
  o2: "oxygen",
  fuel: "fuel state",
  pressure: "pressure",
  pillar: "focus",
  flow: "airflow",
  data: "amount of data",
  gravity: "gravity",
};

/** The name a brief uses for an investigation: its acronym, or its id when PSI gives none. */
export function investigationName(investigation: Pick<Investigation, "id" | "acronym">): string {
  return investigation.acronym ?? investigation.id;
}

/** Every name and id a brief could mention, for the name check of verifyBrief. */
export function knownInvestigationNames(investigations: readonly Pick<Investigation, "id" | "acronym">[]): string[] {
  const names = new Set<string>();
  for (const investigation of investigations) {
    names.add(investigation.id);
    if (investigation.acronym) names.add(investigation.acronym);
  }
  return [...names];
}

function listOrNull(values: readonly string[]): string | null {
  return values.length === 0 ? null : formatList(values);
}

export const buildBriefFacts: BuildBriefFacts = (scenario, investigations, tests) => {
  const facts: BriefFacts = {};
  const byId = new Map(investigations.map((investigation) => [investigation.id, investigation]));
  const nameOf = (id: string) => {
    const investigation = byId.get(id as Investigation["id"]);
    return investigation ? investigationName(investigation) : id;
  };
  const allTests = tests.filter(isTestRow);

  // The environment itself.
  facts["scenario.o2Pct"] = scenario.o2Pct;
  facts["scenario.pressureKpa"] = scenario.pressureKpa;
  facts["scenario.pressurePsi"] = kpaToPsi(scenario.pressureKpa);
  facts["scenario.gravityG"] = scenario.gravityG;
  facts["scenario.flowCmSMin"] = scenario.flowCmSMin;
  facts["scenario.flowCmSMax"] = scenario.flowCmSMax;
  facts["scenario.fuel"] = scenario.fuelStates.length === 0 ? "any" : scenario.fuelStates.join(" or ");
  facts["scenario.focus"] = scenario.focus;

  facts["data.tests"] = allTests.length;
  facts["data.investigations"] = investigations.length;

  // What the tests with the environment's fuel covered.
  const tested = testedConditions(scenario, tests);
  facts["tested.total"] = tested.total;
  facts["tested.o2Min"] = tested.o2Pct.min;
  facts["tested.o2Max"] = tested.o2Pct.max;
  facts["tested.o2Reported"] = tested.o2Pct.reported;
  facts["tested.pressureKpaMin"] = tested.pressureKpa.min;
  facts["tested.pressureKpaMax"] = tested.pressureKpa.max;
  facts["tested.pressureReported"] = tested.pressureKpa.reported;
  facts["tested.gravity"] = tested.gravity.length === 0 ? null : formatGravityLevels(tested.gravity);

  // The gaps, from the same numbers that write the gap sentences.
  const collected = collectGapFacts(scenario, tests);
  const gaps = new Map(collected.map(({ facts: gap }) => [gap.kind, gap]));

  const near = gaps.get("near-scenario");
  // The rows of this gap are the near tests only when there are any; otherwise the single closest test.
  const nearRows = near && near.count > 0 ? (collected.find(({ facts: gap }) => gap.kind === "near-scenario")?.rows ?? []) : [];
  facts["near.investigations"] = listOrNull([...new Set(nearRows.map((row) => nameOf(row.investigationId)))]);
  facts["near.fuelStates"] = listOrNull([...new Set(nearRows.flatMap((row) => (row.fuelState ? [row.fuelState] : [])))]);
  facts["near.o2Window"] = NEAR_SCENARIO.o2Pct;
  facts["near.pressureWindowKpa"] = NEAR_SCENARIO.pressureKpa;
  facts["near.count"] = near?.count ?? null;
  facts["near.total"] = near?.total ?? null;
  facts["near.comparable"] = near?.comparable ?? null;
  facts["near.unknownPressure"] = near?.unknownPressure ?? null;
  const closest = near?.nearest ?? null;
  const closestRanges = closest ? rowRanges(closest) : null;
  facts["near.closest.investigation"] = closest ? nameOf(closest.investigationId) : null;
  facts["near.closest.label"] = closest?.label ?? null;
  facts["near.closest.o2Min"] = closestRanges?.o2Pct.min ?? null;
  facts["near.closest.o2Max"] = closestRanges?.o2Pct.max ?? null;
  facts["near.closest.pressureKpaMin"] = closestRanges?.pressureKpa.min ?? null;
  facts["near.closest.pressureKpaMax"] = closestRanges?.pressureKpa.max ?? null;

  const solids = gaps.get("exploration-solids");
  facts["exploration.minO2Pct"] = EXPLORATION_ATMOSPHERE.minO2Pct;
  facts["exploration.maxPressureKpa"] = EXPLORATION_ATMOSPHERE.maxPressureKpa;
  facts["exploration.maxPressurePsi"] = kpaToPsi(EXPLORATION_ATMOSPHERE.maxPressureKpa);
  facts["exploration.solidTests"] = solids?.count ?? null;
  facts["exploration.solidTotal"] = solids?.total ?? null;
  facts["exploration.solidUnknownPressure"] = solids?.unknownPressure ?? null;
  const inExploration = filterTests(tests, {
    ...NO_FILTERS,
    granularities: ["test"],
    o2Pct: EXPLORATION_INTERVALS.o2Pct,
    pressureKpa: EXPLORATION_INTERVALS.pressureKpa,
  });
  facts["exploration.allTests"] = inExploration.length;
  facts["exploration.allInvestigations"] = listOrNull([
    ...new Set(inExploration.map((row) => nameOf(row.investigationId))),
  ]);
  facts["exploration.allFuelStates"] = listOrNull([
    ...new Set(inExploration.flatMap((row) => (row.fuelState ? [row.fuelState] : []))),
  ]);

  const burner = gaps.get("burner-oxygen");
  facts["burner.tests"] = burner?.count ?? null;
  facts["burner.maxO2Pct"] = burner?.maxPct ?? null;
  facts["burner.atExplorationOxygen"] = burner?.atExplorationOxygen ?? null;

  const partial = gaps.get("partial-gravity");
  facts["partial.realTests"] = partial?.count ?? null;
  facts["partial.simulatedTests"] = partial?.simulated ?? null;
  facts["partial.simulatedSummaryRows"] = partial?.simulatedSummaryRows ?? null;

  const missing = gaps.get("not-reported");
  facts["notReported.pressure"] = missing?.count ?? null;
  facts["notReported.airflow"] = missing?.withoutFlow ?? null;

  // The top of the ranking.
  const ranking = rankInvestigations(scenario, investigations, tests);
  facts["rank.total"] = ranking.items.length;
  facts["score.max"] = 100;
  facts["rank.focusMain"] =
    scenario.focus === "all"
      ? null
      : investigations.filter((investigation) => focusTier(scenario, investigation) === 0).length;
  ranking.items.slice(0, BRIEF_TOP_RANKS).forEach((item, index) => {
    const investigation = byId.get(item.investigationId);
    if (!investigation) return;
    const key = `rank.${index + 1}`;
    const { conditions } = investigation;
    facts[`${key}.id`] = investigation.id;
    facts[`${key}.name`] = investigationName(investigation);
    facts[`${key}.score`] = item.score;
    facts[`${key}.checkedPoints`] = checkedPoints(item);
    facts[`${key}.pillar`] = investigation.pillarPrimary;
    facts[`${key}.fuelStates`] = listOrNull(investigation.fuelStates);
    facts[`${key}.standsInFor`] = investigation.fuelAnalogOf
      ? listOrNull(investigation.fuelAnalogOf.states)
      : null;
    facts[`${key}.tests`] = allTests.filter((row) => row.investigationId === investigation.id).length;
    facts[`${key}.rows`] = investigation.testStats.rowCount;
    facts[`${key}.o2Min`] = conditions.o2PctMin;
    facts[`${key}.o2Max`] = conditions.o2PctMax;
    facts[`${key}.pressureKpaMin`] = conditions.pressureKpaMin;
    facts[`${key}.pressureKpaMax`] = conditions.pressureKpaMax;
    facts[`${key}.notReported`] = listOrNull(item.unknownComponents.map((name) => COMPONENT_WORDS[name]));
  });

  return facts;
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A name as a whole word: "BASS" is not found inside "BASS-II", nor "PSI-2" inside "PSI-20". */
function nameRegExp(name: string): RegExp {
  return new RegExp(`(?<![\\w-])${escapeRegExp(name)}(?![\\w-])`, "g");
}

/** A number as written, with or without thousands separators: "1,872", "56.5", "0". */
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Words that claim an absence. A sentence may use one only when a fact it cites is zero or missing. */
const ABSENCE = /\b(?:no|none|zero|never)\b/i;

function decimalsOf(token: string): number {
  const dot = token.indexOf(".");
  return dot === -1 ? 0 : token.length - dot - 1;
}

/** True when the number, as written, is the fact rounded to the precision it was written with. */
function numberMatches(token: string, value: number): boolean {
  const decimals = decimalsOf(token);
  return Number(token).toFixed(decimals) === value.toFixed(decimals);
}

function checkSentence(
  sentence: BriefSentence,
  facts: BriefFacts,
  knownNames: readonly string[],
): BriefSentenceCheck {
  const problems: string[] = [];
  const cited: FactValue[] = [];
  for (const key of sentence.facts) {
    if (key in facts) cited.push(facts[key]);
    else problems.push(`cites "${key}", which is not a fact of this environment`);
  }
  const citedNumbers = cited.filter((value): value is number => typeof value === "number");
  const citedStrings = cited.filter((value): value is string => typeof value === "string");

  // Names first: longest first, and each one is blanked out so "BASS-II" is not read again as the number 2.
  let text = sentence.text;
  let names = 0;
  for (const name of [...knownNames].sort((a, b) => b.length - a.length)) {
    const pattern = nameRegExp(name);
    if (!pattern.test(text)) continue;
    text = text.replace(nameRegExp(name), " ");
    if (citedStrings.some((value) => nameRegExp(name).test(value))) names += 1;
    else problems.push(`names ${name} without citing a fact about it`);
  }

  let numbers = 0;
  for (const written of text.match(NUMBER) ?? []) {
    const token = written.replaceAll(",", "");
    if (citedNumbers.some((value) => numberMatches(token, value))) numbers += 1;
    else problems.push(`the number ${written} matches none of the facts it cites`);
  }

  if (ABSENCE.test(text) && !cited.some((value) => value === 0 || value === null)) {
    problems.push("says something is absent without citing a fact that is zero or not reported");
  }
  if (sentence.facts.length === 0) problems.push("cites no fact");

  return { ok: problems.length === 0, numbers, names, problems };
}

/**
 * Checks every sentence of a brief against the facts it cites:
 *
 * 1. each cited key is a fact of this environment;
 * 2. each number in the text equals a cited fact, rounded to the precision the number is written with;
 * 3. each investigation named in the text is named by a cited fact;
 * 4. "no", "none", "zero" and "never" appear only when a cited fact is zero or not reported.
 *
 * It cannot tell whether a sentence is well put; it can tell that its numbers and names are the data's.
 */
export const verifyBrief: VerifyBrief = (brief, facts, knownNames) => {
  const sentences = brief.sentences.map((sentence) => checkSentence(sentence, facts, knownNames));
  return {
    ok: sentences.length > 0 && sentences.every((sentence) => sentence.ok),
    sentences,
    numbersChecked: sentences.reduce((sum, sentence) => sum + sentence.numbers, 0),
    namesChecked: sentences.reduce((sum, sentence) => sum + sentence.names, 0),
  };
};
