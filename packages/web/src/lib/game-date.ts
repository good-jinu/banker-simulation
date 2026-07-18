import type { Locale } from "../i18n/locale.ts";

/** Render an absolute in-game day as a calendar date, timezone-safe. */
export function formatGameDate(
  startDate: string,
  day: number,
  locale: Locale,
): string {
  const date = new Date(
    Date.parse(`${startDate}T00:00:00Z`) + day * 86_400_000,
  );
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
