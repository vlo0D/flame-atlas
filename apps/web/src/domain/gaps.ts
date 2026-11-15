/**
 * Data gaps for a chosen environment: counts only, no AI (architecture rules AD-3, AD-5, AD-11, AD-12).
 *
 * Every count is made with the same filters as the Tests table, so the link
 * next to a gap opens exactly the rows it counted.
 */

import { type FuelState, GRAVITIES, type Gravity, type TestRecord } from "@/generated/contract";
import { BURNER_OXIDIZER, NEAR_SCENARIO } from "./config";
import { EXPLORATION_INTERVALS } from "./coverage";
import { NO_FILTERS, filterTests, rowRanges } from "./filters";
import {
  formatList,
  formatNumber,
  formatPressure,
  formatRange,
  formatText,
  formatValue,
  kpaToPsi,
} from "./format";
import { type Range, isKnown } from "./num";
import { conditionDistance } from "./rank";
import { isTestRow } from "./rows";
import type {
  FindGaps,
  Gap,
  GapKind,
  ScenarioInput,
  TestFilters,
} from "./types";

const TESTS_ONLY: TestFilters = { ...NO_FILTERS, granularities: ["test"] };

/**
 * The Tests filters that list the rows behind a gap, or null when the gap is
 * not a list of rows.
 */
export function gapFilters(
  kind: GapKind,
  scenario: ScenarioInput,
): TestFilters | null {
  switch (kind) {
    case "near-scenario":
      return {
        ...TESTS_ONLY,
        fuelStates: scenario.fuelStates,
        o2Pct: {
          lo: scenario.o2Pct - NEAR_SCENARIO.o2Pct,
          hi: scenario.o2Pct + NEAR_SCENARIO.o2Pct,
          closed: "both",
        },
        pressureKpa: {
          lo: scenario.pressureKpa - NEAR_SCENARIO.pressureKpa,
          hi: scenario.pressureKpa + NEAR_SCENARIO.pressureKpa,
          closed: "both",
        },
      };
    case "exploration-solids":
      return {
        ...TESTS_ONLY,
        fuelStates: ["solid"],
        o2Pct: EXPLORATION_INTERVALS.o2Pct,
        pressureKpa: EXPLORATION_INTERVALS.pressureKpa,
      };
    case "burner-oxygen":
    case "partial-gravity":
    case "not-reported":
      return null;
  }
}

/**
 * Oxygen of the oxidizer an inverse flame feeds through its burner, in % by volume, read from the
 * row's verbatim source cells. Null for any other row or when the cell is not a number (e.g. "RAMP").
 */
export function burnerO2Pct(row: TestRecord): number | null {
  if (row.raw[BURNER_OXIDIZER.flameTypeColumn]?.trim() !== BURNER_OXIDIZER.inverseValue) return null;
  const cell = row.raw[BURNER_OXIDIZER.o2FractionColumn]?.trim() ?? "";
  if (!/^\d*\.?\d+$/.test(cell)) return null;
  const fraction = Number(cell);
  return fraction > 0 && fraction <= 1 ? fraction * 100 : null;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

function fuelWords(states: readonly FuelState[]): string {
  return states.length === 0
    ? "any"
    : formatList(states).replaceAll("; ", " or ");
}

function describeRow(row: TestRecord): string {
  const ranges = rowRanges(row);
  const oxygen = formatRange(ranges.o2Pct, {
    unit: "%",
    approx: row.o2PctApprox,
  });
  return `${row.investigationId} ${formatText(row.label)} (oxygen ${oxygen}, pressure ${formatPressure(ranges.pressureKpa)})`;
}

/** The numbers a gap statement is built from. */
export interface GapFacts {
  kind: GapKind;
  count: number;
  total: number | null;
  scenario: ScenarioInput;
  /** near-scenario: the closest test when none is near. */
  nearest?: TestRecord | null;
  /** near-scenario: tests with the fuel that report both oxygen and pressure, so they can be placed at all. */
  comparable?: number;
  /**
   * near-scenario and exploration-solids: tests that match on fuel and oxygen
   * but do not report pressure, so they could not be counted either way.
   */
  unknownPressure?: number;
  /** partial-gravity: tests that simulated partial gravity. */
  simulated?: number;
  /** partial-gravity: summary rows (test days, matrix rows) that simulated partial gravity. */
  simulatedSummaryRows?: number;
  /** burner-oxygen: the highest oxidizer oxygen fed through a burner, in %. */
  maxPct?: number | null;
  /** burner-oxygen: tests whose burner oxidizer is at or above the exploration-atmosphere oxygen. */
  atExplorationOxygen?: number;
  /** not-reported: tests without an airflow speed. */
  withoutFlow?: number;
}

/** The only place that writes a sentence about a gap. */
export function describeGap(facts: GapFacts): string {
  const { count, total, scenario } = facts;
  switch (facts.kind) {
    case "near-scenario": {
      const fuel = fuelWords(scenario.fuelStates);
      const window = `within ${NEAR_SCENARIO.o2Pct} points of oxygen and ${NEAR_SCENARIO.pressureKpa} kPa of this environment`;
      if (total === 0) return `The data has no test with ${fuel} fuel.`;
      const unknown = facts.unknownPressure ?? 0;
      const extra =
        unknown > 0
          ? ` ${plural(unknown, "more test")} ${unknown === 1 ? "is" : "are"} that close in oxygen but ${unknown === 1 ? "does" : "do"} not report pressure.`
          : "";
      if (count > 0) {
        return `${plural(count, "test")} of ${total} with ${fuel} fuel ${count === 1 ? "was" : "were"} run ${window}.${extra}`;
      }
      if (facts.comparable === 0) {
        return `None of the ${plural(total ?? 0, "test")} with ${fuel} fuel reports both oxygen and pressure, so none can be placed near this environment.${extra}`;
      }
      const closest = facts.nearest
        ? ` The closest is ${describeRow(facts.nearest)}.`
        : "";
      return `None of the ${plural(total ?? 0, "test")} with ${fuel} fuel was run ${window}.${extra}${closest}`;
    }
    case "exploration-solids": {
      const oxygen = formatValue(EXPLORATION_INTERVALS.o2Pct.lo, "%");
      const kpa = EXPLORATION_INTERVALS.pressureKpa.hi;
      const pressure = `${formatNumber(kpa)} kPa (${formatNumber(kpaToPsi(kpa), 1)} psi)`;
      const unknown = facts.unknownPressure ?? 0;
      const extra =
        unknown > 0
          ? ` ${plural(unknown, "more test")} at that oxygen level ${unknown === 1 ? "does" : "do"} not report pressure.`
          : "";
      return `${plural(count, "solid-fuel test")} of ${total} ${count === 1 ? "was" : "were"} run at ${oxygen} oxygen or more and ${pressure} or less.${extra}`;
    }
    case "burner-oxygen": {
      if (count === 0) return "No test in the data fed its oxidizer through the burner.";
      const oxygen = formatValue(EXPLORATION_INTERVALS.o2Pct.lo, "%");
      const rich = facts.atExplorationOxygen ?? 0;
      return `${plural(count, "inverse-flame test")} fed the oxidizer through the burner into a fuel-filled chamber, at up to ${formatValue(facts.maxPct ?? null, "%", 1)} oxygen; ${rich} of them at ${oxygen} or more. They are gas flames, and the grid places tests by the oxygen of the surrounding gas, so they are not in it.`;
    }
    case "partial-gravity": {
      const simulated = facts.simulated ?? 0;
      const summary = facts.simulatedSummaryRows ?? 0;
      const summaryTail =
        summary > 0 ? ` ${plural(summary, "summary row")} (test days, not individual tests) simulated it with an electric field.` : "";
      const tail =
        simulated > 0
          ? `${plural(simulated, "test")} of ${total} simulated it.${summaryTail}`
          : summary > 0
            ? `None of the ${plural(total ?? 0, "individual test")} simulated it;${summaryTail.replace(" simulated it with", " did, with")}`
            : `None of the ${plural(total ?? 0, "test")} simulated it either.`;
      return `No test in the data was run at real partial gravity. ${tail}`;
    }
    case "not-reported":
      return `${plural(count, "test")} of ${total} ${count === 1 ? "does" : "do"} not report pressure; ${facts.withoutFlow ?? 0} ${facts.withoutFlow === 1 ? "does" : "do"} not report airflow speed.`;
  }
}

function gap(facts: GapFacts, rows: readonly TestRecord[]): Gap {
  return {
    kind: facts.kind,
    count: facts.count,
    total: facts.total,
    statement: describeGap(facts),
    rowIds: rows.map((row) => row.id),
  };
}

/** The span of one condition over a set of tests, and how many of them report it. */
export interface TestedSpan {
  min: number | null;
  max: number | null;
  reported: number;
}

/** What the individual tests with the environment's fuel actually covered. */
export interface TestedConditions {
  /** Individual tests with the environment's fuel. */
  total: number;
  o2Pct: TestedSpan;
  pressureKpa: TestedSpan;
  /** Gravity levels among those tests, in the contract's order. */
  gravity: Gravity[];
}

function span(ranges: readonly Range[]): TestedSpan {
  let min: number | null = null;
  let max: number | null = null;
  let reported = 0;
  for (const range of ranges) {
    if (!isKnown(range)) continue;
    reported += 1;
    min = min === null ? range.min : Math.min(min, range.min);
    max = max === null ? range.max : Math.max(max, range.max);
  }
  return { min, max, reported };
}

/**
 * The oxygen, pressure and gravity covered by the individual tests with the
 * environment's fuel, so the environment can be set beside them.
 */
export function testedConditions(scenario: ScenarioInput, tests: readonly TestRecord[]): TestedConditions {
  const withFuel = filterTests(tests, { ...TESTS_ONLY, fuelStates: scenario.fuelStates });
  const ranges = withFuel.map(rowRanges);
  const levels = new Set(withFuel.map((row) => row.gravity));
  return {
    total: withFuel.length,
    o2Pct: span(ranges.map((range) => range.o2Pct)),
    pressureKpa: span(ranges.map((range) => range.pressureKpa)),
    gravity: GRAVITIES.filter((level) => levels.has(level)),
  };
}

/**
 * The numbers behind every gap, with the rows each one counted, in the order the gaps are shown.
 * findGaps turns them into sentences; the SI brief (src/domain/brief.ts) reads the same numbers,
 * so a count is computed in one place only.
 */
export function collectGapFacts(
  scenario: ScenarioInput,
  tests: readonly TestRecord[],
): { facts: GapFacts; rows: readonly TestRecord[] }[] {
  const allTests = tests.filter(isTestRow);

  // 1. Tests with the environment's fuel, near its oxygen and pressure.
  const withFuel = filterTests(tests, {
    ...TESTS_ONLY,
    fuelStates: scenario.fuelStates,
  });
  const near = filterTests(tests, gapFilters("near-scenario", scenario)!);
  // Only a test that reports both values can be called near or closest.
  const comparable = withFuel.filter((row) => {
    const ranges = rowRanges(row);
    return isKnown(ranges.o2Pct) && isKnown(ranges.pressureKpa);
  });
  let nearest: TestRecord | null = null;
  if (near.length === 0) {
    let best = Infinity;
    for (const row of comparable) {
      const distance = conditionDistance(scenario, row);
      if (distance !== null && distance < best) {
        best = distance;
        nearest = row;
      }
    }
  }

  const nearFilters = gapFilters("near-scenario", scenario)!;
  const nearUnknownPressure = filterTests(tests, {
    ...nearFilters,
    pressureKpa: null,
  }).filter((row) => !isKnown(rowRanges(row).pressureKpa)).length;

  // 2. Solid-fuel tests inside the exploration atmosphere.
  const solids = filterTests(tests, { ...TESTS_ONLY, fuelStates: ["solid"] });
  const exploration = filterTests(
    tests,
    gapFilters("exploration-solids", scenario)!,
  );
  const unknownPressure = filterTests(tests, {
    ...TESTS_ONLY,
    fuelStates: ["solid"],
    o2Pct: EXPLORATION_INTERVALS.o2Pct,
  }).filter((row) => !isKnown(rowRanges(row).pressureKpa)).length;

  // 3. Partial gravity. The contract has no value for real partial gravity: PSI holds none.
  const simulated = allTests.filter(
    (row) => row.gravity === "partial-simulated",
  );
  const simulatedSummaryRows = tests.filter(
    (row) => !isTestRow(row) && row.gravity === "partial-simulated",
  ).length;

  // 3b. Inverse flames: oxygen fed through the burner, not in the surrounding gas.
  const burner = allTests.filter((row) => burnerO2Pct(row) !== null);
  const burnerPcts = burner.map((row) => burnerO2Pct(row) as number);
  const burnerMax = burnerPcts.length > 0 ? Math.max(...burnerPcts) : null;
  const burnerRich = burnerPcts.filter((pct) => pct >= EXPLORATION_INTERVALS.o2Pct.lo).length;

  // 4. Tests that leave out pressure or airflow.
  const withoutPressure = allTests.filter(
    (row) => !isKnown(rowRanges(row).pressureKpa),
  );
  const withoutFlow = allTests.filter(
    (row) => !isKnown(rowRanges(row).flowCmS),
  ).length;

  return [
    {
      facts: {
        kind: "near-scenario",
        count: near.length,
        total: withFuel.length,
        scenario,
        nearest,
        comparable: comparable.length,
        unknownPressure: nearUnknownPressure,
      },
      rows: near.length > 0 ? near : nearest ? [nearest] : [],
    },
    {
      facts: {
        kind: "exploration-solids",
        count: exploration.length,
        total: solids.length,
        scenario,
        unknownPressure,
      },
      rows: exploration,
    },
    {
      facts: {
        kind: "burner-oxygen",
        count: burner.length,
        total: null,
        scenario,
        maxPct: burnerMax,
        atExplorationOxygen: burnerRich,
      },
      rows: burner,
    },
    {
      facts: {
        kind: "partial-gravity",
        count: 0,
        total: allTests.length,
        scenario,
        simulated: simulated.length,
        simulatedSummaryRows,
      },
      rows: simulated,
    },
    {
      facts: {
        kind: "not-reported",
        count: withoutPressure.length,
        total: allTests.length,
        scenario,
        withoutFlow,
      },
      rows: withoutPressure,
    },
  ];
};

export const findGaps: FindGaps = (scenario, tests) =>
  collectGapFacts(scenario, tests).map(({ facts, rows }) => gap(facts, rows));
