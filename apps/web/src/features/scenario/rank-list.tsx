import Link from "next/link";
import { KindBadge } from "@/components/kind-badge";
import { PillarBadge } from "@/components/pillar-badge";
import { RowSource } from "@/components/row-source";
import { RANK_WEIGHTS } from "@/domain/config";
import {
  NOT_REPORTED,
  formatGranularity,
  formatGravityLevels,
  formatList,
  formatNumber,
  formatPressure,
  formatRange,
  formatText,
} from "@/domain/format";
import { checkedPoints, componentPoints } from "@/domain/rank";
import { isTestRow } from "@/domain/rows";
import type { RankComponent, RankItem, RankResult } from "@/domain/types";
import type { Investigation, TestRecord } from "@/generated/contract";
import { getInvestigation, getTest } from "@/lib/data";
import { investigationHref } from "@/lib/paths";
import { PILLARS } from "@/lib/pillars";
import { COMPONENT_LABELS } from "./labels";

const COMPONENTS = Object.keys(RANK_WEIGHTS) as RankComponent[];

/** What the investigation's data says about one part of the score. Display only. */
function testedText(name: RankComponent, investigation: Investigation): string {
  const { conditions, testStats } = investigation;
  switch (name) {
    case "o2":
      return formatRange({ min: conditions.o2PctMin, max: conditions.o2PctMax }, { unit: "%" });
    case "fuel":
      return formatList(investigation.fuelStates);
    case "pressure":
      return formatPressure({ min: conditions.pressureKpaMin, max: conditions.pressureKpaMax });
    case "pillar":
      return [investigation.pillarPrimary, ...investigation.pillarsSecondary]
        .map((pillar, index) => (index === 0 ? `${PILLARS[pillar].label} (main)` : PILLARS[pillar].label))
        .join("; ");
    case "flow":
      return formatRange({ min: conditions.flowCmSMin, max: conditions.flowCmSMax }, { unit: "cm/s" });
    case "data": {
      const tables = testStats.tableFiles.length;
      const papers = investigation.publications.length;
      return `${testStats.rowCount} table row${testStats.rowCount === 1 ? "" : "s"}, ${tables} table${tables === 1 ? "" : "s"}, ${papers} publication${papers === 1 ? "" : "s"}`;
    }
    case "gravity":
      return formatGravityLevels(conditions.gravity);
  }
}

function ScoreBreakdown({ item, investigation }: { item: RankItem; investigation: Investigation }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm sm:min-w-[30rem]">
        <thead className="text-xs uppercase tracking-wide text-fg-subtle">
          <tr>
            <th scope="col" className="py-1 pr-3 font-medium">Part of the score</th>
            <th scope="col" className="py-1 pr-3 font-medium">What the investigation tested</th>
            {/* The bar is decoration for the number next to it; narrow screens show the number alone. */}
            <th scope="col" className="hidden sm:table-cell" aria-hidden="true" />
            <th scope="col" className="py-1 text-right font-medium">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {COMPONENTS.map((name) => {
            const { earned, max } = componentPoints(item, name);
            const unknown = item.unknownComponents.includes(name);
            const tested = testedText(name, investigation);
            return (
              <tr key={name}>
                <th scope="row" className="py-1.5 pr-3 font-medium text-fg">
                  {COMPONENT_LABELS[name]}
                </th>
                <td className={`py-1.5 pr-3 ${tested === NOT_REPORTED ? "text-fg-subtle italic" : "text-fg-muted"}`}>
                  {tested}
                </td>
                <td className="hidden w-28 py-1.5 pr-3 sm:table-cell">
                  <div aria-hidden="true" className="h-2 w-28 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={
                        unknown
                          ? "h-full bg-[repeating-linear-gradient(45deg,var(--line-strong)_0_3px,transparent_3px_6px)]"
                          : "h-full bg-accent"
                      }
                      // A value that is not reported fills the bar with stripes: no points, and nothing to compare.
                      // Whole percent: a long fraction is rewritten by the browser and no longer matches the static HTML.
                      style={{ width: unknown ? "100%" : `${Math.round(item.components[name] * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="w-24 whitespace-nowrap py-1.5 text-right tabular-nums text-fg-muted">
                  <span className="text-fg">{formatNumber(earned, 1)}</span> of {formatNumber(max, 1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ClosestRows({ rows, investigation }: { rows: TestRecord[]; investigation: Investigation }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-fg-subtle">
        {investigation.testStats.rowCount === 0
          ? "This investigation has no table rows in the data."
          : "No row of this investigation in this build reports oxygen, pressure or airflow."}
      </p>
    );
  }
  const allTests = rows.every(isTestRow);
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-fg-muted hover:text-fg">
        {rows.length} closest {allTests ? `test${rows.length === 1 ? "" : "s"}` : `row${rows.length === 1 ? "" : "s"}`} in
        the data
      </summary>
      <ul className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-line bg-bg p-3">
            <p className="text-fg">
              <span className="font-mono text-xs">{formatText(row.label)}</span>
              {isTestRow(row) ? null : (
                <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-fg-muted">
                  {formatGranularity(row.granularity)}, not a single test
                </span>
              )}
            </p>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-fg-muted">
              <dt className="text-fg-subtle">Fuel</dt>
              <dd>{formatText(row.fuelName)}</dd>
              <dt className="text-fg-subtle">Oxygen</dt>
              <dd className="tabular-nums">
                {formatRange(
                  { min: row.o2PctMin, max: row.o2PctMax, values: row.o2PctValues },
                  { unit: "%", approx: row.o2PctApprox },
                )}
              </dd>
              <dt className="text-fg-subtle">Pressure</dt>
              <dd className="tabular-nums">{formatPressure({ min: row.pressureKpaMin, max: row.pressureKpaMax })}</dd>
              <dt className="text-fg-subtle">Airflow</dt>
              <dd className="tabular-nums">
                {formatRange({ min: row.flowCmSMin, max: row.flowCmSMax }, { unit: "cm/s" })}
              </dd>
            </dl>
            <div className="mt-2">
              <RowSource row={row} />
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RankCard({ item, position }: { item: RankItem; position: number }) {
  const investigation = getInvestigation(item.investigationId);
  if (!investigation) return null;
  const rows = item.nearestRowIds.map(getTest).filter((row): row is TestRecord => row !== undefined);
  const checked = checkedPoints(item);

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      {/*
        Two fixed columns: the score keeps its place at the top right however long the title is
        and whether or not the note under it is shown.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm tabular-nums text-fg-subtle">#{position}</span>
            <h3 className="text-lg font-semibold">
              <Link href={investigationHref(investigation.id)} className="underline-offset-2 hover:underline">
                {investigation.acronym ?? investigation.id}
              </Link>
            </h3>
            <PillarBadge pillar={investigation.pillarPrimary} />
            <KindBadge investigation={investigation} />
            {investigation.pillarsSecondary.map((pillar) => (
              <PillarBadge key={pillar} pillar={pillar} />
            ))}
          </div>
          <p className="mt-0.5 text-sm text-fg-muted">{investigation.title}</p>
        </div>
        <div className="w-28 text-right sm:w-36">
          <p aria-label={`Score ${formatNumber(item.score, 1)} out of 100`} className="whitespace-nowrap">
            <span className="text-2xl font-semibold tabular-nums text-fg">{formatNumber(item.score, 1)}</span>
            <span className="text-sm text-fg-subtle"> / 100</span>
          </p>
          {checked < 100 ? (
            <p className="mt-0.5 text-xs leading-snug text-fg-subtle">
              {formatNumber(checked, 0)} of 100 points checked against the data
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <ScoreBreakdown item={item} investigation={investigation} />
      </div>

      {item.caveats.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-fg-muted">
          {item.caveats.map((caveat) => (
            <li key={caveat}>{caveat}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <ClosestRows rows={rows} investigation={investigation} />
        </div>
        <Link
          href={investigationHref(investigation.id)}
          className="shrink-0 text-sm text-fg-muted underline underline-offset-2 hover:text-fg"
        >
          Open the investigation card
        </Link>
      </div>
    </li>
  );
}

export function RankList({ result }: { result: RankResult }) {
  if (result.items.length === 0) {
    return <p className="text-sm text-fg-muted">There are no investigations in the data.</p>;
  }
  return (
    <ol className="space-y-3">
      {result.items.map((item, index) => (
        <RankCard key={item.investigationId} item={item} position={index + 1} />
      ))}
    </ol>
  );
}
