"use client";

import Link from "next/link";
import { Fragment, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/page-parts";
import { RowDetails } from "@/components/row-source";
import { SiBadge } from "@/components/si-badge";
import { filterTests, hasActiveFilters } from "@/domain/filters";
import { formatGranularity, formatPressure, formatRange, formatText } from "@/domain/format";
import { pageOfRow, pageWindow } from "@/domain/pagination";
import { countRows, hasSiReading, isTestRow } from "@/domain/rows";
import type { TestFilters } from "@/domain/types";
import type { TestRecord } from "@/generated/contract";
import { getInvestigation, tests } from "@/lib/data";
import { investigationHref } from "@/lib/paths";
import { ExportButtons } from "./export-buttons";
import { Pager } from "./pager";
import { TestsFilters } from "./tests-filters";

/** Columns of the table, after the button that opens a row. */
const COLUMNS = ["Row", "Investigation", "Fuel", "Oxygen", "Pressure", "Airflow", "Outcome"] as const;

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  );
}

function TestRow({ row, open, onToggle }: { row: TestRecord; open: boolean; onToggle: () => void }) {
  const detailsId = `row-${row.id.replace(/[^\w-]/g, "_")}`;
  const label = formatText(row.label);
  const siOutcome = row.outcome !== null && row.inferred.includes("outcome") && hasSiReading(row);
  return (
    <Fragment>
      <tr className={`align-top ${open ? "bg-surface-muted" : "hover:bg-surface-muted/60"}`}>
        <td className="w-10 py-2 pl-2 pr-0">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={`${open ? "Hide" : "Show"} the source of row ${label}`}
            title={open ? "Hide the source" : "Show the source file, notes and original cells"}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            <Chevron open={open} />
          </button>
        </td>
        <td className="px-3 py-2">
          <span className="font-mono text-xs text-fg">{label}</span>
          {isTestRow(row) ? null : (
            <span className="mt-1 block w-fit rounded bg-surface-muted px-1.5 py-0.5 text-xs text-fg-muted ring-1 ring-inset ring-line">
              {formatGranularity(row.granularity)}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          <Link href={investigationHref(row.investigationId)} className="underline underline-offset-2 hover:text-fg">
            {getInvestigation(row.investigationId)?.acronym ?? row.investigationId}
          </Link>
        </td>
        <td className="min-w-[8rem] px-3 py-2">
          {formatText(row.fuelName)}
          {row.fuelState ? <span className="block text-xs text-fg-subtle">{row.fuelState}</span> : null}
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
            <span className="block text-xs text-fg-subtle">{row.flowDirection}</span>
          ) : null}
        </td>
        <td className="whitespace-nowrap px-3 py-2">
          {formatText(row.outcome)}
          {siOutcome ? (
            <span className="ml-1.5 align-middle">
              <SiBadge title="Read by a language model from the operator's note; open the row to see the quote" />
            </span>
          ) : null}
        </td>
      </tr>
      {open ? (
        <tr id={detailsId} className="bg-surface-muted">
          <td colSpan={COLUMNS.length + 1} className="border-t border-line px-4 pb-4 pt-3">
            <RowDetails row={row} wide />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

export function TestsView({
  filters,
  page,
  pageSize,
  onChange,
}: {
  filters: TestFilters;
  page: number;
  pageSize: number;
  onChange: (filters: TestFilters, page: number, pageSize: number) => void;
}) {
  const matching = useMemo(() => filterTests(tests, filters), [filters]);
  const counts = countRows(matching);
  const all = countRows(tests);
  const shown = pageWindow(matching.length, page, pageSize);
  const rows = matching.slice(shown.from - 1, shown.to);
  const tableRef = useRef<HTMLDivElement>(null);
  // Which rows are open is a passing state of the screen, not part of the address (AD-7).
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // The pager is under the table: after a page change, show the new page from its first row.
  function goToPage(next: number) {
    onChange(filters, next, shown.size);
    const table = tableRef.current;
    if (table && table.getBoundingClientRect().top < 0) table.scrollIntoView({ block: "start" });
  }

  // A new page size keeps the first row of the current page in view.
  function changeSize(size: number) {
    onChange(filters, pageOfRow(shown.from, size), size);
  }

  const filtered = hasActiveFilters(filters);

  return (
    <div>
      <PageHeader
        title="Tests"
        lead="One table for every row of the NASA PSI experiment tables, with the same fields and units. Missing values are shown as not reported, never as zero."
      />

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          <TestsFilters filters={filters} onChange={(next) => onChange(next, 1, shown.size)} />
        </aside>

        <section aria-label="Rows" className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
            <div className="min-w-0 flex-1 basis-[24rem]">
              <p className="text-sm text-fg-muted" aria-live="polite">
                {filtered ? "Matching the filters: " : "In this build: "}
                <span className="font-semibold text-fg">{plural(counts.tests, "test")}</span> and{" "}
                {plural(counts.total - counts.tests, "summary row")}
                {filtered ? (
                  <span className="text-fg-subtle">
                    {" "}
                    (of {plural(all.tests, "test")} and {plural(all.total - all.tests, "summary row")})
                  </span>
                ) : null}
                .
              </p>
              <p className="mt-0.5 text-xs text-fg-subtle">
                {filtered && !filters.includeNotReported ? "Rows that do not report a filtered value are left out. " : ""}
                Downloads hold every matching row, not just this page: normalized fields, source file, row number and
                every original column. An empty cell means not reported.
              </p>
            </div>
            <ExportButtons rows={matching} />
          </div>

          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line-strong bg-surface-muted p-6 text-sm text-fg-muted">
              <p className="font-medium text-fg">No row matches these filters.</p>
              <p className="mt-1">
                Many rows do not report pressure or airflow. Try switching on &quot;Include rows that do not report a
                filtered value&quot;, or reset the filters.
              </p>
            </div>
          ) : (
            <>
              {/*
                On wide screens the table fits, so the box clips instead of scrolling and the header row
                can stick to the top of the window. Narrower screens scroll the table sideways.
              */}
              <div
                ref={tableRef}
                className="scroll-mt-4 overflow-x-auto rounded-lg border border-line bg-surface xl:overflow-x-clip"
              >
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-fg-subtle xl:sticky xl:top-0 xl:z-10">
                    <tr className="border-b border-line bg-surface-muted">
                      <th scope="col" className="w-10 py-2 pl-2 pr-0">
                        <span className="sr-only">Source</span>
                      </th>
                      {COLUMNS.map((column) => (
                        <th key={column} scope="col" className="px-3 py-2 font-medium">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row) => (
                      <TestRow key={row.id} row={row} open={open.has(row.id)} onToggle={() => toggle(row.id)} />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* One pager, under the table: it is where the reader is when a page ends. */}
              <Pager shown={shown} onPage={goToPage} onSize={changeSize} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
