/**
 * Turns a database error into a sentence a kennel worker can act on.
 *
 * The database raises its own errors with a code like "WB020: no space on
 * 2027-04-14". Those messages are already written for people, so we show
 * them with the code removed. Constraint violations are mapped by name.
 * Anything unrecognised becomes a generic message, and the real error is
 * logged on the server, never shown, because it can contain internals.
 *
 * The full list of WB codes lives in docs/reference/error-codes.md.
 */

import { fill, type Language } from "./i18n";
import { en, type Messages } from "@/messages/en";

export interface DbError {
  code?: string | null;
  message: string;
  details?: string | null;
}

type Words = { language: Language; m: Pick<Messages, "errors"> };
const ENGLISH: Words = { language: "en", m: en };

export const GENERIC_ERROR = en.errors.generic;

/**
 * A sentence for the person. In English the database's own WB sentence is
 * shown as written; in other languages the translation for its code, with any
 * values (a date, a count) carried across.
 */
export function friendlyError(error: DbError | null | undefined, words: Words = ENGLISH): string {
  const e = words.m.errors;
  if (!error) return e.generic;
  const wb = /(WB\d{3}):\s*(.+)/.exec(error.message);
  if (wb) {
    const [, code, text] = wb;
    const translated = (e.codes as Record<string, string>)[code];
    if (words.language === "en" || !translated) return text.trim().charAt(0).toUpperCase() + text.trim().slice(1);
    // WB020 says "no space on 2027-04-14 (3 booked, 2 kennels)": keep its numbers.
    const space = /on (\S+) \((\d+) booked, (\d+) kennels\)/.exec(text);
    return fill(translated, space ? { date: space[1], booked: space[2], kennels: space[3] } : {});
  }
  const haystack = `${error.message} ${error.details ?? ""}`;
  for (const [needle, message] of Object.entries(e.constraints)) if (haystack.includes(needle)) return message;
  const byCode: Record<string, string> = { "42501": e.permission, "23503": e.linked, "23502": e.missing, PGRST116: e.notFound };
  if (error.code && byCode[error.code]) return byCode[error.code];
  return e.generic;
}
