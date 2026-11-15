import Link from "next/link";
import { ClaimText } from "@/components/claim-text";
import { KindBadge } from "@/components/kind-badge";
import { PillarBadge } from "@/components/pillar-badge";
import { formatFuelName, formatGravityLevels, formatPressure, formatRange, formatText } from "@/domain/format";
import { burnerO2Pct } from "@/domain/gaps";
import { countRows } from "@/domain/rows";
import type { Claim, Investigation } from "@/generated/contract";
import { getTestsOfInvestigation } from "@/lib/data";
import { testsHref } from "@/lib/url-state/test-filters";
import { VariationSection } from "./variation-section";

function ClaimList({ title, claims }: { title: string; claims: Claim[] }) {
  if (claims.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <ul className="mt-2 space-y-3">
        {claims.map((claim, index) => (
          <li key={index} className="rounded-lg border border-line bg-surface p-4">
            <ClaimText claim={claim} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function InvestigationDetail({ investigation }: { investigation: Investigation }) {
  const rows = getTestsOfInvestigation(investigation.id);
  const counts = countRows(rows);
  const { conditions } = investigation;
  const burner = rows.map(burnerO2Pct).filter((pct): pct is number => pct !== null);
  const years =
    investigation.yearStart === null && investigation.yearEnd === null
      ? null
      : [investigation.yearStart, investigation.yearEnd].filter((year) => year !== null).join("–");

  return (
    <article className="space-y-8">
      <header>
        <Link href="/investigations/" className="text-sm text-fg-subtle underline underline-offset-2">
          All investigations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{investigation.acronym ?? investigation.id}</h1>
          <PillarBadge pillar={investigation.pillarPrimary} />
          <KindBadge investigation={investigation} />
          {investigation.pillarsSecondary.map((pillar) => (
            <PillarBadge key={pillar} pillar={pillar} />
          ))}
        </div>
        <p className="mt-1 text-fg-muted">{investigation.title}</p>
        <p className="mt-1 text-xs text-fg-subtle">{investigation.id}</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <aside className="lg:order-last">
          <div className="space-y-4 lg:sticky lg:top-4">
            <section aria-labelledby="setup-heading" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="setup-heading" className="text-base font-semibold">
                Setup and conditions
              </h2>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                <dt className="text-fg-subtle">Platform</dt>
                <dd>{formatText(investigation.platform)}</dd>
                <dt className="text-fg-subtle">Facility</dt>
                <dd>{formatText([investigation.facility, investigation.insert].filter(Boolean).join(", ") || null)}</dd>
                <dt className="text-fg-subtle">Years</dt>
                <dd>{formatText(years)}</dd>
                <dt className="text-fg-subtle">Fuels</dt>
                <dd>
                  {investigation.fuels.length === 0
                    ? formatText(null)
                    : investigation.fuels
                        .map((fuel) => `${formatFuelName(fuel.name, fuel.geometry)} (${fuel.state})`)
                        .join("; ")}
                </dd>
                <dt className="text-fg-subtle">Oxygen</dt>
                <dd>{formatRange({ min: conditions.o2PctMin, max: conditions.o2PctMax }, { unit: "%" })}</dd>
                {burner.length > 0 ? (
                  <>
                    <dt className="text-fg-subtle">Oxygen through the burner</dt>
                    <dd>
                      {formatRange({ min: Math.min(...burner), max: Math.max(...burner) }, { unit: "%" })} in{" "}
                      {burner.length} inverse-flame tests: the oxidizer flows out of the burner into a fuel-filled
                      chamber, so these tests report no oxygen in the surrounding gas.
                    </dd>
                  </>
                ) : null}
                <dt className="text-fg-subtle">Pressure</dt>
                <dd>{formatPressure({ min: conditions.pressureKpaMin, max: conditions.pressureKpaMax })}</dd>
                <dt className="text-fg-subtle">Airflow</dt>
                <dd>{formatRange({ min: conditions.flowCmSMin, max: conditions.flowCmSMax }, { unit: "cm/s" })}</dd>
                <dt className="text-fg-subtle">Gravity</dt>
                <dd>{formatGravityLevels(conditions.gravity)}</dd>
                <dt className="text-fg-subtle">Rows in this build</dt>
                <dd>
                  {counts.tests} test{counts.tests === 1 ? "" : "s"}
                  {counts.total > counts.tests ? `, ${counts.total - counts.tests} summary rows` : ""}
                  {counts.total > 0 ? (
                    <>
                      {" · "}
                      <Link
                        href={testsHref({ investigationIds: [investigation.id] })}
                        className="underline underline-offset-2 hover:text-fg"
                      >
                        open in Tests
                      </Link>
                    </>
                  ) : null}
                </dd>
                <dt className="text-fg-subtle">Source</dt>
                <dd>
                  <a href={investigation.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {investigation.doi ? `DOI ${investigation.doi}` : "NASA PSI"}
                  </a>
                </dd>
              </dl>
            </section>
          </div>
        </aside>

        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="text-lg font-semibold">Summary</h2>
            <div className="mt-2 rounded-lg border border-line bg-surface p-4">
              <ClaimText claim={investigation.summary} />
            </div>
          </section>

          {investigation.fuelAnalogOf ? (
            <section>
              <h2 className="text-lg font-semibold">
                Fuel stands in for {investigation.fuelAnalogOf.states.join(" and ")} fuels
              </h2>
              <div className="mt-2 rounded-lg border border-line bg-surface p-4">
                <ClaimText claim={investigation.fuelAnalogOf.claim} />
              </div>
            </section>
          ) : null}

          <ClaimList title="Objectives" claims={investigation.objectives} />
          <ClaimList title="Measurements" claims={investigation.measurements} />
          <ClaimList title="Relevance to fire safety" claims={investigation.fireSafetyRelevance} />

          <VariationSection investigationId={investigation.id} rows={rows} />

          {investigation.publications.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">Publications</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {investigation.publications.map((publication, index) => (
                  <li key={`${publication.doi ?? publication.title}-${index}`}>
                    {publication.title}
                    {publication.year ? ` (${publication.year})` : ""}
                    {publication.doi ? (
                      <>
                        {" "}
                        <a
                          href={`https://doi.org/${publication.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          DOI
                        </a>
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </article>
  );
}
