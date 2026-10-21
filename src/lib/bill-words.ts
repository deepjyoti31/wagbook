import { isLanguage } from "./i18n";
import { MESSAGES, type Messages } from "@/messages";

/**
 * The words of a bill. A bill is in English. When the parent asked for their
 * language (clients.bill_translation), each heading of it is followed by the
 * translation in brackets: "Tax invoice (टैक्स इनवॉइस)". Lines with values in
 * them, such as "Paid {amount}", stay in English only, so no amount is
 * printed twice.
 */
export function billWords(translation: unknown): Messages {
  const en = MESSAGES.en;
  if (!isLanguage(translation) || translation === "en") return en;
  const other = MESSAGES[translation];
  const both = (english: string, translated: string) => (english.includes("{") || english === translated ? english : `${english} (${translated})`);
  const invoice = Object.fromEntries(
    Object.entries(en.invoice).map(([key, english]) => [key, both(english, other.invoice[key as keyof Messages["invoice"]])]),
  ) as Messages["invoice"];
  return { ...en, invoice, common: { ...en.common, print: both(en.common.print, other.common.print) } };
}
