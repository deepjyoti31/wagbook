/**
 * Languages, the plain way (decision D21).
 *
 * Every word on screen lives in a message file: src/messages/en.ts is the
 * source, hi.ts and kn.ts have exactly the same shape (TypeScript checks it).
 * A message is a plain string. Values go in with {name} placeholders, filled
 * by fill(). Counts that change the words use a { one, other } pair, picked
 * by plural(). No library: this file is the whole mechanism.
 *
 * Pure and safe in the browser. The server picks the language: a signed-in
 * person's own choice (memberships.language), or the kennel's parent
 * language on pages for parents (src/lib/i18n-server.ts).
 */

export const LANGUAGES = ["en", "hi", "kn"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Each language named in itself, so a person can find their own. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी",
  kn: "ಕನ್ನಡ",
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
}

export type Vars = Record<string, string | number>;

/** "Hi {name}" with { name: "Priya" } is "Hi Priya". A placeholder with no value is left as it is, so a mistake shows. */
export function fill(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

export interface PluralForms {
  one: string;
  other: string;
}

/** The form for this count, filled, with {n} available as the count. */
export function plural(language: Language, n: number, forms: PluralForms, vars: Vars = {}): string {
  const rule = new Intl.PluralRules(language).select(n);
  return fill(rule === "one" ? forms.one : forms.other, { n, ...vars });
}

/**
 * The locale for dates and numbers: the person's language in the kennel's
 * region. A kennel set to en-IN read in Hindi formats as hi-IN.
 */
export function formatLocale(language: Language, kennelLocale: string): string {
  const region = /-([A-Z]{2})$/.exec(kennelLocale)?.[1];
  return region ? `${language}-${region}` : language;
}

/** The best language for a browser's Accept-Language header, or English. */
export function pickLanguage(acceptLanguage: string | null | undefined): Language {
  if (!acceptLanguage) return "en";
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())?.[1]).find(Boolean);
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q) };
    })
    .filter((w) => w.q > 0)
    .sort((a, b) => b.q - a.q);
  return wanted.find((w) => isLanguage(w.lang))?.lang as Language | undefined ?? "en";
}

/**
 * A message cut at its placeholders, for sentences that put a value in bold
 * or in a link: "{n} in house" becomes ["", {key: "n"}, " in house"].
 */
export function splitMessage(template: string): (string | { key: string })[] {
  return template.split(/(\{\w+\})/).filter((part) => part !== "").map((part) => (/^\{\w+\}$/.test(part) ? { key: part.slice(1, -1) } : part));
}

/** Every {placeholder} in a message, sorted. Used by the test that keeps translations in step. */
export function placeholders(message: string): string[] {
  return [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}
