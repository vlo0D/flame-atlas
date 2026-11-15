"use client";

import { useMemo } from "react";
import { PageHeader, StatTile } from "@/components/page-parts";
import { findGaps } from "@/domain/gaps";
import { rankInvestigations } from "@/domain/rank";
import { countRows } from "@/domain/rows";
import type { ScenarioInput } from "@/domain/types";
import { investigations, meta, scenarios, tests } from "@/lib/data";
import { PILLARS } from "@/lib/pillars";
import { describeEnvironment } from "@/lib/scenario-text";
import { matchingPreset } from "@/lib/url-state/scenario";
import { Findings } from "./findings";
import { RankList } from "./rank-list";
import { ScenarioForm } from "./scenario-form";
import { ScoreExplainer } from "./score-explainer";
import { SiBrief } from "./si-brief";

/** The Scenario screen for one environment. Where the environment comes from is the caller's business. */
export function ScenarioView({
  scenario,
  onChange,
}: {
  scenario: ScenarioInput;
  onChange: (next: ScenarioInput) => void;
}) {
  const result = useMemo(() => rankInvestigations(scenario, investigations, tests), [scenario]);
  const gaps = useMemo(() => findGaps(scenario, tests), [scenario]);
  const activePreset = matchingPreset(scenario, scenarios);
  const counts = countRows(tests);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Scenario"
        lead="Describe a crew environment to see which NASA microgravity combustion investigations tested conditions closest to it."
      />

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain">
          <ScenarioForm scenario={scenario} presets={scenarios} activePreset={activePreset} onChange={onChange} />
        </div>

        <div className="min-w-0 space-y-8">
        <Findings gaps={gaps} scenario={scenario} />

        <SiBrief scenario={scenario} preset={activePreset} />

        <section aria-labelledby="ranked-heading" className="min-w-0 space-y-3">
          <div>
            <h2 id="ranked-heading" className="text-lg font-semibold">
              {result.items.length} investigation{result.items.length === 1 ? "" : "s"},{" "}
              {scenario.focus === "all" ? "closest conditions first" : "chosen focus first, then closest conditions"}
            </h2>
            <p className="mt-1 min-h-[2lh] text-sm text-fg-muted" aria-live="polite">
              {activePreset ? `${activePreset.name}: ` : "Custom environment: "}
              {describeEnvironment(scenario)}
            </p>
            <p className="mt-1 text-sm text-fg-subtle">
              The score, 0 to 100, says how close an investigation&apos;s test conditions are to this environment. It
              is not a safety rating.
              {scenario.focus === "all"
                ? null
                : ` Investigations whose main pillar is ${PILLARS[scenario.focus].label} come first, then those where it is a secondary pillar, then the rest; each group is ordered by score.`}
            </p>
          </div>
          <ScoreExplainer />
          <RankList result={result} />
        </section>
        </div>
      </div>

      <section aria-label="What this build contains" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Investigations" value={investigations.length} />
        <StatTile label="Tests" value={counts.tests} hint="individual experiment runs" />
        <StatTile
          label="Summary rows"
          value={counts.total - counts.tests}
          hint="test days and test-matrix rows, not single tests"
        />
        <StatTile label="Source tables" value={meta.counts.tables} />
      </section>

    </div>
  );
}
