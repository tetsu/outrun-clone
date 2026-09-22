import type { SaveStorage } from "./storage";

export type LanguageSetting = "auto" | "en" | "ja";

export interface Settings {
  language: LanguageSetting;
  /** 0 follows the display's refresh rate. */
  fpsCap: 0 | 30 | 60 | 120;
  /** Internal render resolution as a fraction of the native pixel size. */
  resolutionScale: 1 | 0.75 | 0.5;
  /** Sound levels, 0..1: everything, then the music and the effects (engine included) under it. */
  masterVolume: number;
  musicVolume: number;
  effectsVolume: number;
  /** All sound off, without losing the levels (the M key). */
  muted: boolean;
}

export const DEFAULT_SETTINGS: Settings = { language: "auto", fpsCap: 0, resolutionScale: 1, masterVolume: 1, musicVolume: 0.7, effectsVolume: 0.8, muted: false };

export function loadSettings(storage: SaveStorage): Settings {
  return { ...DEFAULT_SETTINGS, ...storage.read<Partial<Settings>>("settings", {}) };
}

export function saveSettings(storage: SaveStorage, settings: Settings): void {
  storage.write("settings", settings);
}
