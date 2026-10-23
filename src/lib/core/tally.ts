/**
 * A month of the kennel's books as files Tally imports (M64, D54): one of
 * ledger masters (each parent and each kind of expense, under the groups the
 * kennel names) and one of vouchers (a Sales voucher for each bill, a Credit
 * Note for each credit note, a Receipt or Payment for money in and out, a
 * Journal for credit kept or spent, and a Payment for each expense). Written
 * by hand: Tally's XML is small and no library is needed.
 *
 * Tally's signs: a debit is a negative AMOUNT with ISDEEMEDPOSITIVE Yes, a
 * credit a positive AMOUNT with ISDEEMEDPOSITIVE No, and every voucher's
 * amounts add up to nothing. Amounts are in currency units with two decimals.
 */

import type { ISODate } from "./dates";
import { toDecimalString } from "./money";

/** The ledger and group names the kennel's books use. tally_settings in the database. */
export interface TallyLedgers {
  company: string | null;
  sales: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  roundOff: string;
  cash: string;
  bank: string;
  credit: string;
  parentsGroup: string;
  expensesGroup: string;
}

/** The names a kennel starts with. Must match the defaults of tally_settings. */
export const DEFAULT_TALLY_LEDGERS: TallyLedgers = {
  company: null,
  sales: "Sales",
  cgst: "Output CGST",
  sgst: "Output SGST",
  igst: "Output IGST",
  tax: "Output Tax",
  roundOff: "Round Off",
  cash: "Cash",
  bank: "Bank",
  credit: "Credit held for parents",
  parentsGroup: "Sundry Debtors",
  expensesGroup: "Indirect Expenses",
};

export interface TallyParty {
  name: string;
  phone: string;
}

/** An issued bill, or a credit note against one. Amounts in minor units. */
export interface TallyBill {
  number: string;
  date: ISODate;
  party: TallyParty;
  taxableMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  /** All the tax; more than CGST, SGST and IGST together only for a kennel's one tax. */
  taxMinor: number;
  roundOffMinor: number;
  totalMinor: number;
  /** For a credit note: the bill it is against. */
  against?: string | null;
}

export type TallyMethod = "upi" | "cash" | "card" | "bank_transfer" | "other" | "credit";

export interface TallyPayment {
  date: ISODate;
  party: TallyParty;
  /** in: received from the parent. out: refunded, or kept as credit. */
  direction: "in" | "out";
  amountMinor: number;
  method: TallyMethod;
  reference: string | null;
  bill: string | null;
}

export interface TallyExpense {
  date: ISODate;
  category: string;
  vendor: string | null;
  description: string | null;
  amountMinor: number;
  method: TallyMethod | null;
}

export interface TallyMonth {
  ledgers: TallyLedgers;
  bills: readonly TallyBill[];
  creditNotes: readonly TallyBill[];
  payments: readonly TallyPayment[];
  expenses: readonly TallyExpense[];
}

/**
 * A parent's ledger in Tally: their name and the last four digits of their
 * phone, so two parents of one name stay apart ("Asha Rao (3210)"). The
 * walk-in buyer and an erased parent, who have no phone, are their name.
 */
export function partyLedger(p: TallyParty): string {
  const name = cleanName(p.name) || "Parent";
  const digits = p.phone.replace(/\D/g, "");
  return digits.length >= 4 ? `${name} (${digits.slice(-4)})` : name;
}

/** An expense's ledger: its kind, as the kennel wrote it. */
export function expenseLedger(category: string): string {
  return cleanName(category) || "Expenses";
}

/** One line, spaces closed up, at most 100 characters: what a Tally name may be. */
function cleanName(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Text made safe inside XML: the five special characters escaped, and characters XML 1.0 forbids left out. */
export function xmlText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** A date as Tally writes it: 20270301. */
export function tallyDate(d: ISODate): string {
  return d.replaceAll("-", "");
}

/** One side of a voucher: a ledger, debit or credit, an amount in minor units (never negative). */
interface Entry {
  ledger: string;
  debit: boolean;
  minor: number;
}

function entryXml(e: Entry): string {
  const amount = toDecimalString(e.debit ? -e.minor : e.minor);
  return [
    "<ALLLEDGERENTRIES.LIST>",
    `<LEDGERNAME>${xmlText(e.ledger)}</LEDGERNAME>`,
    `<ISDEEMEDPOSITIVE>${e.debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>`,
    `<AMOUNT>${amount}</AMOUNT>`,
    "</ALLLEDGERENTRIES.LIST>",
  ].join("");
}

export interface Voucher {
  type: "Sales" | "Credit Note" | "Receipt" | "Payment" | "Journal";
  date: ISODate;
  number: string | null;
  party: string | null;
  narration: string;
  entries: Entry[];
}

/** Whether a voucher's debits equal its credits. Every voucher written here does. */
export function balanced(v: Voucher): boolean {
  return v.entries.reduce((sum, e) => sum + (e.debit ? -e.minor : e.minor), 0) === 0;
}

function voucherXml(v: Voucher): string {
  return [
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${xmlText(v.type)}" ACTION="Create">`,
    `<DATE>${tallyDate(v.date)}</DATE>`,
    `<VOUCHERTYPENAME>${xmlText(v.type)}</VOUCHERTYPENAME>`,
    v.number ? `<VOUCHERNUMBER>${xmlText(v.number)}</VOUCHERNUMBER>` : "",
    v.party ? `<PARTYLEDGERNAME>${xmlText(v.party)}</PARTYLEDGERNAME>` : "",
    `<NARRATION>${xmlText(v.narration)}</NARRATION>`,
    ...v.entries.filter((e) => e.minor !== 0).map(entryXml),
    "</VOUCHER></TALLYMESSAGE>",
  ].join("");
}

/** Where money moved: cash, or the bank for every other way (UPI, card, transfer). */
function moneyLedger(l: TallyLedgers, method: TallyMethod | null): string {
  return method === null || method === "cash" ? l.cash : l.bank;
}

/** The tax side of a bill or credit note, each tax on its own ledger. */
function taxEntries(l: TallyLedgers, b: TallyBill, debit: boolean): Entry[] {
  const other = b.taxMinor - b.cgstMinor - b.sgstMinor - b.igstMinor;
  return [
    { ledger: l.cgst, debit, minor: b.cgstMinor },
    { ledger: l.sgst, debit, minor: b.sgstMinor },
    { ledger: l.igst, debit, minor: b.igstMinor },
    { ledger: l.tax, debit, minor: other },
  ];
}

/** A round off adds to what the parent owes (a credit on a bill) or takes from it. */
function roundOffEntry(l: TallyLedgers, roundOffMinor: number, onBill: boolean): Entry {
  return { ledger: l.roundOff, debit: onBill ? roundOffMinor < 0 : roundOffMinor > 0, minor: Math.abs(roundOffMinor) };
}

/** Every voucher of the month, in date order: bills, credit notes, money in and out, expenses. */
export function tallyVouchers(month: TallyMonth): Voucher[] {
  const l = month.ledgers;
  const out: Voucher[] = [];
  for (const b of month.bills) {
    const party = partyLedger(b.party);
    out.push({
      type: "Sales",
      date: b.date,
      number: b.number,
      party,
      narration: `Bill ${b.number}`,
      entries: [
        { ledger: party, debit: true, minor: b.totalMinor },
        { ledger: l.sales, debit: false, minor: b.taxableMinor },
        ...taxEntries(l, b, false),
        roundOffEntry(l, b.roundOffMinor, true),
      ],
    });
  }
  for (const n of month.creditNotes) {
    const party = partyLedger(n.party);
    out.push({
      type: "Credit Note",
      date: n.date,
      number: n.number,
      party,
      narration: n.against ? `Credit note ${n.number} against bill ${n.against}` : `Credit note ${n.number}`,
      entries: [
        { ledger: l.sales, debit: true, minor: n.taxableMinor },
        ...taxEntries(l, n, true),
        roundOffEntry(l, n.roundOffMinor, false),
        { ledger: party, debit: false, minor: n.totalMinor },
      ],
    });
  }
  for (const p of month.payments) {
    const party = partyLedger(p.party);
    const other = p.method === "credit" ? l.credit : moneyLedger(l, p.method);
    const what = [p.bill ? `bill ${p.bill}` : null, p.reference ? `ref ${p.reference}` : null].filter(Boolean).join(", ");
    const words =
      p.method === "credit"
        ? p.direction === "in"
          ? "Paid from credit"
          : "Kept as credit"
        : p.direction === "in"
          ? `Received by ${p.method.replace("_", " ")}`
          : `Refunded by ${p.method.replace("_", " ")}`;
    out.push({
      type: p.method === "credit" ? "Journal" : p.direction === "in" ? "Receipt" : "Payment",
      date: p.date,
      number: null,
      party,
      narration: what ? `${words}, ${what}` : words,
      // Money in: the cash, bank or credit gains and the parent owes less. Out: the reverse.
      entries:
        p.direction === "in"
          ? [
              { ledger: other, debit: true, minor: p.amountMinor },
              { ledger: party, debit: false, minor: p.amountMinor },
            ]
          : [
              { ledger: party, debit: true, minor: p.amountMinor },
              { ledger: other, debit: false, minor: p.amountMinor },
            ],
    });
  }
  for (const e of month.expenses) {
    out.push({
      type: "Payment",
      date: e.date,
      number: null,
      party: null,
      narration: [e.vendor, e.description].filter(Boolean).join(", ") || e.category,
      entries: [
        { ledger: expenseLedger(e.category), debit: true, minor: e.amountMinor },
        { ledger: moneyLedger(l, e.method), debit: false, minor: e.amountMinor },
      ],
    });
  }
  return out.map((v, i) => ({ v, i })).sort((a, b) => a.v.date.localeCompare(b.v.date) || a.i - b.i).map((x) => x.v);
}

function envelope(report: "All Masters" | "Vouchers", company: string | null, messages: string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<ENVELOPE>",
    "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>",
    "<BODY><IMPORTDATA>",
    "<REQUESTDESC>",
    `<REPORTNAME>${report}</REPORTNAME>`,
    company ? `<STATICVARIABLES><SVCURRENTCOMPANY>${xmlText(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` : "",
    "</REQUESTDESC>",
    "<REQUESTDATA>",
    ...messages,
    "</REQUESTDATA>",
    "</IMPORTDATA></BODY>",
    "</ENVELOPE>",
  ]
    .filter(Boolean)
    .join("\n")
    .concat("\n");
}

/**
 * The ledger masters the month's vouchers need that the kennel does not set
 * once: each parent under the parents' group, each kind of expense under the
 * expenses' group. Without ACTION, so a ledger Tally already has is left as
 * it is. The fixed ledgers (sales, taxes, cash, bank, round off, credit) are
 * made once in Tally by the accountant.
 */
export function tallyMasters(month: TallyMonth): string {
  const parents = new Set<string>();
  for (const b of [...month.bills, ...month.creditNotes]) parents.add(partyLedger(b.party));
  for (const p of month.payments) parents.add(partyLedger(p.party));
  const kinds = new Set(month.expenses.map((e) => expenseLedger(e.category)));
  const ledger = (name: string, group: string) =>
    `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xmlText(name)}"><NAME.LIST><NAME>${xmlText(name)}</NAME></NAME.LIST><PARENT>${xmlText(group)}</PARENT></LEDGER></TALLYMESSAGE>`;
  return envelope("All Masters", month.ledgers.company, [
    ...[...parents].sort().map((n) => ledger(n, month.ledgers.parentsGroup)),
    ...[...kinds].sort().map((n) => ledger(n, month.ledgers.expensesGroup)),
  ]);
}

/** The month's vouchers as Tally's XML. */
export function tallyVouchersXml(month: TallyMonth): string {
  return envelope("Vouchers", month.ledgers.company, tallyVouchers(month).map(voucherXml));
}
