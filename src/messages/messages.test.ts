import { describe, expect, it } from "vitest";
import { LANGUAGES, placeholders } from "@/lib/i18n";
import { MESSAGES } from ".";
import { en } from "./en";

/** Every message as [path, text]. */
function walk(node: unknown, path: string[] = []): [string, string][] {
  if (typeof node === "string") return [[path.join("."), node]];
  if (node && typeof node === "object") return Object.entries(node).flatMap(([k, v]) => walk(v, [...path, k]));
  return [];
}

const english = new Map(walk(en));

describe("message files", () => {
  for (const language of LANGUAGES) {
    const messages = new Map(walk(MESSAGES[language]));

    it(`${language}: has every English message and nothing else`, () => {
      expect([...english.keys()].filter((k) => !messages.has(k))).toEqual([]);
      expect([...messages.keys()].filter((k) => !english.has(k))).toEqual([]);
    });

    it(`${language}: keeps the same placeholders in every message, and leaves none empty`, () => {
      const wrong = [...english].filter(([k, text]) => {
        const other = messages.get(k) ?? "";
        return other.trim() === "" || placeholders(other).join() !== placeholders(text).join();
      });
      expect(wrong.map(([k]) => k)).toEqual([]);
    });
  }

  it("has no em dash anywhere", () => {
    for (const language of LANGUAGES) expect(walk(MESSAGES[language]).filter(([, text]) => text.includes(String.fromCharCode(0x2014)))).toEqual([]);
  });
});
