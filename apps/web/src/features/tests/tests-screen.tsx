"use client";

import { useCallback, useMemo } from "react";
import { DEFAULT_PAGE_SIZE } from "@/domain/config";
import { NO_FILTERS } from "@/domain/filters";
import type { TestFilters } from "@/domain/types";
import { buildTestFilterParams, parsePage, parsePageSize, parseTestFilters } from "@/lib/url-state/test-filters";
import { useQueryState } from "@/lib/url-state/use-query-state";
import { TestsView } from "./tests-view";

/** The Tests screen. Filters, the page and the page size live in the address (architecture rule AD-7). */
export function TestsScreen() {
  const [params, setParams] = useQueryState();
  const filters = useMemo(() => parseTestFilters(params), [params]);
  const page = parsePage(params);
  const pageSize = parsePageSize(params);
  const update = useCallback(
    (next: TestFilters, nextPage: number, nextSize: number) => setParams(buildTestFilterParams(next, nextPage, nextSize)),
    [setParams],
  );
  return <TestsView filters={filters} page={page} pageSize={pageSize} onChange={update} />;
}

const ignoreChange = () => {};

/** Shown by the static page until the browser has read the address: the unfiltered table, not yet clickable. */
export function TestsScreenFallback() {
  return (
    <div inert aria-busy="true">
      <TestsView filters={NO_FILTERS} page={1} pageSize={DEFAULT_PAGE_SIZE} onChange={ignoreChange} />
    </div>
  );
}
