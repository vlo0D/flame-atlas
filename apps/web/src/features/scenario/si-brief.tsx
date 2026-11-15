import { useMemo } from "react";
import { SiBadge } from "@/components/si-badge";
import { buildBriefFacts, knownInvestigationNames, verifyBrief } from "@/domain/brief";
import { formatValue } from "@/domain/format";
import type { FactValue, ScenarioInput } from "@/domain/types";
import type { Scenario } from "@/generated/contract";
import { briefFile, getBrief, investigations, tests } from "@/lib/data";

const KNOWN_NAMES = knownInvestigationNames(investigations);

function factText(value: FactValue): string {
  return typeof value === "string" ? value : formatValue(value, undefined, 3);
}

function plural(count: number, one: string): string {
  return `${count} ${one}${count === 1 ? "" : "s"}`;
}

/**
 * The SI brief of a preset environment: a few sentences a language model wrote ahead of time
 * from the numbers this screen computes. Every sentence is checked here, in the browser, against
 * the facts it cites (src/domain/brief.ts); one that fails is not shown.
 *
 * A custom environment has no brief: the model is not called while the site runs.
 */
export function SiBrief({ scenario, preset }: { scenario: ScenarioInput; preset: Scenario | undefined }) {
  const brief = preset ? getBrief(preset.id) : undefined;
  const facts = useMemo(() => (brief ? buildBriefFacts(scenario, investigations, tests) : null), [brief, scenario]);

  if (!brief || !facts) {
    return (
      <p className="text-sm text-fg-subtle">
        <span className="font-medium text-fg-muted">SI brief.</span> A short reading of these numbers is written ahead
        of time for the preset environments. Choose a preset to see it; for custom values everything above and below
        is still computed live.
      </p>
    );
  }

  const check = verifyBrief(brief, facts, KNOWN_NAMES);
  const shown = brief.sentences.filter((_, index) => check.sentences[index].ok);
  const hidden = brief.sentences.length - shown.length;
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby="si-brief-heading" className="rounded-lg border border-line-strong bg-surface p-5">
      <h2 id="si-brief-heading" className="flex flex-wrap items-center gap-2 text-base font-semibold text-fg">
        <SiBadge title="Written by a language model; every number and name is checked by code against the data" />
        SI brief for {preset?.name}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-fg">{shown.map((sentence) => sentence.text).join(" ")}</p>

      <p className="mt-3 text-xs text-fg-subtle">
        Written ahead of time by {briefFile.model} from the numbers this page computes. Code checked{" "}
        {plural(check.numbersChecked, "number")} and {plural(check.namesChecked, "investigation name")} in it against
        the data just now; a sentence that fails the check is not shown.
        {hidden > 0 ? ` ${plural(hidden, "sentence")} hidden: the data changed after it was written.` : ""} The brief
        describes what was tested, not how safe the environment is.
      </p>

      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-fg-subtle hover:text-fg">What was checked</summary>
        <ol className="mt-2 list-decimal space-y-3 rounded-md border border-line bg-surface-muted p-3 pl-8 text-fg-muted">
          {brief.sentences.map((sentence, index) => {
            const result = check.sentences[index];
            return (
              <li key={sentence.text}>
                <p className={result.ok ? "text-fg" : "text-fg-subtle line-through"}>{sentence.text}</p>
                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono">
                  {sentence.facts.map((key) => (
                    <span key={key}>
                      {key} = {key in facts ? factText(facts[key]) : "unknown fact"}
                    </span>
                  ))}
                </p>
                {result.ok ? null : <p className="mt-1 text-warn-fg">Not shown: {result.problems.join("; ")}.</p>}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
