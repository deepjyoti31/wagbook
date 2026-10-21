import { describe, expect, it } from "vitest";
import { billWords } from "./bill-words";
import { en } from "@/messages/en";
import { hi } from "@/messages/hi";

describe("the words of a bill", () => {
  it("are English unless the parent asked for a translation", () => {
    expect(billWords(null)).toBe(en);
    expect(billWords("en")).toBe(en);
    expect(billWords("fr")).toBe(en);
  });

  it("put the translation in brackets after each heading, and leave lines with amounts in English", () => {
    const w = billWords("hi");
    expect(w.invoice.taxInvoice).toBe(`Tax invoice (${hi.invoice.taxInvoice})`);
    expect(w.invoice.placeOfSupply).toBe(`Place of supply (${hi.invoice.placeOfSupply})`);
    expect(w.invoice.paid).toBe(en.invoice.paid);
    expect(w.common.print).toBe(`${en.common.print} (${hi.common.print})`);
    // Everything else on the page stays in English.
    expect(w.labels).toBe(en.labels);
  });
});
