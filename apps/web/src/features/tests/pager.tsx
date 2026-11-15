"use client";

import { useId } from "react";
import { PAGE_SIZES } from "@/domain/config";
import { pagerItems } from "@/domain/pagination";
import type { PageWindow } from "@/domain/types";

const PAGE_BUTTON =
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm tabular-nums " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40";
const PAGE_OFF = "border-line-strong text-fg-muted hover:bg-surface-muted hover:text-fg";
const PAGE_ON = "border-accent bg-accent font-medium text-accent-fg";

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

/**
 * Rows per page, which rows are shown, and buttons for the first, previous, numbered, next
 * and last page. The numbers come from src/domain/pagination.ts.
 */
export function Pager({
  shown,
  onPage,
  onSize,
}: {
  shown: PageWindow;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
}) {
  const sizeId = useId();
  const { page, pages, size, total, from, to } = shown;
  const items = pagerItems(page, pages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-sm text-fg-muted">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={sizeId} className="flex items-center gap-2">
          Rows per page
          <select
            id={sizeId}
            value={size}
            onChange={(event) => onSize(Number(event.target.value))}
            className="rounded-md border border-line-strong bg-bg px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
          >
            {PAGE_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <span aria-live="polite" className="tabular-nums">
          {total === 0 ? "No rows" : `${formatCount(from)}–${formatCount(to)} of ${formatCount(total)}`}
        </span>
      </div>

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(1)}
            aria-label="First page"
            className={`${PAGE_BUTTON} ${PAGE_OFF}`}
          >
            «
          </button>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
            className={`${PAGE_BUTTON} ${PAGE_OFF}`}
          >
            ‹
          </button>
          {items.map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-fg-subtle">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                onClick={() => onPage(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                className={`${PAGE_BUTTON} ${item === page ? PAGE_ON : PAGE_OFF}`}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
            className={`${PAGE_BUTTON} ${PAGE_OFF}`}
          >
            ›
          </button>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => onPage(pages)}
            aria-label="Last page"
            className={`${PAGE_BUTTON} ${PAGE_OFF}`}
          >
            »
          </button>
        </nav>
      ) : null}
    </div>
  );
}
