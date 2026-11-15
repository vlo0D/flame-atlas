import type { ReactNode } from "react";
import { dataSource } from "@/lib/data";

export function PageHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      <p className="mt-1 max-w-3xl text-fg-muted">{lead}</p>
    </header>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-sm text-fg-subtle">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-fg">{value}</div>
      {hint ? <div className="mt-1 text-xs text-fg-subtle">{hint}</div> : null}
    </div>
  );
}

/** Shown on every page while the site runs on the sample rows. */
export function SampleDataBanner() {
  if (dataSource !== "fixtures") return null;
  return (
    <div role="status" className="border-b border-warn-line bg-warn-bg px-4 py-2 text-center text-sm text-warn-fg">
      Sample data: this build shows a few sample rows, not the full NASA PSI tables.
    </div>
  );
}

/** Honest marker for a part of a screen that is not built yet. */
export function NotBuiltYet({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-lg border border-dashed border-line-strong bg-surface-muted p-4">
      <h2 className="text-sm font-semibold text-fg-muted">{title}</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fg-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}
