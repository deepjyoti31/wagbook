import type { Language } from "@/lib/i18n";
import { en, type Messages } from "./en";

/**
 * The message files by language. Imported by server code, which passes the
 * words a client component needs as props, so browsers never download the
 * whole dictionary.
 */
export const MESSAGES: Record<Language, Messages> = {
  en,
  hi: en,
  kn: en,
};

export type { Messages };
