"use client";

import Link from "next/link";
import { useMemo } from "react";
import { GapList } from "@/components/gap-list";
import { PageHeader } from "@/components/page-parts";
import { buildCoverageGrid } from "@/domain/coverage";
import { findGaps } from "@/domain/gaps";
import { countRows } from "@/domain/rows";
import type { ScenarioInput } from "@/domain/types";
import { FUEL_STATES, type FuelState } from "@/generated/contract";
import { scenarios, tests } from "@/lib/data";
import { describeEnvironment } from "@/lib/scenario-text";
import { buildScenarioParams, matchingPreset } from "@/lib/url-state/scenario";
import { CoverageGrid } from "./coverage-grid";
import type { CoverageView as View } from "./url";

const CHIP =
  "rounded-md border px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
const CHIP_ON = "border-accent bg-accent text-accent-fg";
const CHIP_OFF = "border-line-strong text-fg-muted hover:bg-surface-muted hover:text-fg";

function sameStates(a: readonly FuelState[], b: readonly FuelState[]): boolean {
  return a.length === b.length && a.every((state) => b.includes(state));
}

const Y_AXES: { value: View["yAxis"]; label: string }[] = [
  { value: "pressureKpa", label: "Oxygen against pressure" },
  { value: "flowCmS", label: "Oxygen against airflow" },
];

export function CoverageView({
  scenario,
  view,
  onChange,
}: {
  scenario: ScenarioInput;
  view: View;
  onChange: (next: View) => void;
}) {
  const grid = useMemo(() => buildCoverageGrid(tests, view.yAxis, view.fuelStates), [view]);
  const gaps = useMemo(() => findGaps(scenario, tests), [scenario]);
  const preset = matchingPreset(scenario, scenarios);
  const total = countRows(tests).total;
  const yName = view.yAxis === "pressureKpa" ? "pressure" : "airflow speed";

  function toggleFuel(state: FuelState) {
    const next = view.fuelStates.includes(state)
      ? view.fuelStates.filter((item) => item !== state)
      : FUEL_STATES.filter((item) => item === state || view.fuelStates.includes(item));
    onChange({ ...view, fuelStates: next });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coverage"
        lead="Where NASA has tested and where it has not. Every test is placed on a grid by its oxygen level and its pressure or airflow speed; an empty cell is a combination nobody tested."
      />

      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg">{preset ? preset.name : "Custom environment"}:</span>{" "}
        {describeEnvironment(scenario)}.{" "}
        <Link href={`/?${buildScenarioParams(scenario, scenarios).toString()}`} className="underline underline-offset-2 hover:text-fg">
          Change the environment
        </Link>
      </p>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div role="group" aria-label="Grid axes" className="flex flex-wrap gap-2">
          {Y_AXES.map((axis) => (
            <button
              key={axis.value}
              type="button"
              aria-pressed={view.yAxis === axis.value}
              onClick={() => onChange({ ...view, yAxis: axis.value })}
              className={`${CHIP} ${view.yAxis === axis.value ? CHIP_ON : CHIP_OFF}`}
            >
              {axis.label}
            </button>
          ))}
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <legend className="sr-only">Fuel state shown in the grid</legend>
          <span aria-hidden="true" className="text-sm font-medium text-fg">
            Fuel state:
          </span>
          {FUEL_STATES.map((state) => (
            <label key={state} className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={view.fuelStates.includes(state)}
                onChange={() => toggleFuel(state)}
                className="h-4 w-4 accent-accent"
              />
              {state}
            </label>
          ))}
          {view.fuelStates.length === 0 ? <span className="text-xs text-fg-subtle">none ticked: all fuels</span> : null}
          {scenario.fuelStates.length > 0 && !sameStates(view.fuelStates, scenario.fuelStates) ? (
            <button
              type="button"
              onClick={() => onChange({ ...view, fuelStates: FUEL_STATES.filter((s) => scenario.fuelStates.includes(s)) })}
              className="text-xs text-fg-muted underline underline-offset-2 hover:text-fg"
            >
              Show only this environment&apos;s fuel ({scenario.fuelStates.join(", ")})
            </button>
          ) : null}
        </fieldset>
      </div>

      <CoverageGrid grid={grid} scenario={scenario} fuelStates={view.fuelStates} />

      <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
        <li>
          {grid.notReportedOnX} of {total} table rows do not report oxygen and {grid.notReportedOnY} do not report{" "}
          {yName}; they are not in the grid{view.fuelStates.length > 0 ? " (counted for the ticked fuel states only)" : ""}.
        </li>
        <li>
          {grid.multiCellRows} row{grid.multiCellRows === 1 ? "" : "s"} list several values or a span and{" "}
          {grid.multiCellRows === 1 ? "is" : "are"} counted in more than one cell, so the cells do not add up to the
          number of tests.
        </li>
        <li>
          A number is individual tests; &ldquo;+N summary&rdquo; counts rows that sum up a test day or a test-matrix
          range in the same cell. A cell opens the Tests table filtered to its rows.
        </li>
      </ul>

      <section aria-labelledby="gaps-heading" className="space-y-3">
        <h2 id="gaps-heading" className="text-lg font-semibold">
          Gaps for this environment
        </h2>
        <GapList gaps={gaps} scenario={scenario} />
      </section>
    </div>
  );
}
