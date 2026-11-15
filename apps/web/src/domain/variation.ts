/**
 * What varied between the tests of one investigation and what stayed constant
 * (architecture rules AD-3, AD-5, AD-11). Counts only; display text is built on the screen.
 */

import type { TestRecord } from "@/generated/contract";
import { CONSTANT_TOLERANCE } from "./config";
import { isTestRow } from "./rows";

export type VariationStatus = "varied" | "constant" | "not-reported";

interface Base {
  /** Rows that report this condition. */
  reported: number;
  status: VariationStatus;
}

export interface NumericVariation extends Base {
  kind: "number";
  min: number | null;
  max: number | null;
}

export interface TextVariation extends Base {
  kind: "text";
  /** Distinct values, most frequent first. */
  values: string[];
}

export type Variation = NumericVariation | TextVariation;

export const VARIATION_FIELDS = [
  "fuel",
  "fuelGeometry",
  "thicknessMm",
  "o2Pct",
  "pressureKpa",
  "flowCmS",
  "flowDirection",
  "diluent",
  "outcome",
] as const;

export type VariationField = (typeof VARIATION_FIELDS)[number];

export interface InvestigationVariation {
  /** The rows compared: the individual tests, or every row when there is no individual test. */
  rows: number;
  onlyTests: boolean;
  fields: Record<VariationField, Variation>;
}

function numeric(values: (number | null)[][], tolerance: number): NumericVariation {
  const reported = values.filter((pair) => pair.some((value) => value !== null));
  const all = reported.flat().filter((value): value is number => value !== null);
  if (all.length === 0) return { kind: "number", reported: 0, status: "not-reported", min: null, max: null };
  const min = Math.min(...all);
  const max = Math.max(...all);
  return { kind: "number", reported: reported.length, status: max - min > tolerance ? "varied" : "constant", min, max };
}

function text(values: (string | null)[]): TextVariation {
  const counts = new Map<string, number>();
  let reported = 0;
  for (const value of values) {
    if (value === null || value.trim() === "") continue;
    reported += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
  const status: VariationStatus = sorted.length === 0 ? "not-reported" : sorted.length === 1 ? "constant" : "varied";
  return { kind: "text", reported, status, values: sorted };
}

export function investigationVariation(rows: readonly TestRecord[]): InvestigationVariation {
  const tests = rows.filter(isTestRow);
  const onlyTests = tests.length > 0;
  const compared = onlyTests ? tests : rows;
  const t = CONSTANT_TOLERANCE;
  return {
    rows: compared.length,
    onlyTests,
    fields: {
      fuel: text(compared.map((row) => row.fuelName)),
      fuelGeometry: text(compared.map((row) => row.fuelGeometry)),
      thicknessMm: numeric(compared.map((row) => [row.thicknessMm]), t.thicknessMm),
      o2Pct: numeric(compared.map((row) => [row.o2PctMin, row.o2PctMax, ...(row.o2PctValues ?? [])]), t.o2Pct),
      pressureKpa: numeric(compared.map((row) => [row.pressureKpaMin, row.pressureKpaMax]), t.pressureKpa),
      flowCmS: numeric(compared.map((row) => [row.flowCmSMin, row.flowCmSMax]), t.flowCmS),
      flowDirection: text(compared.map((row) => (row.flowDirection === "unknown" ? null : row.flowDirection))),
      diluent: text(compared.map((row) => row.diluent)),
      outcome: text(compared.map((row) => row.outcome)),
    },
  };
}
