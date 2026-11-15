import type { Granularity, TestRecord } from "@/generated/contract";
import { SI_NOTE_MARKER } from "./config";

/**
 * The only definition of "a test" on the site (architecture rule AD-5).
 * Rows that summarise a test day, a test-matrix range or a published figure are not tests.
 */
export function isTestRow(row: Pick<TestRecord, "granularity">): boolean {
  return row.granularity === "test";
}

export interface RowCounts {
  /** Individual experiment runs. */
  tests: number;
  /** Every other kind of row, by granularity. */
  other: Partial<Record<Exclude<Granularity, "test">, number>>;
  /** All rows. */
  total: number;
}

export function countRows(rows: readonly Pick<TestRecord, "granularity">[]): RowCounts {
  const counts: RowCounts = { tests: 0, other: {}, total: rows.length };
  for (const row of rows) {
    if (isTestRow(row)) {
      counts.tests += 1;
    } else {
      const kind = row.granularity as Exclude<Granularity, "test">;
      counts.other[kind] = (counts.other[kind] ?? 0) + 1;
    }
  }
  return counts;
}

/** The conditions the Methodology screen accounts for, with the field that holds each. */
export const CONDITION_FIELDS = {
  oxygen: "o2PctMin",
  pressure: "pressureKpaMin",
  airflow: "flowCmSMin",
} as const satisfies Record<string, keyof TestRecord>;

export type Condition = keyof typeof CONDITION_FIELDS;

/** What happened in a test, with the field that holds each. Reported on the Methodology screen like the conditions. */
export const RESULT_FIELDS = {
  ignition: "ignited",
  outcome: "outcome",
  burnTime: "burnTimeS",
} as const satisfies Record<string, keyof TestRecord>;

export type Result = keyof typeof RESULT_FIELDS;

export interface ConditionReporting {
  /** Individual tests. */
  tests: number;
  /** For each condition: tests that report it, and how many of those values came from a document, not the table. */
  conditions: Record<Condition, { reported: number; fromDocuments: number }>;
}

function reportingOf<Name extends string>(
  tests: readonly TestRecord[],
  fields: Record<Name, keyof TestRecord>,
): Record<Name, { reported: number; fromDocuments: number }> {
  const out = {} as Record<Name, { reported: number; fromDocuments: number }>;
  for (const [name, field] of Object.entries(fields) as [Name, keyof TestRecord][]) {
    const reported = tests.filter((row) => row[field] !== null);
    out[name] = {
      reported: reported.length,
      fromDocuments: reported.filter((row) => row.inferred.includes(field)).length,
    };
  }
  return out;
}

/** How complete the conditions of the individual tests are, and where the values came from. */
export function conditionReporting(rows: readonly TestRecord[]): ConditionReporting {
  const tests = rows.filter(isTestRow);
  return { tests: tests.length, conditions: reportingOf(tests, CONDITION_FIELDS) };
}

/** The same account for what happened in a test: ignition, outcome and burn time. */
export function resultReporting(rows: readonly TestRecord[]): Record<Result, { reported: number; fromDocuments: number }> {
  return reportingOf(rows.filter(isTestRow), RESULT_FIELDS);
}

/** True when the row's notes quote what a language model read from an operator's free-text note. */
export function hasSiReading(row: Pick<TestRecord, "notes">): boolean {
  return row.notes !== null && row.notes.includes(SI_NOTE_MARKER);
}

/** Individual tests with at least one value read by a language model from an operator's note. */
export function countSiReadTests(rows: readonly TestRecord[]): number {
  return rows.filter((row) => isTestRow(row) && hasSiReading(row)).length;
}
