import { describe, expect, it } from "vitest";
import { fill, formatLocale, isLanguage, pickLanguage, placeholders, plural } from "./i18n";

describe("languages", () => {
  it("fills placeholders and leaves an unknown one showing", () => {
    expect(fill("Hi {name}, {pet} is in.", { name: "Priya", pet: "Biscuit" })).toBe("Hi Priya, Biscuit is in.");
    expect(fill("{n} of {total}", { n: 3, total: 12 })).toBe("3 of 12");
    expect(fill("Hi {name}")).toBe("Hi {name}");
  });

  it("picks one or other by each language's own rule", () => {
    const forms = { one: "{n} night", other: "{n} nights" };
    expect(plural("en", 1, forms)).toBe("1 night");
    expect(plural("en", 0, forms)).toBe("0 nights");
    expect(plural("en", 3, forms)).toBe("3 nights");
    // In Hindi and Kannada, 0 and 1 both take the singular.
    expect(plural("hi", 0, { one: "{n} रात", other: "{n} रातें" })).toBe("0 रात");
    expect(plural("kn", 1, { one: "{n} ರಾತ್ರಿ", other: "{n} ರಾತ್ರಿಗಳು" })).toBe("1 ರಾತ್ರಿ");
    expect(plural("kn", 2, { one: "{n} ರಾತ್ರಿ", other: "{n} ರಾತ್ರಿಗಳು" })).toBe("2 ರಾತ್ರಿಗಳು");
  });

  it("formats in the person's language and the kennel's region", () => {
    expect(formatLocale("hi", "en-IN")).toBe("hi-IN");
    expect(formatLocale("en", "en-IN")).toBe("en-IN");
    expect(formatLocale("kn", "en")).toBe("kn");
  });

  it("chooses a language from the browser, falling back to English", () => {
    expect(pickLanguage("hi-IN,hi;q=0.9,en;q=0.8")).toBe("hi");
    expect(pickLanguage("fr-FR,kn;q=0.5,en;q=0.4")).toBe("kn");
    expect(pickLanguage("en-GB,hi;q=0")).toBe("en");
    expect(pickLanguage("de")).toBe("en");
    expect(pickLanguage(null)).toBe("en");
  });

  it("knows its languages and lists placeholders", () => {
    expect(isLanguage("kn")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(placeholders("{b} and {a} and {b}")).toEqual(["a", "b"]);
  });
});

describe("messages with values in bold or links", () => {
  it("cuts a message at its placeholders", async () => {
    const { splitMessage } = await import("./i18n");
    expect(splitMessage("{n} in house of {k} kennels.")).toEqual([{ key: "n" }, " in house of ", { key: "k" }, " kennels."]);
    expect(splitMessage("No values")).toEqual(["No values"]);
  });
});
