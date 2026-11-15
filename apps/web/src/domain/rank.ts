/**
 * Ranking of investigations for a chosen environment (architecture rules AD-3, AD-6, AD-12).
 *
 * Formula v0, from docs/02-architecture.md section 5:
 *
 *   score = 100 × Σ weight × component        each component is 0 to 1
 *
 * The score says how close an investigation's test conditions are to the
 * environment. It is not a safety rating. Every number used here lives in config.ts.
 */

import type { Investigation, TestRecord } from "@/generated/contract";
import {
  DATA_SCORE,
  DISTANCE_SCALES,
  FUEL_SCORES,
  GRAVITY_CLASS_LIMITS,
  GRAVITY_SCORES,
  NEAREST_ROWS_LIMIT,
  NO_FORCED_FLOW_CM_S,
  PILLAR_SCORES,
  RANK_WEIGHTS,
  UNKNOWN_COMPONENT_SCORE,
  UNKNOWN_ROW_CONDITION_SCORE,
} from "./config";
import { formatGranularity, formatGravity, formatNumber } from "./format";
import { type Range, distanceBetweenRanges, distanceToRange } from "./num";
import { isTestRow } from "./rows";
import type { ConditionDistance, RankComponent, RankInvestigations, RankItem, ScenarioInput } from "./types";

/** One component of the score, before weighting. */
export interface ComponentScore {
  /** 0 to 1. */
  score: number;
  /** False when the data does not report the value, so the component earns UNKNOWN_COMPONENT_SCORE. */
  known: boolean;
  /** A sentence for the result card when there is something to warn about. */
  caveat: string | null;
}

function known(score: number, caveat: string | null = null): ComponentScore {
  return { score, known: true, caveat };
}

function notReported(what: string): ComponentScore {
  return {
    score: UNKNOWN_COMPONENT_SCORE,
    known: false,
    caveat: `${what} is not reported for this investigation, so that part of the score earns no points.`,
  };
}

/** 1 at distance 0, exp(-1) at one scale away, falling towards 0 beyond that. */
export function closeness(distance: number, scale: number): number {
  return Math.exp(-((distance / scale) ** 2));
}

/** The environment's airflow as a span. No forced airflow is the single value NO_FORCED_FLOW_CM_S. */
export function scenarioFlowRange(scenario: ScenarioInput): Range {
  if (scenario.flowCmSMin !== null && scenario.flowCmSMax !== null) {
    return { min: scenario.flowCmSMin, max: scenario.flowCmSMax };
  }
  return { min: NO_FORCED_FLOW_CM_S, max: NO_FORCED_FLOW_CM_S };
}

export function scoreOxygen(scenario: ScenarioInput, investigation: Investigation): ComponentScore {
  const { o2PctMin, o2PctMax } = investigation.conditions;
  const distance = distanceToRange(scenario.o2Pct, { min: o2PctMin, max: o2PctMax });
  return distance === null ? notReported("Oxygen") : known(closeness(distance, DISTANCE_SCALES.o2Pct));
}

export function scorePressure(scenario: ScenarioInput, investigation: Investigation): ComponentScore {
  const { pressureKpaMin, pressureKpaMax } = investigation.conditions;
  const distance = distanceToRange(scenario.pressureKpa, { min: pressureKpaMin, max: pressureKpaMax });
  return distance === null ? notReported("Pressure") : known(closeness(distance, DISTANCE_SCALES.pressureKpa));
}

export function scoreFlow(scenario: ScenarioInput, investigation: Investigation): ComponentScore {
  const { flowCmSMin, flowCmSMax } = investigation.conditions;
  const distance = distanceBetweenRanges(scenarioFlowRange(scenario), { min: flowCmSMin, max: flowCmSMax });
  return distance === null ? notReported("Airflow speed") : known(closeness(distance, DISTANCE_SCALES.flowCmS));
}

export function scoreFuel(scenario: ScenarioInput, investigation: Investigation): ComponentScore {
  // No fuel chosen means no preference, like the focus "all".
  if (scenario.fuelStates.length === 0) return known(FUEL_SCORES.match);
  if (investigation.fuelStates.length === 0) return notReported("Fuel state");
  if (investigation.fuelStates.some((state) => scenario.fuelStates.includes(state))) return known(FUEL_SCORES.match);

  // The claim itself, with its source, is shown on the investigation card.
  const analog = investigation.fuelAnalogOf;
  if (analog && analog.states.some((state) => scenario.fuelStates.includes(state))) {
    return known(
      FUEL_SCORES.analog,
      `Its fuel stands in for ${analog.states.join(" and ")} fuels, so the fuel counts as a partial match.`,
    );
  }
  return known(FUEL_SCORES.none);
}

export function scorePillar(scenario: ScenarioInput, investigation: Investigation): ComponentScore {
  if (scenario.focus === "all" || scenario.focus === investigation.pillarPrimary) return known(PILLAR_SCORES.primary);
  if (investigation.pillarsSecondary.includes(scenario.focus)) return known(PILLAR_SCORES.secondary);
  return known(PILLAR_SCORES.other);
}

/** How much data the investigation has. It does not depend on the environment. */
export function scoreData(investigation: Investigation): ComponentScore {
  const { rowCount, tableFiles, granularities } = investigation.testStats;
  const rows = Math.min(1, Math.log10(1 + rowCount) / Math.log10(1 + DATA_SCORE.rowsForFullCredit));
  const table = tableFiles.length > 0 ? 1 : 0;
  const publications = Math.min(1, investigation.publications.length / DATA_SCORE.publicationsForFullCredit);
  const score =
    DATA_SCORE.rowsShare * rows + DATA_SCORE.tableShare * table + DATA_SCORE.publicationsShare * publications;

  let caveat: string | null = null;
  if (tableFiles.length === 0) {
    caveat = "This investigation has no experiment table in the data.";
  } else if (granularities.length > 0 && !granularities.includes("test")) {
    const kinds = granularities.map((granularity) => formatGranularity(granularity, true)).join(" and ");
    caveat = `Its table lists ${kinds}, not individual tests.`;
  }
  return known(score, caveat);
}

export type GravityClass = keyof typeof GRAVITY_SCORES;

export function gravityClass(gravityG: number): GravityClass {
  if (gravityG <= GRAVITY_CLASS_LIMITS.microMaxG) return "micro";
  if (gravityG >= GRAVITY_CLASS_LIMITS.normalMinG) return "normal";
  return "partial";
}

export function scoreGravity(scenario: ScenarioInput, investigation: Investigation): ComponentScore {
  const levels = investigation.conditions.gravity;
  if (levels.length === 0) return notReported("Gravity level");

  const scenarioClass = gravityClass(scenario.gravityG);
  const scores = GRAVITY_SCORES[scenarioClass];
  const best = levels.reduce((a, b) => (scores[b] > scores[a] ? b : a));

  let caveat: string | null = null;
  if (scenarioClass === "partial" && best === "partial-simulated") {
    caveat = "Partial gravity in this investigation was simulated, not real reduced gravity.";
  } else if (scores[best] < 1) {
    caveat = `Tested in ${formatGravity(best)}; the environment has ${formatNumber(scenario.gravityG, 3)} g.`;
  }
  return known(scores[best], caveat);
}

/** Normalized distance at which closeness() equals UNKNOWN_ROW_CONDITION_SCORE. Used for a condition a row does not report. */
const UNKNOWN_DISTANCE = Math.sqrt(-Math.log(UNKNOWN_ROW_CONDITION_SCORE));

/**
 * Distance between an environment and one row, over oxygen, pressure and airflow.
 *
 * Each condition is measured in its own scale (DISTANCE_SCALES) and weighted like
 * the score (RANK_WEIGHTS). A condition the row does not report counts as the
 * distance that gives UNKNOWN_ROW_CONDITION_SCORE, so a row with gaps is neither favoured
 * nor ruled out. A row that reports none of the three returns null.
 */
export const conditionDistance: ConditionDistance = (scenario, row) => {
  const o2 = distanceToRange(scenario.o2Pct, { min: row.o2PctMin, max: row.o2PctMax, values: row.o2PctValues });
  const pressure = distanceToRange(scenario.pressureKpa, { min: row.pressureKpaMin, max: row.pressureKpaMax });
  const flow = distanceBetweenRanges(scenarioFlowRange(scenario), { min: row.flowCmSMin, max: row.flowCmSMax });
  if (o2 === null && pressure === null && flow === null) return null;

  const parts: [distance: number | null, scale: number, weight: number][] = [
    [o2, DISTANCE_SCALES.o2Pct, RANK_WEIGHTS.o2],
    [pressure, DISTANCE_SCALES.pressureKpa, RANK_WEIGHTS.pressure],
    [flow, DISTANCE_SCALES.flowCmS, RANK_WEIGHTS.flow],
  ];
  let weighted = 0;
  let totalWeight = 0;
  for (const [distance, scale, weight] of parts) {
    const normalized = distance === null ? UNKNOWN_DISTANCE : distance / scale;
    weighted += weight * normalized ** 2;
    totalWeight += weight;
  }
  return Math.sqrt(weighted / totalWeight);
};

/**
 * Ids of the rows closest to the environment, nearest first.
 * Individual tests come first; summary rows are used only when the
 * investigation has no individual tests (architecture rule AD-5).
 */
export function nearestRowIds(scenario: ScenarioInput, rows: readonly TestRecord[]): string[] {
  const tests = rows.filter(isTestRow);
  const candidates = tests.length > 0 ? tests : rows;
  const measured: { row: TestRecord; distance: number }[] = [];
  for (const row of candidates) {
    const distance = conditionDistance(scenario, row);
    if (distance !== null) measured.push({ row, distance });
  }
  measured.sort(
    (a, b) => a.distance - b.distance || a.row.sourceRow - b.row.sourceRow || a.row.id.localeCompare(b.row.id),
  );
  return measured.slice(0, NEAREST_ROWS_LIMIT).map((item) => item.row.id);
}

const COMPONENT_ORDER = Object.keys(RANK_WEIGHTS) as RankComponent[];

/** Score and explanation for one investigation. */
export function rankInvestigation(
  scenario: ScenarioInput,
  investigation: Investigation,
  rows: readonly TestRecord[],
): RankItem {
  const parts: Record<RankComponent, ComponentScore> = {
    o2: scoreOxygen(scenario, investigation),
    fuel: scoreFuel(scenario, investigation),
    pressure: scorePressure(scenario, investigation),
    pillar: scorePillar(scenario, investigation),
    flow: scoreFlow(scenario, investigation),
    data: scoreData(investigation),
    gravity: scoreGravity(scenario, investigation),
  };

  const components = {} as Record<RankComponent, number>;
  const unknownComponents: RankComponent[] = [];
  const caveats: string[] = [];
  let total = 0;
  for (const name of COMPONENT_ORDER) {
    const part = parts[name];
    components[name] = part.score;
    total += RANK_WEIGHTS[name] * part.score;
    if (!part.known) unknownComponents.push(name);
    if (part.caveat !== null) caveats.push(part.caveat);
  }

  return {
    investigationId: investigation.id,
    // One decimal: float noise must not decide the order.
    score: Math.round(total * 1000) / 10,
    components,
    unknownComponents,
    caveats,
    nearestRowIds: nearestRowIds(scenario, rows),
  };
}

/**
 * How many of the 100 points could be checked against reported values. The rest belong
 * to components the data does not report, which earn nothing.
 */
export function checkedPoints(item: RankItem): number {
  let points = 0;
  for (const name of COMPONENT_ORDER) {
    if (!item.unknownComponents.includes(name)) points += RANK_WEIGHTS[name] * 100;
  }
  return Math.round(points * 10) / 10;
}

/** What one component adds to the 0 to 100 score, and the most it could add. */
export function componentPoints(item: RankItem, name: RankComponent): { earned: number; max: number } {
  const max = RANK_WEIGHTS[name] * 100;
  return { earned: max * item.components[name], max };
}

/**
 * Group of an investigation for the chosen focus: 0 when it is its main pillar, 1 when it is a
 * secondary pillar, 2 otherwise. With the focus "all pillars" every investigation is in group 0.
 *
 * The list is sorted by group first. Without it, a focus on detection put BASS and Saffire above
 * SAME and SAME-R, because the smoke tables do not report oxygen or pressure and the focus is
 * only 15 of the 100 points (docs/decisions.md).
 */
export function focusTier(scenario: ScenarioInput, investigation: Investigation): 0 | 1 | 2 {
  if (scenario.focus === "all" || scenario.focus === investigation.pillarPrimary) return 0;
  return investigation.pillarsSecondary.includes(scenario.focus) ? 1 : 2;
}

function idNumber(id: string): number {
  return Number(id.replace(/^PSI-/, ""));
}

export const rankInvestigations: RankInvestigations = (scenario, investigations, tests) => {
  const rowsByInvestigation = new Map<string, TestRecord[]>();
  for (const row of tests) {
    const rows = rowsByInvestigation.get(row.investigationId);
    if (rows) rows.push(row);
    else rowsByInvestigation.set(row.investigationId, [row]);
  }

  const tiers = new Map(investigations.map((investigation) => [investigation.id, focusTier(scenario, investigation)]));
  const items = investigations.map((investigation) =>
    rankInvestigation(scenario, investigation, rowsByInvestigation.get(investigation.id) ?? []),
  );
  // The chosen focus first, then the highest score; equal scores by investigation number, so the order never jumps.
  const tier = (item: RankItem) => tiers.get(item.investigationId) ?? 2;
  items.sort(
    (a, b) =>
      tier(a) - tier(b) || b.score - a.score || idNumber(a.investigationId) - idNumber(b.investigationId),
  );
  return { scenario, items };
};
