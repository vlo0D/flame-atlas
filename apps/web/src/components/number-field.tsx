"use client";

import { type ReactNode, useId, useState } from "react";

export interface Limits {
  min: number;
  max: number;
}

/** Reads "34", "34.5" or "34,5". Anything else is not a number. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function withinLimits(value: number | null, limits: Limits): value is number {
  return value !== null && value >= limits.min && value <= limits.max;
}

/**
 * Text of a number input while it is being typed.
 *
 * The committed value lives outside (in the address); the text here may be
 * unfinished or invalid for a moment. When the committed value changes from
 * elsewhere, for example a preset button, the text follows it.
 */
export function useNumberDraft(value: number | null): [string, (text: string) => void] {
  const [draft, setDraft] = useState(() => (value === null ? "" : String(value)));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (parseDecimal(draft) !== value) setDraft(value === null ? "" : String(value));
  }
  return [draft, setDraft];
}

/** Look of a number box without a width, for boxes that size themselves to their place. */
export const INPUT_BASE =
  "rounded-md border border-line-strong bg-bg px-2 py-1 text-sm tabular-nums text-fg " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-warn-fg";

export const INPUT_CLASS = `w-24 ${INPUT_BASE}`;

export function NumberField({
  label,
  value,
  limits,
  unit,
  aside,
  onCommit,
}: {
  label: string;
  value: number;
  limits: Limits;
  unit?: string;
  /** Extra text after the unit, e.g. the same pressure in psi. */
  aside?: ReactNode;
  /** Called with every valid number as it is typed. */
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useNumberDraft(value);
  const valid = withinLimits(parseDecimal(draft), limits);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={draft}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(event) => {
            const text = event.target.value;
            setDraft(text);
            const next = parseDecimal(text);
            if (withinLimits(next, limits) && next !== value) onCommit(next);
          }}
          className={INPUT_CLASS}
        />
        {unit ? <span className="text-sm text-fg-muted">{unit}</span> : null}
        {aside ? <span className="text-sm text-fg-subtle">{aside}</span> : null}
      </div>
      {valid ? null : (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-warn-fg">
          Enter a number from {limits.min} to {limits.max}.
        </p>
      )}
    </div>
  );
}
