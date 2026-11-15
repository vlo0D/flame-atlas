import Link from "next/link";
import { formatList, formatPressure, formatRange } from "@/domain/format";
import type { Investigation, TestRecord } from "@/generated/contract";
import { VARIATION_FIELDS, type Variation, type VariationField, investigationVariation } from "@/domain/variation";
import { testsHref } from "@/lib/url-state/test-filters";

const LABELS: Record<VariationField, string> = {
  fuel: "Fuel",
  fuelGeometry: "Fuel shape",
  thicknessMm: "Sample thickness",
  o2Pct: "Oxygen",
  pressureKpa: "Pressure",
  flowCmS: "Airflow speed",
  flowDirection: "Flow direction",
  diluent: "Diluent gas",
  outcome: "Outcome",
};

const UNITS: Partial<Record<VariationField, string>> = { thicknessMm: "mm", o2Pct: "%", flowCmS: "cm/s" };
const SHOWN_VALUES = 4;

function valuesText(field: VariationField, variation: Variation): string {
  if (variation.kind === "number") {
    const range = { min: variation.min, max: variation.max };
    return field === "pressureKpa" ? formatPressure(range) : formatRange(range, { unit: UNITS[field] });
  }
  const shown = formatList(variation.values.slice(0, SHOWN_VALUES));
  const more = variation.values.length - SHOWN_VALUES;
  return more > 0 ? `${shown}; and ${more} more` : shown;
}

/** What varied between the tests of one investigation, and a link to those rows. */
export function VariationSection({ investigationId, rows }: { investigationId: Investigation["id"]; rows: readonly TestRecord[] }) {
  const result = investigationVariation(rows);
  const noun = result.onlyTests ? "test" : "row";
  const reported = VARIATION_FIELDS.filter((field) => result.fields[field].status !== "not-reported");
  const missing = VARIATION_FIELDS.filter((field) => result.fields[field].status === "not-reported");

  return (
    <section>
      <h2 className="text-lg font-semibold">What varied between the tests</h2>
      {result.rows === 0 ? (
        <p className="mt-2 text-sm text-fg-muted">This investigation has no table rows in the data.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-fg-muted">
            Compared over its {result.rows} {result.onlyTests ? "individual tests" : "table rows (it has no individual tests)"}.
          </p>
          {reported.length > 0 ? (
            <div className="mt-2 overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-surface-muted text-xs uppercase tracking-wide text-fg-subtle">
                  <tr>
                    <th scope="col" className="px-3 py-2">Condition</th>
                    <th scope="col" className="px-3 py-2" />
                    <th scope="col" className="px-3 py-2">Values</th>
                    <th scope="col" className="px-3 py-2">Reported in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {reported.map((field) => {
                    const variation = result.fields[field];
                    const varied = variation.status === "varied";
                    return (
                      <tr key={field} className="align-top">
                        <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium text-fg">
                          {LABELS[field]}
                        </th>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs ${varied ? "bg-accent text-accent-fg" : "bg-surface-muted text-fg-muted"}`}
                          >
                            {varied ? "varied" : "constant"}
                          </span>
                        </td>
                        <td className="px-3 py-2 tabular-nums text-fg">{valuesText(field, variation)}</td>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-fg-muted">
                          {variation.reported} of {result.rows} {noun}
                          {result.rows === 1 ? "" : "s"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
          {missing.length > 0 ? (
            <p className="mt-2 text-sm text-fg-subtle">
              Not reported in any {noun}: {missing.map((field) => LABELS[field].toLowerCase()).join(", ")}.
            </p>
          ) : null}
        </>
      )}
      {rows.length > 0 ? (
        <p className="mt-2 text-sm">
          <Link
            href={testsHref({ investigationIds: [investigationId] })}
            className="text-fg-muted underline underline-offset-2 hover:text-fg"
          >
            Show all {rows.length} rows of this investigation in the Tests table
          </Link>
        </p>
      ) : null}
    </section>
  );
}
