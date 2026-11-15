/**
 * Pages of the Tests table (architecture rules AD-3, AD-4, AD-12).
 * Pure functions: the screen only shows what they return.
 */

import { DEFAULT_PAGE_SIZE, PAGE_SIZES, PAGER_SIBLINGS } from "./config";
import type { PageWindow, PagerItem } from "./types";

/** True for a page size the table offers. */
export function isPageSize(value: number): value is (typeof PAGE_SIZES)[number] {
  return (PAGE_SIZES as readonly number[]).includes(value);
}

/** Which rows a page shows. A page past the end shows the last page; a page below 1 shows the first. */
export function pageWindow(total: number, page: number, size: number = DEFAULT_PAGE_SIZE): PageWindow {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const from = total === 0 ? 0 : (current - 1) * size + 1;
  const to = Math.min(current * size, total);
  return { page: current, pages, size, total, from, to };
}

/** The page that shows a row, counted from 1, at a given page size. */
export function pageOfRow(position: number, size: number): number {
  return Math.max(1, Math.ceil(position / size));
}

/**
 * Page numbers for the pager: always the first and the last, the current page with
 * `siblings` on each side, and a gap where pages are left out. A gap never stands
 * for a single page: that page is shown instead.
 *
 *   pagerItems(6, 40) → [1, "gap", 5, 6, 7, "gap", 40]
 */
export function pagerItems(current: number, pages: number, siblings: number = PAGER_SIBLINGS): PagerItem[] {
  if (pages <= 1) return [1];
  const shown = new Set<number>([1, pages]);
  for (let page = current - siblings; page <= current + siblings; page += 1) {
    if (page >= 1 && page <= pages) shown.add(page);
  }
  const sorted = [...shown].sort((a, b) => a - b);
  const items: PagerItem[] = [];
  sorted.forEach((page, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined) {
      if (page - previous === 2) items.push(previous + 1);
      else if (page - previous > 2) items.push("gap");
    }
    items.push(page);
  });
  return items;
}
