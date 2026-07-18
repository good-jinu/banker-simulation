import type { Locale } from "../locale.ts";
import { en, type Messages } from "./en.ts";
import { ko } from "./ko.ts";

const catalogs: Record<Locale, Messages> = { en, ko };

export type { Messages };

export function messagesFor(locale: Locale): Messages {
  return catalogs[locale];
}
