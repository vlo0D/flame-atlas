import type { Investigation } from "@/generated/contract";

/**
 * Marks a ground investigation: a modeling or laboratory study that reuses flight data from PSI.
 * Such a study has no flight table of its own, so its conditions are mostly not reported and it
 * ranks low, which says nothing about how useful its analysis is.
 */
export function KindBadge({ investigation }: { investigation: Pick<Investigation, "kind"> }) {
  if (investigation.kind !== "ground") return null;
  return (
    <span
      title="A ground study: modeling or laboratory work that analyses flight data. It has few or no test conditions of its own, so it ranks low on closeness."
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-fg-muted ring-1 ring-inset ring-line"
    >
      Ground study
    </span>
  );
}
