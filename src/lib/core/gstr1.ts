import { GST_STATES } from "./gst";
import { toDecimalString, type Minor } from "./money";
import type { ISODate } from "./dates";

/**
 * A month's bills and credit notes laid out as the sheets of GSTR-1, the
 * monthly return of outward supplies, in the columns of the GST offline
 * tool's CSV files: b2b, b2cl, b2cs, cdnr, cdnur, hsn and docs. For a
 * GST-registered kennel to hand its accountant, or to load into the tool.
 *
 * The column names are the tool's own, in English, because the tool matches
 * them exactly. They were written from the tool's templates as we know them
 * (October 2026); check them against the tool before the first upload
 * (docs/06-billing-and-gst.md).
 *
 *   b2b    bills to a buyer with a GSTIN, one row per bill and rate
 *   b2cl   bills to a buyer without one, in another state, over ₹1 lakh
 *   b2cs   every other bill, added up by place of supply and rate, less
 *          the month's credit notes against such bills
 *   cdnr   credit notes on b2b bills
 *   cdnur  credit notes on b2cl bills
 *   hsn    value and tax by service code and rate, less credit notes
 *   docs   the numbers used: bills (with how many were cancelled) and credit notes
 */

/** Bills to an unregistered buyer in another state over this much are reported one by one (Rule 59(4), from 1 August 2024). */
export const B2CL_LIMIT_MINOR = 1_00_000_00;

export interface Gstr1Line {
  taxRateBp: number;
  sacCode: string | null;
  taxableMinor: Minor;
  igstMinor: Minor;
  cgstMinor: Minor;
  sgstMinor: Minor;
}

export interface Gstr1Bill {
  number: string;
  date: ISODate;
  /** Cancelled bills are only counted in docs. */
  cancelled: boolean;
  buyerName: string;
  buyerGstin: string | null;
  /** Two-digit GST state codes. */
  placeOfSupply: string;
  sellerState: string;
  totalMinor: Minor;
  lines: readonly Gstr1Line[];
}

export interface Gstr1Note {
  number: string;
  date: ISODate;
  totalMinor: Minor;
  lines: readonly Gstr1Line[];
  /** The bill it takes back from, which may be from an earlier month. */
  bill: Omit<Gstr1Bill, "lines" | "cancelled" | "date"> & { date: ISODate };
}

export type Gstr1Part = "b2b" | "b2cl" | "b2cs" | "cdnr" | "cdnur" | "hsn" | "docs";
export const GSTR1_PARTS: readonly Gstr1Part[] = ["b2b", "b2cl", "b2cs", "cdnr", "cdnur", "hsn", "docs"];

export interface Gstr1Sheet {
  header: string[];
  rows: (string | number)[][];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 14-Apr-2027, as the offline tool writes dates. */
export function gstDate(d: ISODate): string {
  return `${d.slice(8, 10)}-${MONTHS[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}`;
}

/** 29-Karnataka, as the offline tool writes a place of supply. */
export function placeOfSupply(code: string): string {
  return `${code}-${GST_STATES[code] ?? code}`;
}

const amount = (minor: Minor) => toDecimalString(minor);
const rate = (bp: number) => toDecimalString(bp).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");

type Kind = "b2b" | "b2cl" | "b2cs";
function kindOf(b: { buyerGstin: string | null; placeOfSupply: string; sellerState: string; totalMinor: Minor }): Kind {
  if (b.buyerGstin) return "b2b";
  return b.placeOfSupply !== b.sellerState && b.totalMinor > B2CL_LIMIT_MINOR ? "b2cl" : "b2cs";
}

/** Taxable value by rate, from some lines. */
function byRate(lines: readonly Gstr1Line[]): Map<number, Minor> {
  const out = new Map<number, Minor>();
  for (const l of lines) out.set(l.taxRateBp, (out.get(l.taxRateBp) ?? 0) + l.taxableMinor);
  return out;
}

/** The first and last number of a series, compared by the running number at the end. */
function span(numbers: readonly string[]): [string, string] | null {
  if (numbers.length === 0) return null;
  const seq = (n: string) => Number(n.split("/").pop());
  const sorted = [...numbers].sort((a, b) => seq(a) - seq(b));
  return [sorted[0], sorted[sorted.length - 1]];
}

/** One sheet of GSTR-1 for the bills and credit notes of a month. */
export function gstr1Sheet(part: Gstr1Part, bills: readonly Gstr1Bill[], notes: readonly Gstr1Note[]): Gstr1Sheet {
  const live = bills.filter((b) => !b.cancelled);
  switch (part) {
    case "b2b":
      return {
        header: ["GSTIN/UIN of Recipient", "Receiver Name", "Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Reverse Charge", "Applicable % of Tax Rate", "Invoice Type", "E-Commerce GSTIN", "Rate", "Taxable Value", "Cess Amount"],
        rows: live
          .filter((b) => kindOf(b) === "b2b")
          .flatMap((b) =>
            [...byRate(b.lines)].map(([r, taxable]) => [b.buyerGstin ?? "", b.buyerName, b.number, gstDate(b.date), amount(b.totalMinor), placeOfSupply(b.placeOfSupply), "N", "", "Regular B2B", "", rate(r), amount(taxable), "0.00"]),
          ),
      };
    case "b2cl":
      return {
        header: ["Invoice Number", "Invoice date", "Invoice Value", "Place Of Supply", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN"],
        rows: live
          .filter((b) => kindOf(b) === "b2cl")
          .flatMap((b) => [...byRate(b.lines)].map(([r, taxable]) => [b.number, gstDate(b.date), amount(b.totalMinor), placeOfSupply(b.placeOfSupply), "", rate(r), amount(taxable), "0.00", ""])),
      };
    case "b2cs": {
      const sums = new Map<string, Minor>();
      const add = (pos: string, r: number, minor: Minor) => sums.set(`${pos}|${r}`, (sums.get(`${pos}|${r}`) ?? 0) + minor);
      for (const b of live.filter((x) => kindOf(x) === "b2cs")) for (const [r, t] of byRate(b.lines)) add(b.placeOfSupply, r, t);
      for (const n of notes.filter((x) => kindOf(x.bill) === "b2cs")) for (const [r, t] of byRate(n.lines)) add(n.bill.placeOfSupply, r, -t);
      return {
        header: ["Type", "Place Of Supply", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount", "E-Commerce GSTIN"],
        rows: [...sums]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, taxable]) => {
            const [pos, r] = key.split("|");
            return ["OE", placeOfSupply(pos), "", rate(Number(r)), amount(taxable), "0.00", ""];
          }),
      };
    }
    case "cdnr":
      return {
        header: ["GSTIN/UIN of Recipient", "Receiver Name", "Note Number", "Note Date", "Note Type", "Place Of Supply", "Reverse Charge", "Note Supply Type", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
        rows: notes
          .filter((n) => kindOf(n.bill) === "b2b")
          .flatMap((n) =>
            [...byRate(n.lines)].map(([r, taxable]) => [n.bill.buyerGstin ?? "", n.bill.buyerName, n.number, gstDate(n.date), "C", placeOfSupply(n.bill.placeOfSupply), "N", "Regular B2B", amount(n.totalMinor), "", rate(r), amount(taxable), "0.00"]),
          ),
      };
    case "cdnur":
      return {
        header: ["UR Type", "Note Number", "Note Date", "Note Type", "Place Of Supply", "Note Value", "Applicable % of Tax Rate", "Rate", "Taxable Value", "Cess Amount"],
        rows: notes
          .filter((n) => kindOf(n.bill) === "b2cl")
          .flatMap((n) => [...byRate(n.lines)].map(([r, taxable]) => ["B2CL", n.number, gstDate(n.date), "C", placeOfSupply(n.bill.placeOfSupply), amount(n.totalMinor), "", rate(r), amount(taxable), "0.00"])),
      };
    case "hsn": {
      const sums = new Map<string, { taxable: Minor; igst: Minor; cgst: Minor; sgst: Minor }>();
      const add = (l: Gstr1Line, sign: 1 | -1) => {
        const key = `${l.sacCode ?? ""}|${l.taxRateBp}`;
        const s = sums.get(key) ?? { taxable: 0, igst: 0, cgst: 0, sgst: 0 };
        sums.set(key, { taxable: s.taxable + sign * l.taxableMinor, igst: s.igst + sign * l.igstMinor, cgst: s.cgst + sign * l.cgstMinor, sgst: s.sgst + sign * l.sgstMinor });
      };
      for (const b of live) for (const l of b.lines) add(l, 1);
      for (const n of notes) for (const l of n.lines) add(l, -1);
      return {
        header: ["HSN", "Description", "UQC", "Total Quantity", "Total Value", "Rate", "Taxable Value", "Integrated Tax Amount", "Central Tax Amount", "State/UT Tax Amount", "Cess Amount"],
        rows: [...sums]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, s]) => {
            const [sac, r] = key.split("|");
            return [sac, "", "NA", "0", amount(s.taxable + s.igst + s.cgst + s.sgst), rate(Number(r)), amount(s.taxable), amount(s.igst), amount(s.cgst), amount(s.sgst), "0.00"];
          }),
      };
    }
    case "docs": {
      const rows: (string | number)[][] = [];
      const billSpan = span(bills.map((b) => b.number));
      if (billSpan) rows.push(["Invoices for outward supply", billSpan[0], billSpan[1], bills.length, bills.filter((b) => b.cancelled).length]);
      const noteSpan = span(notes.map((n) => n.number));
      if (noteSpan) rows.push(["Credit Note", noteSpan[0], noteSpan[1], notes.length, 0]);
      return { header: ["Nature of Document", "Sr. No. From", "Sr. No. To", "Total Number", "Cancelled"], rows };
    }
  }
}
