import Link from "next/link";
import { PageHeader } from "@/components/page-parts";
import { KindBadge } from "@/components/kind-badge";
import { PillarBadge } from "@/components/pillar-badge";
import { countRows } from "@/domain/rows";
import { getTestsOfInvestigation, investigations } from "@/lib/data";
import { investigationHref } from "@/lib/paths";

export function InvestigationsList() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Investigations"
        lead="The NASA PSI combustion investigations behind the data: what each one studied and what it burned."
      />

      <ul className="grid gap-3 md:grid-cols-2">
        {investigations.map((investigation) => {
          const counts = countRows(getTestsOfInvestigation(investigation.id));
          const place = [investigation.platform, investigation.facility, investigation.insert].filter(Boolean).join(" · ");
          return (
            <li key={investigation.id}>
              <Link
                href={investigationHref(investigation.id)}
                className="block h-full rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{investigation.acronym ?? investigation.id}</span>
                  <PillarBadge pillar={investigation.pillarPrimary} />
                  <KindBadge investigation={investigation} />
                </div>
                <p className="mt-1 text-sm text-fg-muted">{investigation.title}</p>
                <p className="mt-2 text-xs text-fg-subtle">
                  {place || "Location not reported"} · {counts.tests} tests
                  {counts.total > counts.tests ? ` and ${counts.total - counts.tests} summary rows` : ""} in this build
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
