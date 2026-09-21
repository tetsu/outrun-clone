import { DEFAULT_VIEW, view, type ViewTuning } from "../game/camera";
import { DEFAULT_HANDLING, handling, type HandlingTuning } from "../sim/player";
import { course, DEFAULT_COURSE, type CourseTuning } from "../sim/track";

/** Every live tunable, grouped as the tuning panel shows them. */
export interface TuningValues {
  view: ViewTuning;
  course: CourseTuning;
  handling: HandlingTuning;
}

export interface PartialTuning {
  view?: Partial<ViewTuning>;
  course?: Partial<CourseTuning>;
  handling?: Partial<HandlingTuning>;
}

/** The live values (the objects the game reads every step). */
export function currentTuning(): TuningValues {
  return { view, course, handling };
}

/** Sets the given values on the live objects; unknown keys are ignored. */
export function applyTuning(values: PartialTuning): void {
  const live = currentTuning();
  for (const group of ["view", "course", "handling"] as const) {
    const target = live[group] as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(values[group] ?? {})) {
      if (key in target && typeof value === typeof target[key]) target[key] = value;
    }
  }
}

/** Puts every value back to what the code ships with. */
export function resetTuning(): void {
  Object.assign(view, DEFAULT_VIEW);
  Object.assign(course, DEFAULT_COURSE);
  Object.assign(handling, DEFAULT_HANDLING);
}

/** Only the values that differ from the code's defaults, for copying into the code. */
export function changedTuning(): PartialTuning {
  const defaults: TuningValues = { view: { ...DEFAULT_VIEW }, course: { ...DEFAULT_COURSE }, handling: { ...DEFAULT_HANDLING } };
  const live = currentTuning();
  const out: Record<string, Record<string, unknown>> = {};
  for (const group of ["view", "course", "handling"] as const) {
    const now = live[group] as unknown as Record<string, unknown>;
    const was = defaults[group] as unknown as Record<string, unknown>;
    for (const key of Object.keys(was)) {
      if (now[key] !== was[key]) (out[group] ??= {})[key] = now[key];
    }
  }
  return out as PartialTuning;
}
