"use client";

import { useId } from "react";
import {
  INPUT_CLASS,
  NumberField,
  parseDecimal,
  useNumberDraft,
  withinLimits,
} from "@/components/number-field";
import { GRAVITY_SHORTCUTS, SCENARIO_LIMITS } from "@/domain/config";
import { formatNumber, kpaToPsi } from "@/domain/format";
import { type ScenarioInput, scenarioInputFromPreset } from "@/domain/types";
import { FUEL_STATES, type FuelState, PILLARS as PILLAR_IDS, type Pillar, type Scenario } from "@/generated/contract";
import { PILLARS } from "@/lib/pillars";
import { FUEL_STATE_LABELS } from "./labels";

const CHIP_CLASS =
  "rounded-md border px-2.5 py-1 text-sm font-medium transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent";
const CHIP_ON = "border-accent bg-accent text-accent-fg";
const CHIP_OFF = "border-line-strong text-fg-muted hover:bg-surface-muted hover:text-fg";

function PresetNote({ preset }: { preset: Scenario | undefined }) {
  if (!preset) {
    return (
      <p className="text-sm text-fg-muted">
        <span className="font-medium text-fg">Custom environment.</span> The values above do not match any preset.
        The address of this page keeps them, so the link can be shared.
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm text-fg-muted">
      <p>
        <span className="font-medium text-fg">{preset.name}.</span> {preset.description}
      </p>
      {preset.assumptions.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-fg-subtle hover:text-fg">
            {preset.assumptions.length} assumption{preset.assumptions.length === 1 ? "" : "s"} in this preset
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {preset.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {preset.sources.length > 0 ? (
        <p className="text-xs text-fg-subtle">
          Source:{" "}
          {preset.sources.map((source, index) => (
            <span key={`${source.url}-${index}`}>
              {index > 0 ? "; " : null}
              <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-fg">
                {source.label}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

function AirflowField({
  min,
  max,
  fallback,
  onChange,
}: {
  min: number | null;
  max: number | null;
  /** Range restored when "no forced airflow" is switched off. */
  fallback: { min: number; max: number };
  onChange: (min: number | null, max: number | null) => void;
}) {
  const id = useId();
  const limits = SCENARIO_LIMITS.flowCmS;
  const none = min === null || max === null;
  const [minDraft, setMinDraft] = useNumberDraft(min);
  const [maxDraft, setMaxDraft] = useNumberDraft(max);

  const from = parseDecimal(minDraft);
  const to = parseDecimal(maxDraft);
  const numbersValid = withinLimits(from, limits) && withinLimits(to, limits);
  const orderValid = !numbersValid || from <= to;
  const valid = none || (numbersValid && orderValid);

  function commit(minText: string, maxText: string) {
    const nextMin = parseDecimal(minText);
    const nextMax = parseDecimal(maxText);
    if (!withinLimits(nextMin, limits) || !withinLimits(nextMax, limits) || nextMin > nextMax) return;
    if (nextMin !== min || nextMax !== max) onChange(nextMin, nextMax);
  }

  return (
    <fieldset>
      <legend className="text-sm font-medium text-fg">Airflow speed</legend>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <label htmlFor={`${id}-min`} className="sr-only">
          Airflow from, cm/s
        </label>
        <input
          id={`${id}-min`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={none}
          value={minDraft}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(event) => {
            setMinDraft(event.target.value);
            commit(event.target.value, maxDraft);
          }}
          className={INPUT_CLASS}
        />
        <span className="text-sm text-fg-muted">to</span>
        <label htmlFor={`${id}-max`} className="sr-only">
          Airflow to, cm/s
        </label>
        <input
          id={`${id}-max`}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          disabled={none}
          value={maxDraft}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-error`}
          onChange={(event) => {
            setMaxDraft(event.target.value);
            commit(minDraft, event.target.value);
          }}
          className={INPUT_CLASS}
        />
        <span className="text-sm text-fg-muted">cm/s</span>
      </div>
      {valid ? null : (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-warn-fg">
          {numbersValid
            ? "The first value must not be larger than the second."
            : `Enter two numbers from ${limits.min} to ${limits.max}.`}
        </p>
      )}
      <label className="mt-2 flex items-center gap-2 text-sm text-fg-muted">
        <input
          type="checkbox"
          checked={none}
          onChange={(event) => (event.target.checked ? onChange(null, null) : onChange(fallback.min, fallback.max))}
          className="h-4 w-4 accent-accent"
        />
        No forced airflow
      </label>
    </fieldset>
  );
}

export function ScenarioForm({
  scenario,
  presets,
  activePreset,
  onChange,
}: {
  scenario: ScenarioInput;
  presets: readonly Scenario[];
  /** The preset whose values equal the environment's, if any. */
  activePreset: Scenario | undefined;
  onChange: (next: ScenarioInput) => void;
}) {
  const focusId = useId();
  const withFlow = presets.find((preset) => preset.flowCmSMin !== null && preset.flowCmSMax !== null);
  const fallbackFlow = {
    min: withFlow?.flowCmSMin ?? SCENARIO_LIMITS.flowCmS.min,
    max: withFlow?.flowCmSMax ?? SCENARIO_LIMITS.flowCmS.min,
  };

  function toggleFuel(state: FuelState, checked: boolean) {
    const next = checked
      ? FUEL_STATES.filter((item) => item === state || scenario.fuelStates.includes(item))
      : scenario.fuelStates.filter((item) => item !== state);
    // At least one fuel state stays selected: an empty choice cannot be kept in the address.
    if (next.length > 0) onChange({ ...scenario, fuelStates: next });
  }

  return (
    <form
      aria-label="Environment"
      onSubmit={(event) => event.preventDefault()}
      className="space-y-5 rounded-lg border border-line bg-surface p-4"
    >
      <fieldset>
        <legend className="text-sm font-semibold text-fg">Environment</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((preset) => {
            const active = preset.id === activePreset?.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(scenarioInputFromPreset(preset))}
                className={`${CHIP_CLASS} ${active ? CHIP_ON : CHIP_OFF}`}
              >
                {preset.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <NumberField
          label="Oxygen"
          value={scenario.o2Pct}
          limits={SCENARIO_LIMITS.o2Pct}
          unit="% by volume"
          onCommit={(o2Pct) => onChange({ ...scenario, o2Pct })}
        />
        <NumberField
          label="Pressure"
          value={scenario.pressureKpa}
          limits={SCENARIO_LIMITS.pressureKpa}
          unit="kPa"
          aside={`= ${formatNumber(kpaToPsi(scenario.pressureKpa), 1)} psi`}
          onCommit={(pressureKpa) => onChange({ ...scenario, pressureKpa })}
        />
      </div>

      <div>
        <NumberField
          label="Gravity"
          value={scenario.gravityG}
          limits={SCENARIO_LIMITS.gravityG}
          unit="g"
          onCommit={(gravityG) => onChange({ ...scenario, gravityG })}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {GRAVITY_SHORTCUTS.map((shortcut) => {
            const active = shortcut.gravityG === scenario.gravityG;
            return (
              <button
                key={shortcut.label}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ ...scenario, gravityG: shortcut.gravityG })}
                className={`${CHIP_CLASS} px-2 py-0.5 text-xs ${active ? CHIP_ON : CHIP_OFF}`}
              >
                {shortcut.label} {formatNumber(shortcut.gravityG, 3)} g
              </button>
            );
          })}
        </div>
      </div>

      <AirflowField
        min={scenario.flowCmSMin}
        max={scenario.flowCmSMax}
        fallback={fallbackFlow}
        onChange={(flowCmSMin, flowCmSMax) => onChange({ ...scenario, flowCmSMin, flowCmSMax })}
      />

      <fieldset>
        <legend className="text-sm font-medium text-fg">Fuel state</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {FUEL_STATES.map((state) => (
            <label key={state} className="flex items-center gap-2 text-sm text-fg-muted">
              <input
                type="checkbox"
                checked={scenario.fuelStates.includes(state)}
                onChange={(event) => toggleFuel(state, event.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              {FUEL_STATE_LABELS[state]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={focusId} className="block text-sm font-medium text-fg">
          Fire-safety focus
        </label>
        <select
          id={focusId}
          value={scenario.focus}
          onChange={(event) => onChange({ ...scenario, focus: event.target.value as Pillar | "all" })}
          className="mt-1 w-full rounded-md border border-line-strong bg-bg px-2 py-1 text-sm text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        >
          <option value="all">All pillars</option>
          {PILLAR_IDS.map((pillar) => (
            <option key={pillar} value={pillar}>
              {PILLARS[pillar].label}: {PILLARS[pillar].description.toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {/*
        The note about the preset sits last, so the fields above never move when its length
        changes, and no empty space is kept for a longer note.
      */}
      <div className="border-t border-line pt-4" aria-live="polite">
        <PresetNote preset={activePreset} />
      </div>
    </form>
  );
}
