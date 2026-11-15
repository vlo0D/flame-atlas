import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-parts";
import { NEAR_SCENARIO, UNKNOWN_COMPONENT_SCORE } from "@/domain/config";
import { formatGranularity } from "@/domain/format";
import { type Condition, conditionReporting } from "@/domain/rows";
import { dataSource, getInvestigation, meta, tests } from "@/lib/data";

const LINK_CLASS = "underline underline-offset-2 hover:text-fg";

const CONDITION_LABELS: Record<Condition, string> = {
  oxygen: "Oxygen",
  pressure: "Pressure",
  airflow: "Airflow speed",
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 max-w-3xl space-y-2 text-sm text-fg-muted">{children}</div>
    </section>
  );
}

export function MethodologyScreen() {
  const { quality } = meta;
  const checked = quality.checkedValues !== null && quality.correctValues !== null;
  const reporting = conditionReporting(tests);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Methodology"
        lead="Where the data comes from, how it was prepared and checked, how the numbers on the other screens are computed, and what the data cannot tell you."
      />

      <Section title="Data source">
        <p>
          All data comes from{" "}
          <a href={meta.source.url} target="_blank" rel="noreferrer" className={LINK_CLASS}>
            {meta.source.name}
          </a>
          , published under {meta.source.license}. A data pipeline reads the {meta.counts.tables} experiment tables of
          the {meta.counts.investigations} combustion investigations, maps every column onto common fields and units,
          and writes four files that follow data contract {meta.contractVersion}. The site reads only those files: it
          does not call NASA, a database or an AI model while you use it.
        </p>
        {dataSource === "fixtures" ? (
          <p className="text-warn-fg">This build runs on sample data: a few rows normalized by hand to develop the site.</p>
        ) : null}
      </Section>

      <Section title="How complete the test conditions are">
        <p>
          Of {meta.counts.rows} table rows, {reporting.tests} are individual tests; the rest summarise a test day, a
          test-matrix range or a published figure. Many NASA tables do not record every condition. A missing value
          stays empty and is shown as not reported, never as zero or a guess.
        </p>
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-fg-subtle">
              <tr>
                <th scope="col" className="px-3 py-2">Condition</th>
                <th scope="col" className="px-3 py-2">Reported in</th>
                <th scope="col" className="px-3 py-2">Of these, taken from a NASA document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(Object.keys(CONDITION_LABELS) as Condition[]).map((name) => {
                const { reported, fromDocuments } = reporting.conditions[name];
                return (
                  <tr key={name}>
                    <th scope="row" className="px-3 py-2 font-medium text-fg">
                      {CONDITION_LABELS[name]}
                    </th>
                    <td className="px-3 py-2 tabular-nums">
                      {reported} of {reporting.tests} tests
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fromDocuments}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p>
          Where a table leaves a condition out but the same investigation records it elsewhere, the value is taken
          from that document: for example oxygen, pressure and airflow of the BASS tests come from its As Run Test
          Matrix, the pressure of the SAFFIRE and SAME-R tests is the median reading of each test&apos;s own sensor
          telemetry, and the oxygen of the SPICE tests is the range its final report gives for the cabin air. Such
          values are marked in the row&apos;s source on the Tests screen, and the document is quoted in the
          row&apos;s notes.
        </p>
      </Section>

      <Section title="How the numbers on the other screens are computed">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="font-medium text-fg">Score.</strong> Seven parts (oxygen, fuel, pressure, focus,
            airflow, amount of data, gravity), each from 0 to 1, weighted and scaled to 100. A condition the data does
            not report earns {UNKNOWN_COMPONENT_SCORE}, and the card says how many of the 100 points could be checked.
            The weights are a first version and have not been reviewed by a combustion specialist. The full rules are
            under &quot;How the score is calculated&quot; on the <Link href="/" className={LINK_CLASS}>Scenario</Link>{" "}
            screen.
          </li>
          <li>
            <strong className="font-medium text-fg">Tests near an environment.</strong> A test with the same fuel
            state whose oxygen is within {NEAR_SCENARIO.o2Pct} percentage points and whose pressure is within{" "}
            {NEAR_SCENARIO.pressureKpa} kPa of the environment. A test that does not report one of them is not counted
            as near.
          </li>
          <li>
            <strong className="font-medium text-fg">Coverage and gaps.</strong> Counts of individual tests per oxygen
            and pressure or airflow band, on the <Link href="/coverage/" className={LINK_CLASS}>Coverage</Link>{" "}
            screen. Every count links to the Tests table filtered to exactly the rows it counted.
          </li>
          <li>The score compares test conditions. It is not a safety rating.</li>
        </ul>
      </Section>

      <Section title="Checks">
        <p>
          {checked
            ? `${quality.correctValues} of ${quality.checkedValues} normalized values matched the source when a person compared them by hand.`
            : "A person has not yet compared a sample of normalized values with the source by hand."}
        </p>
        {quality.notes ? <p className="text-fg-subtle">{quality.notes}</p> : null}
      </Section>

      <Section title="Known limits of the data">
        <ul className="list-disc space-y-1 pl-5">
          {meta.dataNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>

      <Section title="How AI was used">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Preparing the data: an AI assistant helped write the table mappings. Each mapping is a JSON file a person
            can read, and ordinary code applies it to every row the same way. The original cells of every row are kept
            next to the normalized values.
          </li>
          <li>
            Investigation summaries quote the NASA metadata word for word. Code checks that each quote exists in the
            source text and drops the statement if it does not.
          </li>
          <li>An AI coding assistant helped write the pipeline and this site; the team reviewed and tested the code.</li>
          <li>Ranking, coverage and data gaps are computed by ordinary code in your browser, without AI.</li>
        </ul>
      </Section>

      <Section title="Source tables in this build">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-fg-subtle">
              <tr>
                <th scope="col" className="px-3 py-2">Investigation</th>
                <th scope="col" className="px-3 py-2">Table file</th>
                <th scope="col" className="px-3 py-2">Rows</th>
                <th scope="col" className="px-3 py-2">What a row is</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {meta.tables.map((table) => (
                <tr key={table.tableFile}>
                  <td className="whitespace-nowrap px-3 py-2">
                    {getInvestigation(table.investigationId)?.acronym ?? table.investigationId}
                  </td>
                  <td className="px-3 py-2 text-xs text-fg-muted">{table.tableFile}</td>
                  <td className="px-3 py-2 tabular-nums">{table.rows}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatGranularity(table.granularity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
