import type { Locale } from "./locale.ts";

/** A UI string carried as data with one rendering per supported locale. */
export interface LocalText {
  en: string;
  ko: string;
}

export function localize(value: LocalText, locale: Locale): string {
  return value[locale];
}

export function playerLabel(locale: Locale): string {
  return locale === "ko" ? "플레이어" : "Player";
}
