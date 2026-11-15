import { describe, expect, it } from "vitest";
import { testRow } from "./test-helpers";
import { investigationVariation } from "./variation";

describe("investigationVariation", () => {
  const rows = [
    testRow({ id: "a", fuelName: "PMMA", o2PctMin: 21, o2PctMax: 21, pressureKpaMin: 101, pressureKpaMax: 101, flowCmSMin: 5, flowCmSMax: 10 }),
    testRow({ id: "b", fuelName: "PMMA", o2PctMin: 17, o2PctMax: 17, pressureKpaMin: 102, pressureKpaMax: 102, flowCmSMin: 5, flowCmSMax: 5 }),
    testRow({ id: "c", fuelName: "Nomex", o2PctMin: 21.2, o2PctMax: 21.2, flowDirection: "concurrent" }),
    testRow({ id: "day", granularity: "test-day", fuelName: "wax", o2PctMin: 40, o2PctMax: 40 }),
  ];

  it("compares individual tests only and names what varied and what stayed constant", () => {
    const result = investigationVariation(rows);
    expect(result).toMatchObject({ rows: 3, onlyTests: true });
    expect(result.fields.o2Pct).toEqual({ kind: "number", reported: 3, status: "varied", min: 17, max: 21.2 });
    expect(result.fields.pressureKpa).toMatchObject({ reported: 2, status: "constant", min: 101, max: 102 });
    expect(result.fields.flowCmS).toMatchObject({ status: "varied", min: 5, max: 10 });
    expect(result.fields.fuel).toEqual({ kind: "text", reported: 3, status: "varied", values: ["PMMA", "Nomex"] });
    expect(result.fields.flowDirection).toMatchObject({ reported: 1, status: "constant", values: ["concurrent"] });
    expect(result.fields.outcome).toMatchObject({ reported: 0, status: "not-reported", values: [] });
  });

  it("uses every row when the investigation has no individual tests", () => {
    const result = investigationVariation([rows[3], testRow({ id: "d2", granularity: "test-day", o2PctMin: 21, o2PctMax: 21 })]);
    expect(result).toMatchObject({ rows: 2, onlyTests: false });
    expect(result.fields.o2Pct).toMatchObject({ status: "varied", min: 21, max: 40 });
  });

  it("reports nothing for an investigation without rows", () => {
    const result = investigationVariation([]);
    expect(result.rows).toBe(0);
    expect(result.fields.o2Pct.status).toBe("not-reported");
  });
});
