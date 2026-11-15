import Link from "next/link";
import { EXPLORATION_INTERVALS, cellAt, cellHolds, isExplorationCell, shadeLevel } from "@/domain/coverage";
import { formatInterval, formatRange } from "@/domain/format";
import type { Interval, Range } from "@/domain/num";
import { scenarioFlowRange } from "@/domain/rank";
import type { CoverageGrid as Grid, ScenarioInput } from "@/domain/types";
import type { FuelState } from "@/generated/contract";
import { testsHref } from "@/lib/url-state/test-filters";

const SHADES = [
  "border border-dashed border-line-strong bg-surface text-fg-subtle",
  "bg-[color-mix(in_srgb,var(--accent)_14%,var(--surface))] text-fg",
  "bg-[color-mix(in_srgb,var(--accent)_32%,var(--surface))] text-fg",
  "bg-[color-mix(in_srgb,var(--accent)_62%,var(--surface))] text-accent-fg",
  "bg-[color-mix(in_srgb,var(--accent)_88%,var(--surface))] text-accent-fg",
] as const;

const AXIS = {
  pressureKpa: { label: "Pressure", unit: "kPa" },
  flowCmS: { label: "Airflow speed", unit: "cm/s" },
} as const;

const edgeLabel = (interval: Interval) => formatRange({ min: interval.lo, max: interval.hi });

export function CoverageGrid({
  grid,
  scenario,
  fuelStates,
}: {
  grid: Grid;
  scenario: ScenarioInput;
  fuelStates: readonly FuelState[];
}) {
  const axis = AXIS[grid.yAxis];
  const max = Math.max(0, ...grid.cells.map((cell) => cell.tests));
  const scenarioY: Range =
    grid.yAxis === "pressureKpa" ? { min: scenario.pressureKpa, max: scenario.pressureKpa } : scenarioFlowRange(scenario);
  // Highest value on top, like a chart.
  const yOrder = grid.yIntervals.map((_, index) => index).reverse();

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface p-4">
      <table className="w-full min-w-[44rem] border-separate border-spacing-1 text-sm">
        <caption className="pb-2 text-left text-sm text-fg-muted">
          Number of individual tests in each cell. Columns: oxygen, % by volume. Rows: {axis.label.toLowerCase()},{" "}
          {axis.unit}.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-24 px-1 text-left text-xs font-medium text-fg-subtle">
              {axis.label}, {axis.unit}
            </th>
            {grid.xIntervals.map((x) => (
              <th key={x.lo} scope="col" className="px-1 text-center text-xs font-medium tabular-nums text-fg-subtle">
                {edgeLabel(x)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {yOrder.map((yIndex) => (
            <tr key={yIndex}>
              <th scope="row" className="px-1 text-left text-xs font-medium tabular-nums text-fg-subtle">
                {edgeLabel(grid.yIntervals[yIndex])}
              </th>
              {grid.xIntervals.map((x, xIndex) => {
                const cell = cellAt(grid, xIndex, yIndex);
                const here = cellHolds(cell, scenario.o2Pct, scenarioY);
                const exploration = grid.yAxis === "pressureKpa" && isExplorationCell(cell);
                const frame = here
                  ? "shadow-[inset_0_0_0_3px_var(--fg)]"
                  : exploration
                    ? "shadow-[inset_0_0_0_2px_var(--warn-line)]"
                    : "";
                const text = `${cell.tests} test${cell.tests === 1 ? "" : "s"}${cell.otherRows > 0 ? ` and ${cell.otherRows} summary row${cell.otherRows === 1 ? "" : "s"}` : ""}, oxygen ${edgeLabel(x)} %, ${axis.label.toLowerCase()} ${edgeLabel(cell.y)} ${axis.unit}${here ? ", your environment" : ""}${exploration ? ", exploration atmosphere" : ""}`;
                const body = (
                  <>
                    <span className="block text-base font-semibold tabular-nums leading-tight">{cell.tests}</span>
                    <span className="block text-[0.65rem] leading-tight">
                      {here ? "◆ you" : cell.otherRows > 0 ? `+${cell.otherRows} summary` : " "}
                    </span>
                  </>
                );
                const className = `block h-12 rounded-md px-1 py-1 text-center ${SHADES[shadeLevel(cell.tests, max)]} ${frame}`;
                return (
                  <td key={x.lo} className="p-0">
                    {cell.tests + cell.otherRows > 0 ? (
                      <Link
                        href={testsHref({
                          o2Pct: cell.x,
                          [grid.yAxis]: cell.y,
                          fuelStates: [...fuelStates],
                        })}
                        aria-label={text}
                        title={text}
                        className={`${className} hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent`}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div aria-label={text} title={text} className={className}>
                        {body}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fg-muted">
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm shadow-[inset_0_0_0_3px_var(--fg)]" />
          your environment
        </li>
        {grid.yAxis === "pressureKpa" ? (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm shadow-[inset_0_0_0_2px_var(--warn-line)]" />
            exploration atmosphere: {formatInterval({ ...EXPLORATION_INTERVALS.o2Pct, hi: Infinity }, "%")} oxygen,{" "}
            {formatInterval({ ...EXPLORATION_INTERVALS.pressureKpa, lo: -Infinity }, "kPa")}
          </li>
        ) : null}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm border border-dashed border-line-strong" />
          no test
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block h-3 w-5 rounded-sm ${SHADES[1]}`} />
          <span aria-hidden="true" className={`inline-block h-3 w-5 rounded-sm ${SHADES[4]}`} />
          fewer to more tests
        </li>
      </ul>
    </div>
  );
}
