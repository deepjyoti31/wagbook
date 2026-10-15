import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { MESSAGES } from "@/messages";
import { requireOrg } from "./auth";
import { formatLocale, isLanguage, pickLanguage, type Language } from "./i18n";

/**
 * Which language a page speaks (decision D21):
 *   signed-in screens  the person's own choice (memberships.language)
 *   pages for parents  the kennel's choice (organizations.parent_language),
 *                      read from what the public function returns
 *   everything else    the last language this browser chose, else the
 *                      browser's Accept-Language, else English
 */

/** Remembers a person's language on this browser, for the sign-in page and the like. */
export const LANGUAGE_COOKIE = "wb_lang";

export function i18nFor(language: Language, kennelLocale = "en-IN") {
  return { language, m: MESSAGES[language], locale: formatLocale(language, kennelLocale) };
}
export type I18n = ReturnType<typeof i18nFor>;

/** For screens under /app. */
export const getAppI18n = cache(async (): Promise<I18n> => {
  const { language, org } = await requireOrg();
  return i18nFor(language, org.locale);
});

/** For pages a person sees before or without a kennel: sign in, sign up, onboarding, joining. */
export const getVisitorI18n = cache(async (): Promise<I18n> => {
  const chosen = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  if (isLanguage(chosen)) return i18nFor(chosen);
  return i18nFor(pickLanguage((await headers()).get("accept-language")));
});

/** For a page for parents: the language the kennel set, as its public function returned it. */
export function parentI18n(language: unknown, kennelLocale?: string | null): I18n {
  return i18nFor(isLanguage(language) ? language : "en", kennelLocale ?? "en-IN");
}

/** A signed-in page's tab title in the reader's language, for generateMetadata. */
export async function appTitle(pick: (m: I18n["m"]) => string): Promise<{ title: string }> {
  return { title: pick((await getAppI18n()).m) };
}
