"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";
import { PageHeader } from "@/components/page-parts";
import { RowSource } from "@/components/row-source";
import { SiBadge } from "@/components/si-badge";
import { filterTests, hasActiveFilters } from "@/domain/filters";
import { formatGranularity, formatPressure, formatRange, formatText } from "@/domain/format";
import { countRows, hasSiReading } from "@/domain/rows";
import type { TestFilters } from "@/domain/types";
import { getInvestigation, tests } from "@/lib/data";
import { investigationHref } from "@/lib/paths";
import { ExportButtons } from "./export-buttons";
import { TestsFilters } from "./tests-filters";

const PAGE_SIZE = 50;

export function TestsView({
  filters,
  page,
  onChange,
}: {
  filters: TestFilters;
  page: number;
  onChange: (filters: TestFilters, page: number) => void;
}) {
  const matching = useMemo(() => filterTests(tests, filters), [filters]);
  const counts = countRows(matching);
  const all = countRows(tests);
  const pages = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = matching.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const sectionRef = useRef<HTMLElement>(null);

  // The page buttons sit under the table: after a page change, show the new page from its first row.
  function goToPage(next: number) {
    onChange(filters, next);
    const section = sectionRef.current;
    if (section && section.getBoundingClientRect().top < 0) section.scrollIntoView({ block: "start" });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tests"
        lead="One table for every row of the NASA PSI experiment tables, with the same fields and units. Missing values are shown as not reported, never as zero."
      />

      <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:self-start">
          <TestsFilters filters={filters} onChange={(next) => onChange(next, 1)} />
        </div>

        <section ref={sectionRef} aria-label="Rows" className="min-w-0 scroll-mt-4 space-y-3">
          <p className="text-sm text-fg-muted" aria-live="polite">
            {hasActiveFilters(filters) ? "Matching the filters: " : "In this build: "}
            <span className="font-medium text-fg">
              {counts.tests} test{counts.tests === 1 ? "" : "s"}
            </span>{" "}
            and {counts.total - counts.tests} summary row{counts.total - counts.tests === 1 ? "" : "s"}
            {hasActiveFilters(filters) ? `, out of ${all.tests} tests and ${all.total - all.tests} summary rows` : ""}.
            {filters.includeNotReported || !hasActiveFilters(filters)
              ? ""
              : " Rows that do not report a filtered value are left out."}
          </p>

          <ExportButtons rows={matching} />

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted p-6 text-sm text-fg-muted">
              <p>No row matches these filters.</p>
              <p className="mt-1">
                Many rows do not report pressure or airflow. Try switching on &quot;Include rows that do not report a
                filtered value&quot;, or reset the filters.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full min-w-[60rem] text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th scope="col" className="px-3 py-2">Row</th>
                    <th scope="col" className="px-3 py-2">Investigation</th>
                    <th scope="col" className="px-3 py-2">Row type</th>
                    <th scope="col" className="px-3 py-2">Fuel</th>
                    <th scope="col" className="px-3 py-2">Oxygen</th>
                    <th scope="col" className="px-3 py-2">Pressure</th>
                    <th scope="col" className="px-3 py-2">Airflow</th>
                    <th scope="col" className="px-3 py-2">Outcome</th>
                    <th scope="col" className="px-3 py-2">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((row) => (
                    <tr key={row.id} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{formatText(row.label)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link href={investigationHref(row.investigationId)} className="underline underline-offset-2">
                          {getInvestigation(row.investigationId)?.acronym ?? row.investigationId}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{formatGranularity(row.granularity)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatText(row.fuelName)}
                        {row.fuelState ? <span className="text-fg-subtle">, {row.fuelState}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatRange(
                          { min: row.o2PctMin, max: row.o2PctMax, values: row.o2PctValues },
                          { unit: "%", approx: row.o2PctApprox },
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatPressure({ min: row.pressureKpaMin, max: row.pressureKpaMax })}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                        {formatRange({ min: row.flowCmSMin, max: row.flowCmSMax }, { unit: "cm/s" })}
                        {row.flowDirection !== "unknown" ? (
                          <span className="text-fg-subtle">, {row.flowDirection}</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {formatText(row.outcome)}
                        {row.outcome !== null && hasSiReading(row) && row.inferred.includes("outcome") ? (
                          <span className="ml-1.5 align-middle">
                            <SiBadge title="Read by a language model from the operator's note; the quote is in the row's source" />
                          </span>
                        ) : null}
                      </td>
                      <td className="min-w-48 px-3 py-2">
                        <RowSource row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 ? (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm text-fg-muted">
              <button
                type="button"
                disabled={current <= 1}
                onClick={() => goToPage(current - 1)}
                className="rounded-md border border-line-strong px-3 py-1 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {current} of {pages}
              </span>
              <button
                type="button"
                disabled={current >= pages}
                onClick={() => goToPage(current + 1)}
                className="rounded-md border border-line-strong px-3 py-1 hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          ) : null}
        </section>
      </div>
    </div>
  );
}
