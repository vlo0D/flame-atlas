"use client";

import { exportFileName, toCsv, toJson } from "@/domain/export";
import type { TestRecord } from "@/generated/contract";

function download(text: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

const BUTTON =
  "rounded-md border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-muted " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Downloads the rows that match the filters, all pages. The files are made in the browser. */
export function ExportButtons({ rows }: { rows: readonly TestRecord[] }) {
  const none = rows.length === 0;
  const what = `${rows.length} row${rows.length === 1 ? "" : "s"}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={none}
        title={`Download the ${what} that match the filters, every page`}
        onClick={() => download(toCsv(rows), exportFileName(rows.length, "csv"), "text/csv;charset=utf-8")}
        className={BUTTON}
      >
        Download CSV
      </button>
      <button
        type="button"
        disabled={none}
        title={`Download the ${what} that match the filters, every page`}
        onClick={() => download(toJson(rows), exportFileName(rows.length, "json"), "application/json")}
        className={BUTTON}
      >
        Download JSON
      </button>
    </div>
  );
}
