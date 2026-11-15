import { SiBadge } from "@/components/si-badge";
import { formatBoolean, formatGranularity, formatTableName, formatValue } from "@/domain/format";
import { hasSiReading } from "@/domain/rows";
import type { TestRecord } from "@/generated/contract";

/**
 * Where a table row came from (architecture rule AD-8): the source file and row number,
 * every original column unchanged, which normalized fields were not read directly from a
 * column, the notes that quote the NASA document such a value came from, and the confidence.
 *
 * `wide` lays the facts and the original columns side by side, for a row opened in the Tests table.
 */
export function RowDetails({ row, wide = false }: { row: TestRecord; wide?: boolean }) {
  const columns = Object.entries(row.raw);
  return (
    <div className={`grid gap-4 text-xs text-fg-muted ${wide ? "lg:grid-cols-2" : ""}`}>
      <div className="space-y-2">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-fg-subtle">File</dt>
          <dd className="break-all font-mono text-fg">{row.tableFile}</dd>
          <dt className="text-fg-subtle">Row in file</dt>
          <dd className="text-fg">
            {row.sourceRow} ({formatGranularity(row.granularity)})
          </dd>
          <dt className="text-fg-subtle">Confidence</dt>
          <dd className="text-fg">
            {row.confidence}, mapping version {row.mappingVersion}
          </dd>
          <dt className="text-fg-subtle">Ignited</dt>
          <dd className="text-fg">{formatBoolean(row.ignited)}</dd>
          <dt className="text-fg-subtle">Burn time</dt>
          <dd className="text-fg">{formatValue(row.burnTimeS, "s")}</dd>
          <dt className="text-fg-subtle">Not from a column</dt>
          <dd className="text-fg">
            {row.inferred.length > 0 ? row.inferred.join(", ") : "every value was read directly from a table column"}
          </dd>
        </dl>
        {row.notes ? (
          <p className="leading-relaxed">
            {hasSiReading(row) ? (
              <>
                <SiBadge title="A language model read a value of this row from an operator's note; the words it relied on are quoted here and were checked by code against the note" />{" "}
              </>
            ) : null}
            <span className="font-medium text-fg">Notes.</span> {row.notes}
          </p>
        ) : null}
      </div>
      {columns.length > 0 ? (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full text-left">
            <caption className="pb-1 text-left font-medium text-fg">Original columns, unchanged</caption>
            <tbody className="divide-y divide-line">
              {columns.map(([name, value]) => (
                <tr key={name} className="align-top">
                  <th scope="row" className="py-1 pr-3 font-normal text-fg-subtle">
                    {name}
                  </th>
                  <td className="break-words py-1 font-mono text-fg">{value === "" ? "(empty)" : value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

/** The same, folded under a one-line summary, for a row shown inside another card. */
export function RowSource({ row }: { row: TestRecord }) {
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-fg-subtle hover:text-fg">
        Source: {formatTableName(row.tableFile)}, row {row.sourceRow}
      </summary>
      <div className="mt-2 rounded-md border border-line bg-surface-muted p-3">
        <RowDetails row={row} />
      </div>
    </details>
  );
}
