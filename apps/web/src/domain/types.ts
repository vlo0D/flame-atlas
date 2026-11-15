/**
 * Shapes shared between screens (architecture rule AD-12).
 *
 * Inputs and results of the domain functions are fixed here first, so two people
 * can build a function and the screen that shows it at the same time. A function
 * in src/domain is typed with the matching alias at the bottom of this file.
 */

import type { FuelState, Investigation, InvestigationId, Pillar, Scenario, TestRecord } from "@/generated/contract";
import type { CoverageAxis, RANK_WEIGHTS } from "./config";
import type { Interval } from "./num";

/** The environment the user is asking about. Built from a preset, from the address, or both. */
export interface ScenarioInput {
  /** Id of the preset these values came from, or null once the user changed a value. */
  presetId: string | null;
  o2Pct: number;
  pressureKpa: number;
  gravityG: number;
  flowCmSMin: number | null;
  flowCmSMax: number | null;
  fuelStates: FuelState[];
  focus: Pillar | "all";
}

export function scenarioInputFromPreset(preset: Scenario): ScenarioInput {
  return {
    presetId: preset.id,
    o2Pct: preset.o2Pct,
    pressureKpa: preset.pressureKpa,
    gravityG: preset.gravityG,
    flowCmSMin: preset.flowCmSMin,
    flowCmSMax: preset.flowCmSMax,
    fuelStates: [...preset.fuelStates],
    focus: preset.focus,
  };
}

export type RankComponent = keyof typeof RANK_WEIGHTS;

export interface RankItem {
  investigationId: InvestigationId;
  /** 0 to 100. */
  score: number;
  /** Each component is 0 to 1, before weighting. */
  components: Record<RankComponent, number>;
  /** Components the data does not report; they earn UNKNOWN_COMPONENT_SCORE. */
  unknownComponents: RankComponent[];
  /** Plain-English warnings, e.g. "Pressure is not reported for this investigation". */
  caveats: string[];
  /** Ids of the closest rows, nearest first. Up to three. */
  nearestRowIds: string[];
}

export interface RankResult {
  scenario: ScenarioInput;
  /** Highest score first; equal scores ordered by investigation id. */
  items: RankItem[];
}

export interface CoverageCell {
  x: Interval;
  y: Interval;
  /** Rows with granularity "test" that fall in the cell. */
  tests: number;
  /** Test-day, matrix and reference rows that fall in the cell. */
  otherRows: number;
  investigationIds: InvestigationId[];
}

export interface CoverageGrid {
  xAxis: "o2Pct";
  yAxis: Exclude<CoverageAxis, "o2Pct">;
  /** Row-major: every y interval for the first x interval, then the next x interval. */
  cells: CoverageCell[];
  xIntervals: Interval[];
  yIntervals: Interval[];
  /** Rows left out because they report no value on an axis. */
  notReportedOnX: number;
  notReportedOnY: number;
  /** Rows counted in more than one cell because they list several values or a span. */
  multiCellRows: number;
}

export type GapKind = "near-scenario" | "exploration-solids" | "burner-oxygen" | "partial-gravity" | "not-reported";

export interface Gap {
  kind: GapKind;
  /** The number the statement is about. */
  count: number;
  /** What the count is out of, when that makes sense. */
  total: number | null;
  /** One sentence, written only by describeGap in src/domain/gaps.ts. */
  statement: string;
  /** Rows behind the count, for the link to the Tests screen. */
  rowIds: string[];
}

export interface TestFilters {
  investigationIds: InvestigationId[];
  fuelStates: FuelState[];
  o2Pct: Interval | null;
  pressureKpa: Interval | null;
  flowCmS: Interval | null;
  outcomes: NonNullable<TestRecord["outcome"]>[];
  granularities: TestRecord["granularity"][];
  /** When false, a row that does not report a filtered value is left out. */
  includeNotReported: boolean;
}

export interface VariableSummary {
  /** Field name in TestRecord, e.g. "o2Pct". */
  field: string;
  label: string;
  status: "constant" | "varied" | "not-reported";
  /** Ready-to-show text, made with src/domain/format.ts. */
  display: string;
  distinctValues: number;
}

/** One computed fact about an environment: a count, a measured value, a name, or null when there is none. */
export type FactValue = number | string | null;

/** Everything the SI brief may talk about, keyed by a stable name such as "near.count" or "rank.1.score". */
export type BriefFacts = Record<string, FactValue>;

/** One sentence of an SI brief and the facts it rests on. Written by a language model, checked by verifyBrief. */
export interface BriefSentence {
  text: string;
  /** Keys of BriefFacts. Every number and investigation name in `text` must match one of them. */
  facts: string[];
}

/** The SI brief of one preset environment. */
export interface Brief {
  scenarioId: string;
  sentences: BriefSentence[];
}

/** The file of briefs shipped with the site (src/content/briefs.json). */
export interface BriefFile {
  /** The language model that wrote the sentences. */
  model: string;
  /** How the model was run, in a few words. */
  method: string;
  /** Version of the instructions in src/content/briefs.prompt.md. */
  promptVersion: string;
  /** ISO date. */
  writtenAt: string;
  briefs: Brief[];
}

export interface BriefSentenceCheck {
  ok: boolean;
  /** Numbers in the sentence that matched a cited fact. */
  numbers: number;
  /** Investigation names in the sentence that matched a cited fact. */
  names: number;
  /** Why the sentence failed, in plain English. Empty when ok. */
  problems: string[];
}

export interface BriefCheck {
  /** True when every sentence passed. */
  ok: boolean;
  sentences: BriefSentenceCheck[];
  numbersChecked: number;
  namesChecked: number;
}

export type BuildBriefFacts = (
  scenario: ScenarioInput,
  investigations: readonly Investigation[],
  tests: readonly TestRecord[],
) => BriefFacts;

/** `knownNames` are all investigation names and ids the site knows; a sentence may use only the ones it cites. */
export type VerifyBrief = (brief: Brief, facts: BriefFacts, knownNames: readonly string[]) => BriefCheck;

export type RankInvestigations = (
  scenario: ScenarioInput,
  investigations: readonly Investigation[],
  tests: readonly TestRecord[],
) => RankResult;

/** Distance between an environment and a row in normalized units; null when the row reports no condition. */
export type ConditionDistance = (scenario: ScenarioInput, row: TestRecord) => number | null;

export type BuildCoverageGrid = (
  tests: readonly TestRecord[],
  yAxis: CoverageGrid["yAxis"],
  fuelStates?: readonly FuelState[],
) => CoverageGrid;

export type FindGaps = (scenario: ScenarioInput, tests: readonly TestRecord[]) => Gap[];

export type FilterTests = (tests: readonly TestRecord[], filters: TestFilters) => TestRecord[];

export type SummarizeVariables = (tests: readonly TestRecord[]) => VariableSummary[];
