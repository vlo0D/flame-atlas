import { describe, expect, it } from "vitest";
import { NO_FILTERS } from "@/domain/filters";
import type { TestFilters } from "@/domain/types";
import { DEFAULT_PAGE_SIZE } from "@/domain/config";
import {
  buildIntervalParam,
  buildTestFilterParams,
  parseIntervalParam,
  parsePage,
  parsePageSize,
  parseTestFilters,
  testsHref,
} from "./test-filters";

describe("interval parameter", () => {
  it("round-trips closed, half-open and open-ended ranges", () => {
    for (const interval of [
      { lo: 30, hi: 35, closed: "left" },
      { lo: 50, hi: 70.33, closed: "right" },
      { lo: 30, hi: Infinity, closed: "both" },
      { lo: -Infinity, hi: 70.33, closed: "both" },
    ] as const) {
      expect(parseIntervalParam(buildIntervalParam(interval))).toEqual(interval);
    }
  });

  it("ignores a broken or empty range", () => {
    expect(parseIntervalParam("abc:10")).toBeNull();
    expect(parseIntervalParam("40:30")).toBeNull();
    expect(parseIntervalParam(":")).toBeNull();
    expect(parseIntervalParam(null)).toBeNull();
  });
});

describe("test filters in the address", () => {
  it("reads no filters from an empty address", () => {
    expect(parseTestFilters(new URLSearchParams(""))).toEqual(NO_FILTERS);
    expect(parsePage(new URLSearchParams(""))).toBe(1);
    expect(parsePageSize(new URLSearchParams(""))).toBe(DEFAULT_PAGE_SIZE);
  });

  it("keeps the page size in the address only when it is not the default, and ignores sizes not offered", () => {
    expect(buildTestFilterParams(NO_FILTERS, 2, 100).toString()).toBe("page=2&size=100");
    expect(buildTestFilterParams(NO_FILTERS, 1, DEFAULT_PAGE_SIZE).toString()).toBe("");
    expect(parsePageSize(new URLSearchParams("size=100"))).toBe(100);
    expect(parsePageSize(new URLSearchParams("size=7"))).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(new URLSearchParams("size=abc"))).toBe(DEFAULT_PAGE_SIZE);
  });

  it("round-trips a full set of filters", () => {
    const filters: TestFilters = {
      investigationIds: ["PSI-25", "PSI-99"],
      fuelStates: ["solid"],
      o2Pct: { lo: 30, hi: 100, closed: "both" },
      pressureKpa: { lo: 0, hi: 70.33, closed: "both" },
      flowCmS: { lo: 5, hi: 10, closed: "left" },
      outcomes: ["blowoff"],
      granularities: ["test"],
      includeNotReported: true,
    };
    const params = buildTestFilterParams(filters, 3);
    expect(parseTestFilters(params)).toEqual(filters);
    expect(parsePage(params)).toBe(3);
  });

  it("drops values the contract does not know", () => {
    const filters = parseTestFilters(new URLSearchParams("fuel=solid,plasma&type=test,row&inv=PSI-25,drop%20table&outcome=exploded"));
    expect(filters.fuelStates).toEqual(["solid"]);
    expect(filters.granularities).toEqual(["test"]);
    expect(filters.investigationIds).toEqual(["PSI-25"]);
    expect(filters.outcomes).toEqual([]);
  });

  it("builds a link to the filtered Tests table", () => {
    expect(testsHref({})).toBe("/tests/");
    expect(testsHref({ fuelStates: ["solid"], granularities: ["test"] })).toBe("/tests/?fuel=solid&type=test");
  });
});
