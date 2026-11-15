import type { Granularity, TestRecord } from "@/generated/contract";

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

export interface ConditionReporting {
  /** Individual tests. */
  tests: number;
  /** For each condition: tests that report it, and how many of those values came from a document, not the table. */
  conditions: Record<Condition, { reported: number; fromDocuments: number }>;
}

/** How complete the conditions of the individual tests are, and where the values came from. */
export function conditionReporting(rows: readonly TestRecord[]): ConditionReporting {
  const tests = rows.filter(isTestRow);
  const conditions = {} as ConditionReporting["conditions"];
  for (const [name, field] of Object.entries(CONDITION_FIELDS) as [Condition, keyof TestRecord][]) {
    const reported = tests.filter((row) => row[field] !== null);
    conditions[name] = {
      reported: reported.length,
      fromDocuments: reported.filter((row) => row.inferred.includes(field)).length,
    };
  }
  return { tests: tests.length, conditions };
}
