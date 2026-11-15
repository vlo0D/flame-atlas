import { describe, expect, it } from "vitest";
import { conditionReporting, countRows, isTestRow } from "./rows";
import { testRow } from "./test-helpers";

describe("isTestRow", () => {
  it("accepts only individual experiment runs", () => {
    expect(isTestRow({ granularity: "test" })).toBe(true);
    expect(isTestRow({ granularity: "test-day" })).toBe(false);
    expect(isTestRow({ granularity: "matrix-row" })).toBe(false);
    expect(isTestRow({ granularity: "reference" })).toBe(false);
  });
});

describe("countRows", () => {
  it("counts tests separately from summary rows", () => {
    const counts = countRows([
      { granularity: "test" },
      { granularity: "test" },
      { granularity: "test-day" },
      { granularity: "test-day" },
      { granularity: "matrix-row" },
    ]);
    expect(counts.tests).toBe(2);
    expect(counts.other).toEqual({ "test-day": 2, "matrix-row": 1 });
    expect(counts.total).toBe(5);
  });

  it("handles an empty table", () => {
    expect(countRows([])).toEqual({ tests: 0, other: {}, total: 0 });
  });
});

describe("conditionReporting", () => {
  it("counts reported conditions over individual tests and those taken from documents", () => {
    const result = conditionReporting([
      testRow({ id: "a", o2PctMin: 21, pressureKpaMin: 99, inferred: ["pressureKpaMin", "gravity"] }),
      testRow({ id: "b", o2PctMin: 22, fuelName: "PMMA" }),
      testRow({ id: "c", granularity: "test-day", o2PctMin: 30, pressureKpaMin: 60 }),
    ]);
    expect(result.tests).toBe(2);
    expect(result.conditions).toEqual({
      oxygen: { reported: 2, fromDocuments: 0 },
      pressure: { reported: 1, fromDocuments: 1 },
      airflow: { reported: 0, fromDocuments: 0 },
    });
  });
});
