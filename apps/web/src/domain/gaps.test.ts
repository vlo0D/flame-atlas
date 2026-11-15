import { describe, expect, it } from "vitest";
import { filterTests } from "./filters";
import { burnerO2Pct, findGaps, gapFilters, testedConditions } from "./gaps";
import { testRow } from "./test-helpers";
import type { ScenarioInput } from "./types";

const lunar: ScenarioInput = {
  presetId: "lunar-habitat",
  o2Pct: 34,
  pressureKpa: 56.5,
  gravityG: 0.165,
  flowCmSMin: 5,
  flowCmSMax: 20,
  fuelStates: ["solid"],
  focus: "prevention",
};

const solid = (id: string, o2: number, pressure: number | null, extra = {}) =>
  testRow({ id, label: id, fuelState: "solid", o2PctMin: o2, o2PctMax: o2, pressureKpaMin: pressure, pressureKpaMax: pressure, ...extra });

const rows = [
  solid("near", 32, 60),
  solid("earth", 21, 101.3),
  solid("rich-no-pressure", 40, null),
  solid("day", 34, 56.5, { granularity: "test-day" }),
  testRow({ id: "gas", fuelState: "gas", o2PctMin: 34, o2PctMax: 34, pressureKpaMin: 56.5, pressureKpaMax: 56.5, gravity: "partial-simulated" }),
];
const byKind = (kind: string, data = rows) => findGaps(lunar, data).find((gap) => gap.kind === kind)!;

describe("findGaps", () => {
  it("returns the five gaps in a fixed order", () => {
    expect(findGaps(lunar, rows).map((gap) => gap.kind)).toEqual([
      "near-scenario",
      "exploration-solids",
      "burner-oxygen",
      "partial-gravity",
      "not-reported",
    ]);
  });

  it("counts only individual tests with the environment's fuel near its conditions", () => {
    const gap = byKind("near-scenario");
    expect(gap).toMatchObject({ count: 1, total: 3, rowIds: ["near"] });
    expect(gap.statement).toBe("1 test of 3 with solid fuel was run within 5 points of oxygen and 15 kPa of this environment.");
  });

  it("names the closest test when none is near", () => {
    const gap = byKind("near-scenario", [solid("earth", 21, 101.3), solid("far", 15, 101.3)]);
    expect(gap.count).toBe(0);
    expect(gap.rowIds).toEqual(["earth"]);
    expect(gap.statement).toContain("None of the 2 tests with solid fuel");
    expect(gap.statement).toContain("The closest is test earth of PSI-1 (oxygen 21 %, pressure 101.3 kPa (14.7 psi)).");
  });

  it("says how many tests are close in oxygen but do not report pressure", () => {
    const gap = byKind("near-scenario", [solid("a", 33, null), solid("b", 36, null), solid("far", 15, 101.3)]);
    expect(gap.count).toBe(0);
    expect(gap.statement).toContain("2 more tests are that close in oxygen but do not report pressure.");
  });

  it("does not call a test closest when no test reports both oxygen and pressure", () => {
    const gap = byKind("near-scenario", [solid("a", 33, null), solid("b", 21, null)]);
    expect(gap).toMatchObject({ count: 0, total: 2, rowIds: [] });
    expect(gap.statement).toBe(
      "None of the 2 tests with solid fuel reports both oxygen and pressure, so none can be placed near this environment. 1 more test is that close in oxygen but does not report pressure.",
    );
  });

  it("counts solid-fuel tests inside the exploration atmosphere and those that might be", () => {
    const gap = byKind("exploration-solids");
    expect(gap).toMatchObject({ count: 1, total: 3, rowIds: ["near"] });
    expect(gap.statement).toBe(
      "1 solid-fuel test of 3 was run at 30 % oxygen or more and 70.33 kPa (10.2 psi) or less. 1 more test at that oxygen level does not report pressure.",
    );
  });

  it("says there is no real partial gravity and counts the simulated tests", () => {
    const gap = byKind("partial-gravity");
    expect(gap).toMatchObject({ count: 0, total: 4, rowIds: ["gas"] });
    expect(gap.statement).toBe("No test in the data was run at real partial gravity. 1 test of 4 simulated it.");
  });

  it("names summary rows that simulated partial gravity when no individual test did", () => {
    const data = [solid("a", 21, 101.3), testRow({ id: "day", granularity: "test-day", gravity: "partial-simulated" })];
    const gap = byKind("partial-gravity", data);
    expect(gap.statement).toBe(
      "No test in the data was run at real partial gravity. None of the 1 individual test simulated it; 1 summary row (test days, not individual tests) did, with an electric field.",
    );
  });

  it("reads the burner oxygen of inverse flames from their source cells", () => {
    const inverse = (id: string, xo2: string) =>
      testRow({ id, fuelState: "gas", o2PctMin: null, o2PctMax: null, raw: { "Flame Type": "Inverse", XO2: xo2 } });
    const data = [inverse("rich", "0.85"), inverse("air", "0.21"), inverse("ramp", "RAMP"), solid("a", 21, 101.3)];
    expect(burnerO2Pct(data[0])).toBeCloseTo(85);
    expect(burnerO2Pct(data[2])).toBeNull();
    expect(burnerO2Pct(data[3])).toBeNull();
    const gap = byKind("burner-oxygen", data);
    expect(gap).toMatchObject({ count: 2, rowIds: ["rich", "air"] });
    expect(gap.statement).toBe(
      "2 inverse-flame tests fed the oxidizer through the burner into a fuel-filled chamber, at up to 85 % oxygen; 1 of them at 30 % or more. They are gas flames, and the grid places tests by the oxygen of the surrounding gas, so they are not in it.",
    );
    expect(gapFilters("burner-oxygen", lunar)).toBeNull();
  });

  it("counts tests that leave out pressure or airflow", () => {
    const gap = byKind("not-reported");
    expect(gap).toMatchObject({ count: 1, total: 4 });
    expect(gap.statement).toBe("1 test of 4 does not report pressure; 4 do not report airflow speed.");
  });

  it("gives filters that list exactly the rows it counted", () => {
    for (const kind of ["near-scenario", "exploration-solids"] as const) {
      const listed = filterTests(rows, gapFilters(kind, lunar)!).map((row) => row.id);
      expect(listed).toEqual(byKind(kind).rowIds);
    }
    expect(gapFilters("partial-gravity", lunar)).toBeNull();
  });

  it("does not break on empty data", () => {
    const gaps = findGaps(lunar, []);
    expect(gaps).toHaveLength(5);
    expect(gaps[0].statement).toBe("The data has no test with solid fuel.");
  });
});

describe("testedConditions", () => {
  it("spans oxygen and pressure over the tests with the environment's fuel and counts who reports them", () => {
    expect(testedConditions(lunar, rows)).toEqual({
      total: 3,
      o2Pct: { min: 21, max: 40, reported: 3 },
      pressureKpa: { min: 60, max: 101.3, reported: 2 },
      gravity: ["micro"],
    });
  });

  it("leaves the span empty when no test reports the value", () => {
    const tested = testedConditions(lunar, [solid("a", 21, null), solid("b", 22, null)]);
    expect(tested.pressureKpa).toEqual({ min: null, max: null, reported: 0 });
    expect(tested.o2Pct).toEqual({ min: 21, max: 22, reported: 2 });
  });

  it("lists the gravity levels in the contract's order", () => {
    const tested = testedConditions({ ...lunar, fuelStates: ["solid", "gas"] }, rows);
    expect(tested.gravity).toEqual(["micro", "partial-simulated"]);
  });
});
