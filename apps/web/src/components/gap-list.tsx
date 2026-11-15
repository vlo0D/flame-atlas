import Link from "next/link";
import { gapFilters } from "@/domain/gaps";
import type { Gap, ScenarioInput } from "@/domain/types";
import { testsHref } from "@/lib/url-state/test-filters";

const TITLES: Record<Gap["kind"], string> = {
  "near-scenario": "Tests near this environment",
  "exploration-solids": "Solid fuels in the exploration atmosphere",
  "burner-oxygen": "Oxygen fed through the burner",
  "partial-gravity": "Partial gravity",
  "not-reported": "Values the tables leave out",
};

/**
 * Data gaps as counted statements. The numbers come from findGaps; a gap that is
 * a list of rows links to the Tests table filtered to exactly those rows.
 */
export function GapList({ gaps, scenario }: { gaps: readonly Gap[]; scenario: ScenarioInput }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {gaps.map((gap) => {
        const filters = gapFilters(gap.kind, scenario);
        return (
          <li key={gap.kind} className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-sm font-semibold text-fg">{TITLES[gap.kind]}</h3>
            <p className="mt-1 text-sm text-fg-muted">{gap.statement}</p>
            {filters && gap.count > 0 ? (
              <Link
                href={testsHref(filters)}
                className="mt-2 inline-block text-sm text-fg-muted underline underline-offset-2 hover:text-fg"
              >
                Show {gap.count === 1 ? "this test" : `these ${gap.count} tests`}
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
