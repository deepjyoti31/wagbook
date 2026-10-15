"use client";

import { useEffect } from "react";

/**
 * Tells the browser (and screen readers, and the error page) which language
 * the page is in. The root layout's <html lang> is drawn before the language
 * is known, so the suspended part of a page sets it here.
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
