import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./config";
import { isPageSize, pageOfRow, pageWindow, pagerItems } from "./pagination";

describe("pageWindow", () => {
  it("names the rows of a page, counted from 1", () => {
    expect(pageWindow(1989, 1, 50)).toEqual({ page: 1, pages: 40, size: 50, total: 1989, from: 1, to: 50 });
    expect(pageWindow(1989, 40, 50)).toMatchObject({ from: 1951, to: 1989 });
    expect(pageWindow(100, 2, 50)).toMatchObject({ pages: 2, from: 51, to: 100 });
  });

  it("shows the last page for a page past the end and the first for one below 1", () => {
    expect(pageWindow(121, 99, 50)).toMatchObject({ page: 3, from: 101, to: 121 });
    expect(pageWindow(121, 0, 50)).toMatchObject({ page: 1, from: 1 });
    expect(pageWindow(121, 2.7, 50)).toMatchObject({ page: 2 });
  });

  it("has one empty page for an empty list", () => {
    expect(pageWindow(0, 3, 25)).toEqual({ page: 1, pages: 1, size: 25, total: 0, from: 0, to: 0 });
  });

  it("uses the default page size", () => {
    expect(pageWindow(10, 1).size).toBe(DEFAULT_PAGE_SIZE);
  });
});

describe("pageOfRow", () => {
  it("keeps the same first row in view when the page size changes", () => {
    // Row 151 opens page 4 at 50 rows a page, page 7 at 25 and page 2 at 100.
    expect(pageOfRow(151, 25)).toBe(7);
    expect(pageOfRow(151, 100)).toBe(2);
    expect(pageOfRow(0, 100)).toBe(1);
  });
});

describe("pagerItems", () => {
  it("lists every page when there are few", () => {
    expect(pagerItems(1, 1)).toEqual([1]);
    expect(pagerItems(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it("keeps the first, the last and the neighbours of the current page", () => {
    expect(pagerItems(6, 40)).toEqual([1, "gap", 5, 6, 7, "gap", 40]);
    expect(pagerItems(1, 40)).toEqual([1, 2, "gap", 40]);
    expect(pagerItems(40, 40)).toEqual([1, "gap", 39, 40]);
  });

  it("shows a single left-out page instead of a gap", () => {
    expect(pagerItems(4, 40)).toEqual([1, 2, 3, 4, 5, "gap", 40]);
    expect(pagerItems(37, 40)).toEqual([1, "gap", 36, 37, 38, 39, 40]);
  });
});

describe("isPageSize", () => {
  it("accepts only the offered sizes", () => {
    for (const size of PAGE_SIZES) expect(isPageSize(size)).toBe(true);
    expect(isPageSize(7)).toBe(false);
  });
});
