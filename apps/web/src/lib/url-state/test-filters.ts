/**
 * The filters of the Tests table in the address bar (architecture rule AD-7).
 *
 * The codec lives in lib, not in the Tests feature folder, because Coverage and
 * Scenario build links to a filtered Tests table and a feature may not import
 * another feature (AD-10).
 *
 *   ?fuel=solid&o2=30:35:left&p=:70.33&type=test
 *
 * A range is "lo:hi:closed". An empty side is open; closed is "left" for [lo, hi),
 * "right" for (lo, hi] and defaults to both ends included.
 */

import { DEFAULT_PAGE_SIZE } from "@/domain/config";
import { NO_FILTERS, hasActiveFilters } from "@/domain/filters";
import { isPageSize } from "@/domain/pagination";
import type { Interval } from "@/domain/num";
import type { TestFilters } from "@/domain/types";
import { FUEL_STATES, GRANULARITIES, OUTCOMES } from "@/generated/contract";

export const TEST_FILTER_PARAMS = {
  investigationIds: "inv",
  fuelStates: "fuel",
  o2Pct: "o2",
  pressureKpa: "p",
  flowCmS: "flow",
  outcomes: "outcome",
  granularities: "type",
  includeNotReported: "nr",
  page: "page",
  pageSize: "size",
} as const;

type ReadableParams = Pick<URLSearchParams, "get">;

function readList<T extends string>(params: ReadableParams, name: string, allowed?: readonly T[]): T[] {
  const raw = params.get(name);
  if (raw === null || raw === "") return [];
  const items = [...new Set(raw.split(","))].filter((item) => item !== "");
  return (allowed ? items.filter((item) => (allowed as readonly string[]).includes(item)) : items) as T[];
}

function readBound(text: string | undefined, open: number): number | null {
  if (text === undefined || text.trim() === "") return open;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function parseIntervalParam(raw: string | null): Interval | null {
  if (raw === null || raw === "") return null;
  const [loText, hiText, closedText] = raw.split(":");
  const lo = readBound(loText, -Infinity);
  const hi = readBound(hiText, Infinity);
  if (lo === null || hi === null || lo > hi) return null;
  if (!Number.isFinite(lo) && !Number.isFinite(hi)) return null;
  const closed = closedText === "left" || closedText === "right" ? closedText : "both";
  return { lo, hi, closed };
}

export function buildIntervalParam(interval: Interval): string {
  const lo = Number.isFinite(interval.lo) ? String(interval.lo) : "";
  const hi = Number.isFinite(interval.hi) ? String(interval.hi) : "";
  return interval.closed === "both" ? `${lo}:${hi}` : `${lo}:${hi}:${interval.closed}`;
}

/** Reads the filters from the address. Unknown or broken values are ignored. */
export function parseTestFilters(params: ReadableParams): TestFilters {
  return {
    investigationIds: readList(params, TEST_FILTER_PARAMS.investigationIds).filter((id) =>
      /^PSI-\d+$/.test(id),
    ) as TestFilters["investigationIds"],
    fuelStates: readList(params, TEST_FILTER_PARAMS.fuelStates, FUEL_STATES),
    o2Pct: parseIntervalParam(params.get(TEST_FILTER_PARAMS.o2Pct)),
    pressureKpa: parseIntervalParam(params.get(TEST_FILTER_PARAMS.pressureKpa)),
    flowCmS: parseIntervalParam(params.get(TEST_FILTER_PARAMS.flowCmS)),
    outcomes: readList(params, TEST_FILTER_PARAMS.outcomes, OUTCOMES),
    granularities: readList(params, TEST_FILTER_PARAMS.granularities, GRANULARITIES),
    includeNotReported: params.get(TEST_FILTER_PARAMS.includeNotReported) === "1",
  };
}

export function parsePage(params: ReadableParams): number {
  const page = Number(params.get(TEST_FILTER_PARAMS.page));
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

/** Rows per page; a size the table does not offer falls back to the default. */
export function parsePageSize(params: ReadableParams): number {
  const size = Number(params.get(TEST_FILTER_PARAMS.pageSize));
  return isPageSize(size) ? size : DEFAULT_PAGE_SIZE;
}

export function buildTestFilterParams(filters: TestFilters, page = 1, pageSize: number = DEFAULT_PAGE_SIZE): URLSearchParams {
  const params = new URLSearchParams();
  const setList = (name: string, items: readonly string[]) => {
    if (items.length > 0) params.set(name, items.join(","));
  };
  setList(TEST_FILTER_PARAMS.investigationIds, filters.investigationIds);
  setList(TEST_FILTER_PARAMS.fuelStates, filters.fuelStates);
  if (filters.o2Pct) params.set(TEST_FILTER_PARAMS.o2Pct, buildIntervalParam(filters.o2Pct));
  if (filters.pressureKpa) params.set(TEST_FILTER_PARAMS.pressureKpa, buildIntervalParam(filters.pressureKpa));
  if (filters.flowCmS) params.set(TEST_FILTER_PARAMS.flowCmS, buildIntervalParam(filters.flowCmS));
  setList(TEST_FILTER_PARAMS.outcomes, filters.outcomes);
  setList(TEST_FILTER_PARAMS.granularities, filters.granularities);
  if (filters.includeNotReported && hasActiveFilters(filters)) params.set(TEST_FILTER_PARAMS.includeNotReported, "1");
  if (page > 1) params.set(TEST_FILTER_PARAMS.page, String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE && isPageSize(pageSize)) params.set(TEST_FILTER_PARAMS.pageSize, String(pageSize));
  return params;
}

/** Link to the Tests screen with these filters applied. Used with next/link, which adds the base path. */
export function testsHref(filters: Partial<TestFilters>): string {
  const query = buildTestFilterParams({ ...NO_FILTERS, ...filters }).toString();
  return query ? `/tests/?${query}` : "/tests/";
}
