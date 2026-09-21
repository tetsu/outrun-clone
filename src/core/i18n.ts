import en from "../data/strings/en.json";
import ja from "../data/strings/ja.json";
import type { LanguageSetting } from "./settings";

export type StringKey = keyof typeof en;
export type Language = "en" | "ja";

const TABLES: Record<Language, Record<StringKey, string>> = { en, ja };

let current: Language = "en";

export function resolveLanguage(setting: LanguageSetting): Language {
  if (setting !== "auto") return setting;
  return navigator.language.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function setLanguage(setting: LanguageSetting): void {
  current = resolveLanguage(setting);
  document.documentElement.lang = current;
}

export function t(key: StringKey): string {
  return TABLES[current][key] ?? en[key];
}
