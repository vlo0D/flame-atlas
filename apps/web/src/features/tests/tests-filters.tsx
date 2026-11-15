"use client";

import { useId } from "react";
import { INPUT_BASE, parseDecimal, useNumberDraft } from "@/components/number-field";
import { NO_FILTERS, hasActiveFilters } from "@/domain/filters";
import { formatGranularity, formatInterval } from "@/domain/format";
import type { Interval } from "@/domain/num";
import type { TestFilters } from "@/domain/types";
import { FUEL_STATES, GRANULARITIES, OUTCOMES } from "@/generated/contract";
import { investigations } from "@/lib/data";

function toggle<T>(list: readonly T[], item: T, order: readonly T[]): T[] {
  const next = list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
  return order.filter((value) => next.includes(value));
}

function CheckGroup<T extends string>({
  legend,
  options,
  selected,
  label,
  onChange,
}: {
  legend: string;
  options: readonly T[];
  selected: readonly T[];
  label: (option: T) => string;
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg">{legend}</legend>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={() => onChange(toggle(selected, option, options))}
              className="h-4 w-4 accent-accent"
            />
            {label(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Two optional bounds. An empty box leaves that side open; both empty removes the filter. */
function RangeFilter({
  legend,
  unit,
  interval,
  onChange,
}: {
  legend: string;
  unit: string;
  interval: Interval | null;
  onChange: (next: Interval | null) => void;
}) {
  const id = useId();
  const lo = interval && Number.isFinite(interval.lo) ? interval.lo : null;
  const hi = interval && Number.isFinite(interval.hi) ? interval.hi : null;
  const [loDraft, setLoDraft] = useNumberDraft(lo);
  const [hiDraft, setHiDraft] = useNumberDraft(hi);

  const read = (text: string): number | null | undefined => {
    if (text.trim() === "") return null;
    return parseDecimal(text) ?? undefined;
  };
  const from = read(loDraft);
  const to = read(hiDraft);
  const valid = from !== undefined && to !== undefined && (from === null || to === null || from <= to);

  function commit(loText: string, hiText: string) {
    const nextLo = read(loText);
    const nextHi = read(hiText);
    if (nextLo === undefined || nextHi === undefined) return;
    if (nextLo !== null && nextHi !== null && nextLo > nextHi) return;
    if (nextLo === lo && nextHi === hi) return;
    onChange(nextLo === null && nextHi === null ? null : { lo: nextLo ?? -Infinity, hi: nextHi ?? Infinity, closed: "both" });
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg">{legend}</legend>
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2">
        <label htmlFor={`${id}-lo`} className="sr-only">
          {legend} from, {unit}
        </label>
        <input
          id={`${id}-lo`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="from"
          value={loDraft}
          aria-invalid={!valid}
          onChange={(event) => {
            setLoDraft(event.target.value);
            commit(event.target.value, hiDraft);
          }}
          className={`${INPUT_BASE} w-full`}
        />
        <span className="text-sm text-fg-muted">to</span>
        <label htmlFor={`${id}-hi`} className="sr-only">
          {legend} to, {unit}
        </label>
        <input
          id={`${id}-hi`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="to"
          value={hiDraft}
          aria-invalid={!valid}
          onChange={(event) => {
            setHiDraft(event.target.value);
            commit(loDraft, event.target.value);
          }}
          className={`${INPUT_BASE} w-full`}
        />
        <span className="w-9 text-sm text-fg-muted">{unit}</span>
      </div>
      {valid ? (
        interval && interval.closed !== "both" ? (
          <p className="mt-1 text-xs text-fg-subtle">Showing {formatInterval(interval, unit)}.</p>
        ) : null
      ) : (
        <p role="alert" className="mt-1 text-xs text-warn-fg">
          Enter numbers, the first not larger than the second.
        </p>
      )}
    </fieldset>
  );
}

export function TestsFilters({ filters, onChange }: { filters: TestFilters; onChange: (next: TestFilters) => void }) {
  const chosen = filters.investigationIds.length;
  return (
    <form
      aria-label="Filters"
      onSubmit={(event) => event.preventDefault()}
      className="space-y-4 rounded-lg border border-line bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg">Filters</h2>
        <button
          type="button"
          disabled={!hasActiveFilters(filters)}
          onClick={() => onChange(NO_FILTERS)}
          className="text-sm text-fg-muted underline underline-offset-2 hover:text-fg disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
        >
          Reset
        </button>
      </div>

      <details open={chosen > 0}>
        <summary className="cursor-pointer text-sm font-medium text-fg">
          Investigation{chosen > 0 ? ` (${chosen} chosen)` : " (all)"}
        </summary>
        <div className="mt-2 grid max-h-52 gap-y-1 overflow-y-auto pr-1">
          {investigations.map((investigation) => (
            <label key={investigation.id} className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={filters.investigationIds.includes(investigation.id)}
                onChange={() =>
                  onChange({
                    ...filters,
                    investigationIds: toggle(
                      filters.investigationIds,
                      investigation.id,
                      investigations.map((item) => item.id),
                    ),
                  })
                }
                className="h-4 w-4 accent-accent"
              />
              {investigation.acronym ?? investigation.id}
            </label>
          ))}
        </div>
      </details>

      <CheckGroup
        legend="Fuel state"
        options={FUEL_STATES}
        selected={filters.fuelStates}
        label={(state) => state}
        onChange={(fuelStates) => onChange({ ...filters, fuelStates })}
      />

      <RangeFilter legend="Oxygen" unit="%" interval={filters.o2Pct} onChange={(o2Pct) => onChange({ ...filters, o2Pct })} />
      <RangeFilter
        legend="Pressure"
        unit="kPa"
        interval={filters.pressureKpa}
        onChange={(pressureKpa) => onChange({ ...filters, pressureKpa })}
      />
      <RangeFilter
        legend="Airflow speed"
        unit="cm/s"
        interval={filters.flowCmS}
        onChange={(flowCmS) => onChange({ ...filters, flowCmS })}
      />

      <CheckGroup
        legend="Row type"
        options={GRANULARITIES}
        selected={filters.granularities}
        label={(granularity) => formatGranularity(granularity)}
        onChange={(granularities) => onChange({ ...filters, granularities })}
      />
      <CheckGroup
        legend="Outcome"
        options={OUTCOMES}
        selected={filters.outcomes}
        label={(outcome) => outcome}
        onChange={(outcomes) => onChange({ ...filters, outcomes })}
      />

      <label className="flex items-start gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={filters.includeNotReported}
          onChange={(event) => onChange({ ...filters, includeNotReported: event.target.checked })}
          className="mt-0.5 h-4 w-4 accent-accent"
        />
        <span>Include rows that do not report a filtered value</span>
      </label>
    </form>
  );
}
