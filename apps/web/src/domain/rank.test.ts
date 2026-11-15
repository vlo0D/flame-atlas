import { describe, expect, it } from "vitest";
import type { Investigation, TestRecord } from "@/generated/contract";
import {
  DISTANCE_SCALES,
  FUEL_SCORES,
  GRAVITY_SCORES,
  NEAREST_ROWS_LIMIT,
  PILLAR_SCORES,
  RANK_WEIGHTS,
  UNKNOWN_COMPONENT_SCORE,
} from "./config";
import {
  checkedPoints,
  closeness,
  componentPoints,
  conditionDistance,
  gravityClass,
  nearestRowIds,
  rankInvestigation,
  focusTier,
  rankInvestigations,
  scoreData,
  scoreFlow,
  scoreFuel,
  scoreGravity,
  scoreOxygen,
  scorePillar,
  scorePressure,
} from "./rank";
import { testRow } from "./test-helpers";
import type { ScenarioInput } from "./types";

const lunarHabitat: ScenarioInput = {
  presetId: "lunar-habitat",
  o2Pct: 34,
  pressureKpa: 56.5,
  gravityG: 0.165,
  flowCmSMin: 5,
  flowCmSMax: 20,
  fuelStates: ["solid"],
  focus: "prevention",
};

const issCabin: ScenarioInput = { ...lunarHabitat, presetId: "iss", o2Pct: 21, pressureKpa: 101.3, gravityG: 0, focus: "all" };

type Conditions = Investigation["conditions"];

function investigation(overrides: Partial<Omit<Investigation, "conditions">> & { conditions?: Partial<Conditions> } = {}): Investigation {
  const { conditions, ...rest } = overrides;
  return {
    id: "PSI-1",
    acronym: "TEST",
    title: "Test investigation",
    doi: null,
    url: "https://example.org",
    kind: "flight",
    platform: null,
    facility: null,
    insert: null,
    yearStart: null,
    yearEnd: null,
    pillarPrimary: "prevention",
    pillarsSecondary: [],
    fuelStates: ["solid"],
    fuels: [],
    conditions: {
      o2PctMin: 34,
      o2PctMax: 34,
      pressureKpaMin: 56.5,
      pressureKpaMax: 56.5,
      flowCmSMin: 10,
      flowCmSMax: 10,
      diluents: [],
      gravity: ["micro"],
      ...conditions,
    },
    summary: { text: "", citations: [] },
    objectives: [],
    measurements: [],
    fireSafetyRelevance: [],
    testStats: { tableFiles: ["table.csv"], rowCount: 100, granularities: ["test"] },
    publications: [],
    review: { status: "unreviewed", by: null, notes: null },
    ...rest,
  };
}

const row = testRow;

describe("config", () => {
  it("has weights that sum to 1, so a perfect match scores 100", () => {
    const sum = Object.values(RANK_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });
});

describe("closeness", () => {
  it("is 1 at distance 0 and exp(-1) one scale away", () => {
    expect(closeness(0, 8)).toBe(1);
    expect(closeness(8, 8)).toBeCloseTo(Math.exp(-1), 10);
  });

  it("falls as the distance grows", () => {
    expect(closeness(4, 8)).toBeGreaterThan(closeness(12, 8));
  });
});

describe("scoreOxygen and scorePressure", () => {
  it("score 1 when the environment's value is inside the tested range", () => {
    const tested = investigation({ conditions: { o2PctMin: 21, o2PctMax: 40, pressureKpaMin: 50, pressureKpaMax: 101 } });
    expect(scoreOxygen(lunarHabitat, tested).score).toBe(1);
    expect(scorePressure(lunarHabitat, tested).score).toBe(1);
  });

  it("fall with the distance to the tested range", () => {
    const tested = investigation({ conditions: { o2PctMin: 22.2, o2PctMax: 22.2, pressureKpaMin: 101.3, pressureKpaMax: 101.3 } });
    expect(scoreOxygen(lunarHabitat, tested).score).toBeCloseTo(closeness(11.8, DISTANCE_SCALES.o2Pct), 10);
    expect(scorePressure(lunarHabitat, tested).score).toBeCloseTo(closeness(44.8, DISTANCE_SCALES.pressureKpa), 10);
  });

  it("earn no points and say so when the value is not reported", () => {
    const tested = investigation({ conditions: { o2PctMin: null, o2PctMax: null, pressureKpaMin: null, pressureKpaMax: null } });
    for (const part of [scoreOxygen(lunarHabitat, tested), scorePressure(lunarHabitat, tested)]) {
      expect(part.score).toBe(UNKNOWN_COMPONENT_SCORE);
      expect(part.known).toBe(false);
      expect(part.caveat).toMatch(/not reported/);
    }
  });
});

describe("scoreFlow", () => {
  it("scores 1 when the tested airflow lies inside the environment's range", () => {
    expect(scoreFlow(lunarHabitat, investigation({ conditions: { flowCmSMin: 5, flowCmSMax: 5 } })).score).toBe(1);
  });

  it("measures the gap between the two ranges", () => {
    const tested = investigation({ conditions: { flowCmSMin: 50, flowCmSMax: 60 } });
    expect(scoreFlow(lunarHabitat, tested).score).toBeCloseTo(closeness(30, DISTANCE_SCALES.flowCmS), 10);
  });

  it("compares an environment without forced airflow against zero", () => {
    const still: ScenarioInput = { ...lunarHabitat, flowCmSMin: null, flowCmSMax: null };
    const tested = investigation({ conditions: { flowCmSMin: 5, flowCmSMax: 5 } });
    expect(scoreFlow(still, tested).score).toBeCloseTo(closeness(5, DISTANCE_SCALES.flowCmS), 10);
  });

  it("earns no points when the investigation reports no airflow", () => {
    const part = scoreFlow(lunarHabitat, investigation({ conditions: { flowCmSMin: null, flowCmSMax: null } }));
    expect(part).toMatchObject({ score: UNKNOWN_COMPONENT_SCORE, known: false });
  });
});

describe("scoreFuel", () => {
  it("scores a matching fuel state as a full match", () => {
    expect(scoreFuel(lunarHabitat, investigation({ fuelStates: ["liquid", "solid"] })).score).toBe(FUEL_SCORES.match);
  });

  it("scores a different fuel state as no match", () => {
    expect(scoreFuel(lunarHabitat, investigation({ fuelStates: ["liquid"] })).score).toBe(FUEL_SCORES.none);
  });

  const standIn = investigation({
    fuelStates: ["gas"],
    fuelAnalogOf: {
      states: ["solid", "liquid"],
      claim: { text: "Emulates condensed fuels.", citations: [{ label: "source", url: "https://example.org", quote: null }] },
    },
  });

  it("scores a recognised stand-in as a partial match and explains it", () => {
    const part = scoreFuel(lunarHabitat, standIn);
    expect(part.score).toBe(FUEL_SCORES.analog);
    expect(part.known).toBe(true);
    expect(part.caveat).toBe("Its fuel stands in for solid and liquid fuels, so the fuel counts as a partial match.");
  });

  it("does not treat a stand-in as one for a fuel state it does not emulate", () => {
    expect(scoreFuel({ ...lunarHabitat, fuelStates: ["aerosol"] }, standIn).score).toBe(FUEL_SCORES.none);
  });

  it("scores a different fuel as no match when the data names no stand-in", () => {
    expect(scoreFuel(lunarHabitat, investigation({ fuelStates: ["gas"], fuelAnalogOf: null })).score).toBe(FUEL_SCORES.none);
    expect(scoreFuel(lunarHabitat, investigation({ fuelStates: ["gas"] })).score).toBe(FUEL_SCORES.none);
  });

  it("earns no points when the investigation reports no fuel state", () => {
    expect(scoreFuel(lunarHabitat, investigation({ fuelStates: [] }))).toMatchObject({
      score: UNKNOWN_COMPONENT_SCORE,
      known: false,
    });
  });

  it("treats an environment with no fuel chosen as having no preference", () => {
    expect(scoreFuel({ ...lunarHabitat, fuelStates: [] }, investigation({ fuelStates: ["gas"] })).score).toBe(
      FUEL_SCORES.match,
    );
  });
});

describe("scorePillar", () => {
  const tested = investigation({ pillarPrimary: "suppression", pillarsSecondary: ["fundamentals"] });

  it("separates the main pillar, a secondary pillar and neither", () => {
    expect(scorePillar({ ...lunarHabitat, focus: "suppression" }, tested).score).toBe(PILLAR_SCORES.primary);
    expect(scorePillar({ ...lunarHabitat, focus: "fundamentals" }, tested).score).toBe(PILLAR_SCORES.secondary);
    expect(scorePillar({ ...lunarHabitat, focus: "detection" }, tested).score).toBe(PILLAR_SCORES.other);
  });

  it("gives every investigation the full score when the focus is all pillars", () => {
    expect(scorePillar({ ...lunarHabitat, focus: "all" }, tested).score).toBe(PILLAR_SCORES.primary);
  });
});

describe("scoreData", () => {
  const stats = (rowCount: number, tableFiles = ["table.csv"]) =>
    investigation({ testStats: { tableFiles, rowCount, granularities: ["test"] } });

  it("grows with the number of rows and stops at full credit", () => {
    expect(scoreData(stats(4)).score).toBeLessThan(scoreData(stats(129)).score);
    expect(scoreData(stats(300)).score).toBe(scoreData(stats(5000)).score);
  });

  it("stays between 0 and 1", () => {
    expect(scoreData(stats(0, [])).score).toBe(0);
    const full = investigation({
      testStats: { tableFiles: ["table.csv"], rowCount: 5000, granularities: ["test"] },
      publications: Array.from({ length: 12 }, () => ({ title: "paper", year: null, doi: null })),
    });
    expect(scoreData(full).score).toBeCloseTo(1, 10);
  });

  it("warns when there is no table, and when the rows are not individual tests", () => {
    expect(scoreData(stats(0, [])).caveat).toMatch(/no experiment table/);
    const days = investigation({ testStats: { tableFiles: ["table.csv"], rowCount: 18, granularities: ["test-day"] } });
    expect(scoreData(days).caveat).toBe("Its table lists test days, not individual tests.");
    expect(scoreData(stats(100)).caveat).toBeNull();
  });
});

describe("scoreGravity", () => {
  it("classes an environment by its gravity", () => {
    expect(gravityClass(0)).toBe("micro");
    expect(gravityClass(0.165)).toBe("partial");
    expect(gravityClass(0.38)).toBe("partial");
    expect(gravityClass(1)).toBe("normal");
  });

  it("scores microgravity data fully for a microgravity environment", () => {
    const part = scoreGravity(issCabin, investigation());
    expect(part.score).toBe(GRAVITY_SCORES.micro.micro);
    expect(part.caveat).toBeNull();
  });

  it("ranks simulated partial gravity above microgravity above normal gravity for the Moon", () => {
    const simulated = scoreGravity(lunarHabitat, investigation({ conditions: { gravity: ["partial-simulated"] } }));
    const micro = scoreGravity(lunarHabitat, investigation({ conditions: { gravity: ["micro"] } }));
    const normal = scoreGravity(lunarHabitat, investigation({ conditions: { gravity: ["normal"] } }));
    expect(simulated.score).toBe(GRAVITY_SCORES.partial["partial-simulated"]);
    expect(micro.score).toBe(GRAVITY_SCORES.partial.micro);
    expect(normal.score).toBe(GRAVITY_SCORES.partial.normal);
    expect(simulated.score).toBeGreaterThan(micro.score);
    expect(micro.score).toBeGreaterThan(normal.score);
    expect(simulated.caveat).toMatch(/simulated/);
    expect(micro.caveat).toBe("Tested in microgravity; the environment has 0.165 g.");
  });

  it("uses the best of several gravity levels", () => {
    const both = investigation({ conditions: { gravity: ["normal", "micro"] } });
    expect(scoreGravity(lunarHabitat, both).score).toBe(GRAVITY_SCORES.partial.micro);
  });

  it("earns no points when no gravity level is reported", () => {
    expect(scoreGravity(lunarHabitat, investigation({ conditions: { gravity: [] } }))).toMatchObject({
      score: UNKNOWN_COMPONENT_SCORE,
      known: false,
    });
  });
});

describe("conditionDistance", () => {
  it("is 0 for a row at exactly the environment's conditions", () => {
    const exact = row({ o2PctMin: 34, o2PctMax: 34, pressureKpaMin: 56.5, pressureKpaMax: 56.5, flowCmSMin: 10, flowCmSMax: 10 });
    expect(conditionDistance(lunarHabitat, exact)).toBe(0);
  });

  it("is null for a row that reports no condition at all", () => {
    expect(conditionDistance(lunarHabitat, row())).toBeNull();
  });

  it("measures oxygen to the nearest listed value, not to the span", () => {
    const base = { pressureKpaMin: 56.5, pressureKpaMax: 56.5, flowCmSMin: 10, flowCmSMax: 10 };
    const listed = row({ ...base, o2PctMin: 21, o2PctMax: 40, o2PctValues: [21, 40] });
    const span = row({ ...base, o2PctMin: 21, o2PctMax: 40 });
    expect(conditionDistance(lunarHabitat, span)).toBe(0);
    expect(conditionDistance(lunarHabitat, listed)).toBeGreaterThan(0);
  });

  it("puts a row with a missing condition between a matching and a far row", () => {
    const base = { o2PctMin: 34, o2PctMax: 34, flowCmSMin: 10, flowCmSMax: 10 };
    const matching = conditionDistance(lunarHabitat, row({ ...base, pressureKpaMin: 56.5, pressureKpaMax: 56.5 }))!;
    const missing = conditionDistance(lunarHabitat, row(base))!;
    const far = conditionDistance(lunarHabitat, row({ ...base, pressureKpaMin: 101.3, pressureKpaMax: 101.3 }))!;
    expect(matching).toBeLessThan(missing);
    expect(missing).toBeLessThan(far);
  });
});

describe("nearestRowIds", () => {
  const at = (id: string, o2: number, extra: Partial<TestRecord> = {}) =>
    row({ id, o2PctMin: o2, o2PctMax: o2, sourceRow: Number(id), ...extra });

  it("lists the closest rows first and no more than the limit", () => {
    const rows = [at("1", 21), at("2", 33), at("3", 40), at("4", 30), at("5", 60)];
    const ids = nearestRowIds(lunarHabitat, rows);
    expect(ids).toEqual(["2", "4", "3"]);
    expect(ids.length).toBeLessThanOrEqual(NEAREST_ROWS_LIMIT);
  });

  it("leaves out rows that report no condition", () => {
    expect(nearestRowIds(lunarHabitat, [row({ id: "empty" }), at("1", 30)])).toEqual(["1"]);
  });

  it("prefers individual tests over summary rows", () => {
    const summary = at("1", 34, { granularity: "matrix-row" });
    const test = at("2", 21);
    expect(nearestRowIds(lunarHabitat, [summary, test])).toEqual(["2"]);
  });

  it("falls back to summary rows when the investigation has no individual tests", () => {
    const days = [at("1", 21, { granularity: "test-day" }), at("2", 34, { granularity: "test-day" })];
    expect(nearestRowIds(lunarHabitat, days)).toEqual(["2", "1"]);
  });
});

describe("rankInvestigation", () => {
  it("scores a perfect match 100", () => {
    // Same oxygen, pressure, airflow, fuel and pillar; microgravity on both sides; plenty of data.
    const perfect = investigation({
      testStats: { tableFiles: ["table.csv"], rowCount: 5000, granularities: ["test"] },
      publications: Array.from({ length: 5 }, () => ({ title: "paper", year: null, doi: null })),
    });
    const item = rankInvestigation({ ...lunarHabitat, gravityG: 0 }, perfect, []);
    expect(item.score).toBe(100);
    expect(item.unknownComponents).toEqual([]);
    expect(item.caveats).toEqual([]);
  });

  it("does not break on an investigation that reports nothing, and names every unreported component", () => {
    const empty = investigation({
      fuelStates: [],
      conditions: {
        o2PctMin: null,
        o2PctMax: null,
        pressureKpaMin: null,
        pressureKpaMax: null,
        flowCmSMin: null,
        flowCmSMax: null,
        gravity: [],
      },
      testStats: { tableFiles: [], rowCount: 0, granularities: [] },
    });
    const item = rankInvestigation(lunarHabitat, empty, []);
    expect(Number.isFinite(item.score)).toBe(true);
    expect(item.unknownComponents).toEqual(["o2", "fuel", "pressure", "flow", "gravity"]);
    expect(item.caveats).toHaveLength(6);
    expect(item.nearestRowIds).toEqual([]);
  });

  it("splits the score into points per component that add up to it", () => {
    const tested = investigation({ conditions: { o2PctMin: 22.2, o2PctMax: 22.2, flowCmSMin: null, flowCmSMax: null } });
    const item = rankInvestigation(lunarHabitat, tested, []);
    const names = Object.keys(RANK_WEIGHTS) as (keyof typeof RANK_WEIGHTS)[];
    const earned = names.reduce((total, name) => total + componentPoints(item, name).earned, 0);
    const max = names.reduce((total, name) => total + componentPoints(item, name).max, 0);
    expect(earned).toBeCloseTo(item.score, 1);
    expect(max).toBeCloseTo(100, 10);
    expect(componentPoints(item, "flow")).toEqual({ earned: 0, max: 10 });
    expect(checkedPoints(item)).toBe(90);
  });

  it("equals 100 times the weighted sum of its components", () => {
    const tested = investigation({ conditions: { o2PctMin: 22.2, o2PctMax: 22.2, pressureKpaMin: null, pressureKpaMax: null } });
    const item = rankInvestigation(lunarHabitat, tested, []);
    const sum = (Object.keys(RANK_WEIGHTS) as (keyof typeof RANK_WEIGHTS)[]).reduce(
      (total, name) => total + RANK_WEIGHTS[name] * item.components[name],
      0,
    );
    expect(item.score).toBeCloseTo(100 * sum, 1);
  });
});

describe("rankInvestigations", () => {
  it("orders by score, highest first, and keeps the scenario with the result", () => {
    const near = investigation({ id: "PSI-2" });
    const far = investigation({ id: "PSI-1", conditions: { o2PctMin: 21, o2PctMax: 21 } });
    const result = rankInvestigations(lunarHabitat, [far, near], []);
    expect(result.items.map((item) => item.investigationId)).toEqual(["PSI-2", "PSI-1"]);
    expect(result.scenario).toBe(lunarHabitat);
  });

  it("orders equal scores by investigation number, not as text", () => {
    const ids = ["PSI-159", "PSI-20", "PSI-9"] as const;
    const result = rankInvestigations(lunarHabitat, ids.map((id) => investigation({ id })), []);
    expect(result.items.map((item) => item.investigationId)).toEqual(["PSI-9", "PSI-20", "PSI-159"]);
  });

  it("gives each investigation only its own rows", () => {
    const rows = [
      row({ id: "a", investigationId: "PSI-1", o2PctMin: 34, o2PctMax: 34 }),
      row({ id: "b", investigationId: "PSI-2", o2PctMin: 34, o2PctMax: 34 }),
    ];
    const result = rankInvestigations(lunarHabitat, [investigation({ id: "PSI-1" }), investigation({ id: "PSI-2" })], rows);
    expect(result.items.find((item) => item.investigationId === "PSI-1")?.nearestRowIds).toEqual(["a"]);
    expect(result.items.find((item) => item.investigationId === "PSI-2")?.nearestRowIds).toEqual(["b"]);
  });

  /**
   * Sanity check from docs/01-product-spec.md, section 4: for the lunar habitat
   * the list is expected to start with ACME BRE, BASS-II and Saffire.
   * Conditions below are the ones in data/fixtures/investigations.json.
   */
  it("puts ACME BRE, BASS-II and Saffire on top for the lunar habitat", () => {
    const noPressure = { pressureKpaMin: null, pressureKpaMax: null };
    const noFlow = { flowCmSMin: null, flowCmSMax: null };
    const stats = (rowCount: number, granularity: "test" | "test-day" = "test") => ({
      tableFiles: ["table.csv"],
      rowCount,
      granularities: [granularity],
    });
    const sample = [
      investigation({
        id: "PSI-25", // BASS-II
        pillarsSecondary: ["suppression"],
        conditions: { o2PctMin: 22.2, o2PctMax: 22.2, ...noPressure, flowCmSMin: 5, flowCmSMax: 5 },
        testStats: stats(129),
      }),
      investigation({
        id: "PSI-69", // FLEX
        pillarPrimary: "suppression",
        pillarsSecondary: ["fundamentals"],
        fuelStates: ["liquid"],
        conditions: { o2PctMin: 21, o2PctMax: 21, pressureKpaMin: 101.02, pressureKpaMax: 101.02, ...noFlow },
        testStats: stats(274),
      }),
      investigation({
        id: "PSI-99", // Saffire-II
        conditions: { o2PctMin: 22.1, o2PctMax: 22.1, ...noPressure, flowCmSMin: 20, flowCmSMax: 20 },
        testStats: stats(15),
      }),
      investigation({
        id: "PSI-98", // Saffire-I
        conditions: { o2PctMin: 21.5, o2PctMax: 21.7, ...noPressure, flowCmSMin: 20, flowCmSMax: 20 },
        testStats: stats(4),
      }),
      investigation({
        id: "PSI-20", // ACME BRE
        pillarsSecondary: ["fundamentals"],
        fuelStates: ["gas"],
        fuelAnalogOf: {
          states: ["solid", "liquid"],
          claim: { text: "Emulates condensed fuels.", citations: [{ label: "source", url: "https://example.org", quote: null }] },
        },
        conditions: { o2PctMin: 21, o2PctMax: 40, ...noPressure, ...noFlow },
        testStats: stats(18, "test-day"),
      }),
      investigation({
        id: "PSI-159", // ACME CFI-G
        pillarPrimary: "fundamentals",
        fuelStates: ["gas"],
        conditions: { o2PctMin: 39.39, o2PctMax: 39.39, pressureKpaMin: 94.44, pressureKpaMax: 94.44, ...noFlow },
        testStats: stats(1194),
      }),
    ];

    const order = rankInvestigations(lunarHabitat, sample, []).items.map((item) => item.investigationId);
    expect(order).toEqual(["PSI-20", "PSI-25", "PSI-99", "PSI-98", "PSI-159", "PSI-69"]);
  });

  it("lists the chosen focus first even when its tables report fewer conditions", () => {
    // ISS cabin, focus on detection: SAME reports no oxygen or pressure, BASS reports both.
    const iss: ScenarioInput = { ...issCabin, focus: "detection" };
    const same = investigation({
      id: "PSI-102",
      pillarPrimary: "detection",
      conditions: { o2PctMin: null, o2PctMax: null, pressureKpaMin: null, pressureKpaMax: null, flowCmSMin: 5, flowCmSMax: 10 },
    });
    const bass = investigation({
      id: "PSI-26",
      pillarsSecondary: ["suppression"],
      conditions: { o2PctMin: 15.9, o2PctMax: 22.7, pressureKpaMin: 98.3, pressureKpaMax: 102.2, flowCmSMin: 0, flowCmSMax: 44 },
    });
    const secondary = investigation({ id: "PSI-5", pillarsSecondary: ["detection"] });
    const order = rankInvestigations(iss, [bass, secondary, same], []).items.map((item) => item.investigationId);
    expect(order).toEqual(["PSI-102", "PSI-5", "PSI-26"]);
    expect(focusTier(iss, same)).toBe(0);
    expect(focusTier({ ...iss, focus: "all" }, bass)).toBe(0);
  });

  it("does not put an investigation that reports no conditions above one that reports close ones", () => {
    // BASS in the real data: solid fuel, the right pillar, but no oxygen, pressure or airflow in its table.
    const silent = investigation({
      id: "PSI-26",
      conditions: { o2PctMin: null, o2PctMax: null, pressureKpaMin: null, pressureKpaMax: null, flowCmSMin: null, flowCmSMax: null },
    });
    // BASS-II: solid fuel, reports oxygen near Earth air and airflow, but no pressure.
    const reported = investigation({
      id: "PSI-25",
      conditions: { o2PctMin: 22.2, o2PctMax: 22.2, pressureKpaMin: null, pressureKpaMax: null, flowCmSMin: 5, flowCmSMax: 5 },
    });
    const result = rankInvestigations(lunarHabitat, [silent, reported], []);
    expect(result.items.map((item) => item.investigationId)).toEqual(["PSI-25", "PSI-26"]);
    expect(checkedPoints(result.items[1])).toBe(50);
  });
});
