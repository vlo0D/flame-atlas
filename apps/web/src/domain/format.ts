/**
 * The only place that turns data values into display text (architecture rule AD-6).
 * `null` always becomes NOT_REPORTED and never a zero or an empty string.
 */

import type { Granularity, Gravity } from "@/generated/contract";
import { KPA_PER_PSI } from "./config";
import type { Interval, Range } from "./num";

export const NOT_REPORTED = "not reported";

const EN_DASH = "–";

/** Trims float noise: 17.399999999999999 becomes "17.4", 21 stays "21". */
export function formatNumber(value: number, maxDecimals = 2): string {
  return String(Number(value.toFixed(maxDecimals)));
}

export interface RangeFormatOptions {
  unit?: string;
  approx?: boolean;
  maxDecimals?: number;
}

/**
 * "22.2 %", "21.5–21.7 %", "21; 26.5; 40 %", "~22.1 %" or "not reported".
 */
export function formatRange(range: Range, options: RangeFormatOptions = {}): string {
  const { unit, approx = false, maxDecimals = 2 } = options;
  if (range.min === null || range.max === null) return NOT_REPORTED;

  let text: string;
  if (range.values && range.values.length > 1) {
    text = range.values.map((v) => formatNumber(v, maxDecimals)).join("; ");
  } else if (range.min === range.max) {
    text = formatNumber(range.min, maxDecimals);
  } else {
    text = `${formatNumber(range.min, maxDecimals)}${EN_DASH}${formatNumber(range.max, maxDecimals)}`;
  }
  if (approx) text = `~${text}`;
  return unit ? `${text} ${unit}` : text;
}

export function formatValue(value: number | null, unit?: string, maxDecimals = 2): string {
  if (value === null) return NOT_REPORTED;
  const text = formatNumber(value, maxDecimals);
  return unit ? `${text} ${unit}` : text;
}

export function kpaToPsi(kpa: number): number {
  return kpa / KPA_PER_PSI;
}

/** Pressure is always shown in kPa with psi in parentheses: "56.5 kPa (8.2 psi)". */
export function formatPressure(range: Range): string {
  if (range.min === null || range.max === null) return NOT_REPORTED;
  const kpa = formatRange(range, { unit: "kPa", maxDecimals: 1 });
  const psi =
    range.min === range.max
      ? formatNumber(kpaToPsi(range.min), 1)
      : `${formatNumber(kpaToPsi(range.min), 1)}${EN_DASH}${formatNumber(kpaToPsi(range.max), 1)}`;
  return `${kpa} (${psi} psi)`;
}

export function formatBoolean(value: boolean | null, yes = "yes", no = "no"): string {
  if (value === null) return NOT_REPORTED;
  return value ? yes : no;
}

/** "SIBAL fabric" with geometry "fabric" reads "SIBAL fabric", not "SIBAL fabric fabric". */
export function formatFuelName(name: string, geometry: string | null): string {
  if (!geometry || name.toLowerCase().endsWith(geometry.toLowerCase())) return name;
  return `${name} ${geometry}`;
}

export function formatText(value: string | null): string {
  return value === null || value.trim() === "" ? NOT_REPORTED : value;
}

const GRAVITY_LABELS: Record<Gravity, string> = {
  micro: "microgravity",
  normal: "normal gravity",
  "partial-simulated": "simulated partial gravity",
};

export function formatGravity(level: Gravity): string {
  return GRAVITY_LABELS[level];
}

/** "microgravity", "microgravity; normal gravity" or "not reported". */
export function formatGravityLevels(levels: readonly Gravity[]): string {
  return levels.length === 0 ? NOT_REPORTED : levels.map(formatGravity).join("; ");
}

const GRANULARITY_LABELS: Record<Granularity, { one: string; many: string }> = {
  test: { one: "test", many: "tests" },
  "test-day": { one: "test day", many: "test days" },
  "matrix-row": { one: "test-matrix row", many: "test-matrix rows" },
  reference: { one: "published figure", many: "published figures" },
};

/** What a table row is, in words: only "test" rows are individual experiments. */
export function formatGranularity(granularity: Granularity, plural = false): string {
  return GRANULARITY_LABELS[granularity][plural ? "many" : "one"];
}

/** "solid", "solid; liquid" or "not reported". */
export function formatList(values: readonly string[]): string {
  return values.length === 0 ? NOT_REPORTED : values.join("; ");
}

/** "PSI-25_Experimental table_BASS-II.csv" becomes "BASS-II". The full file name stays available next to it. */
export function formatTableName(tableFile: string): string {
  return tableFile.replace(/^PSI-\d+_Experimental table_/, "").replace(/\.csv$/i, "");
}

/**
 * A filter range in words: "30 to under 35 %", "over 50 to 70.33 kPa",
 * "at least 30 %", "at most 70.33 kPa". An open side is written as infinity in the interval.
 */
export function formatInterval(interval: Interval, unit?: string): string {
  const { lo, hi, closed } = interval;
  const tail = unit ? ` ${unit}` : "";
  const hasLo = Number.isFinite(lo);
  const hasHi = Number.isFinite(hi);
  if (!hasLo && !hasHi) return "any";
  if (!hasHi) return `${closed === "right" ? "over" : "at least"} ${formatNumber(lo)}${tail}`;
  if (!hasLo) return `${closed === "left" ? "under" : "at most"} ${formatNumber(hi)}${tail}`;
  const from = closed === "right" ? `over ${formatNumber(lo)}` : formatNumber(lo);
  const to = closed === "left" ? `under ${formatNumber(hi)}` : formatNumber(hi);
  return `${from} to ${to}${tail}`;
}
