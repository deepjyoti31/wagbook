import { describe, expect, it } from "vitest";
import {
  balanced,
  DEFAULT_TALLY_LEDGERS,
  partyLedger,
  tallyDate,
  tallyMasters,
  tallyVouchers,
  tallyVouchersXml,
  xmlText,
  type TallyBill,
  type TallyMonth,
} from "./tally";

const asha = { name: "Asha Rao", phone: "+919876543210" };
const walkIn = { name: "Walk-in", phone: "" };

// A GST bill within the state: 2,000.00 of boarding at 18% is 180.00 CGST and 180.00 SGST, 2,360.00 in all.
const gstBill: TallyBill = { number: "WB/27-28/0001", date: "2027-03-02", party: asha, taxableMinor: 200000, cgstMinor: 18000, sgstMinor: 18000, igstMinor: 0, taxMinor: 36000, roundOffMinor: 0, totalMinor: 236000 };
// A walk-in sale with no tax, rounded up by 0.50.
const shopBill: TallyBill = { number: "WB/27-28/0002", date: "2027-03-05", party: walkIn, taxableMinor: 44950, cgstMinor: 0, sgstMinor: 0, igstMinor: 0, taxMinor: 0, roundOffMinor: 50, totalMinor: 45000 };
// A credit note of 500.00 plus tax against the first bill, rounded down by 0.40.
const note: TallyBill = { number: "CN/27-28/0001", date: "2027-03-04", party: asha, taxableMinor: 50040, cgstMinor: 4504, sgstMinor: 4504, igstMinor: 0, taxMinor: 9008, roundOffMinor: -48, totalMinor: 59000, against: "WB/27-28/0001" };

const month: TallyMonth = {
  ledgers: { ...DEFAULT_TALLY_LEDGERS, company: "Happy Tails & Co" },
  bills: [shopBill, gstBill],
  creditNotes: [note],
  payments: [
    { date: "2027-03-02", party: asha, direction: "in", amountMinor: 236000, method: "upi", reference: "UTR123", bill: "WB/27-28/0001" },
    { date: "2027-03-05", party: walkIn, direction: "in", amountMinor: 45000, method: "cash", reference: null, bill: "WB/27-28/0002" },
    { date: "2027-03-06", party: asha, direction: "out", amountMinor: 59000, method: "credit", reference: null, bill: "WB/27-28/0001" },
    { date: "2027-03-07", party: asha, direction: "out", amountMinor: 1000, method: "bank_transfer", reference: null, bill: null },
    { date: "2027-03-08", party: asha, direction: "in", amountMinor: 20000, method: "credit", reference: null, bill: null },
  ],
  expenses: [
    { date: "2027-03-03", category: "Food", vendor: "Butcher", description: "Order of 01 Mar 2027, bill B-9", amountMinor: 120000, method: null },
    { date: "2027-03-03", category: " Repairs  and  upkeep ", vendor: null, description: null, amountMinor: 5000, method: "upi" },
  ],
};

describe("export for Tally (M64)", () => {
  it("names each parent's ledger with the last four digits of their phone", () => {
    expect(partyLedger(asha)).toBe("Asha Rao (3210)");
    expect(partyLedger(walkIn)).toBe("Walk-in");
    expect(partyLedger({ name: "  ", phone: "" })).toBe("Parent");
  });

  it("writes XML safely and dates as Tally does", () => {
    expect(xmlText(`Tom & "Jerry" <b>'s\u0001`)).toBe("Tom &amp; &quot;Jerry&quot; &lt;b&gt;&apos;s");
    expect(tallyDate("2027-03-02")).toBe("20270302");
  });

  it("balances every voucher, debits against credits", () => {
    const vouchers = tallyVouchers(month);
    expect(vouchers).toHaveLength(10);
    expect(vouchers.every(balanced)).toBe(true);
    // In date order, and in the order given within a day.
    expect(vouchers.map((v) => v.date)).toEqual([...vouchers.map((v) => v.date)].sort());
  });

  it("makes a bill a Sales voucher: the parent owes the total, sales and the taxes take their parts", () => {
    const sale = tallyVouchers(month).find((v) => v.number === gstBill.number)!;
    expect(sale.type).toBe("Sales");
    expect(sale.entries.filter((e) => e.minor !== 0)).toEqual([
      { ledger: "Asha Rao (3210)", debit: true, minor: 236000 },
      { ledger: "Sales", debit: false, minor: 200000 },
      { ledger: "Output CGST", debit: false, minor: 18000 },
      { ledger: "Output SGST", debit: false, minor: 18000 },
    ]);
    const shop = tallyVouchers(month).find((v) => v.number === shopBill.number)!;
    expect(shop.entries.filter((e) => e.minor !== 0)).toEqual([
      { ledger: "Walk-in", debit: true, minor: 45000 },
      { ledger: "Sales", debit: false, minor: 44950 },
      { ledger: "Round Off", debit: false, minor: 50 },
    ]);
  });

  it("makes a credit note the bill turned round, its round off too", () => {
    const cn = tallyVouchers(month).find((v) => v.type === "Credit Note")!;
    expect(cn.narration).toBe("Credit note CN/27-28/0001 against bill WB/27-28/0001");
    expect(cn.entries.filter((e) => e.minor !== 0)).toEqual([
      { ledger: "Sales", debit: true, minor: 50040 },
      { ledger: "Output CGST", debit: true, minor: 4504 },
      { ledger: "Output SGST", debit: true, minor: 4504 },
      { ledger: "Round Off", debit: false, minor: 48 },
      { ledger: "Asha Rao (3210)", debit: false, minor: 59000 },
    ]);
  });

  it("puts money in and out through cash, the bank or the parent's credit", () => {
    const vouchers = tallyVouchers(month).filter((v) => v.number === null && v.party);
    expect(vouchers.map((v) => [v.type, v.entries.map((e) => `${e.debit ? "Dr" : "Cr"} ${e.ledger} ${e.minor}`)])).toEqual([
      ["Receipt", ["Dr Bank 236000", "Cr Asha Rao (3210) 236000"]],
      ["Receipt", ["Dr Cash 45000", "Cr Walk-in 45000"]],
      ["Journal", ["Dr Asha Rao (3210) 59000", "Cr Credit held for parents 59000"]],
      ["Payment", ["Dr Asha Rao (3210) 1000", "Cr Bank 1000"]],
      ["Journal", ["Dr Credit held for parents 20000", "Cr Asha Rao (3210) 20000"]],
    ]);
    expect(vouchers[0].narration).toBe("Received by upi, bill WB/27-28/0001, ref UTR123");
    expect(vouchers[3].narration).toBe("Refunded by bank transfer");
  });

  it("pays an expense from its kind's ledger, in cash when no way was written down", () => {
    const expenses = tallyVouchers(month).filter((v) => v.type === "Payment" && !v.party);
    expect(expenses.map((v) => v.entries.map((e) => `${e.debit ? "Dr" : "Cr"} ${e.ledger}`))).toEqual([
      ["Dr Food", "Cr Cash"],
      ["Dr Repairs and upkeep", "Cr Bank"],
    ]);
    expect(expenses[0].narration).toBe("Butcher, Order of 01 Mar 2027, bill B-9");
  });

  it("writes the vouchers file Tally imports", () => {
    const xml = tallyVouchersXml(month);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>')).toBe(true);
    expect(xml).toContain("<TALLYREQUEST>Import Data</TALLYREQUEST>");
    expect(xml).toContain("<REPORTNAME>Vouchers</REPORTNAME>");
    expect(xml).toContain("<SVCURRENTCOMPANY>Happy Tails &amp; Co</SVCURRENTCOMPANY>");
    expect(xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>20270302</DATE>');
    expect(xml).toContain("<LEDGERNAME>Asha Rao (3210)</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-2360.00</AMOUNT>");
    expect(xml).toContain("<LEDGERNAME>Sales</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>2000.00</AMOUNT>");
    // A tax that is nothing is not written as a line.
    expect(xml.match(/Output IGST/g)).toBeNull();
    expect((xml.match(/<VOUCHER /g) ?? []).length).toBe(10);
    expect((xml.match(/<TALLYMESSAGE/g) ?? []).length).toBe((xml.match(/<\/TALLYMESSAGE>/g) ?? []).length);
    // Every voucher's amounts add up to nothing in the file itself.
    for (const voucher of xml.split("<VOUCHER ").slice(1)) {
      const amounts = [...voucher.matchAll(/<AMOUNT>(-?\d+)\.(\d{2})<\/AMOUNT>/g)].map((m) => Number(m[1]) * 100 + Math.sign(Number(`${m[1]}1`)) * Number(m[2]));
      expect(amounts.reduce((a, b) => a + b, 0)).toBe(0);
    }
  });

  it("writes the ledgers the vouchers need, each once, under the kennel's groups", () => {
    const xml = tallyMasters(month);
    expect(xml).toContain("<REPORTNAME>All Masters</REPORTNAME>");
    expect((xml.match(/<LEDGER /g) ?? []).length).toBe(4);
    expect(xml).toContain('<LEDGER NAME="Asha Rao (3210)"><NAME.LIST><NAME>Asha Rao (3210)</NAME></NAME.LIST><PARENT>Sundry Debtors</PARENT></LEDGER>');
    expect(xml).toContain('<LEDGER NAME="Walk-in">');
    expect(xml).toContain('<LEDGER NAME="Repairs and upkeep"><NAME.LIST><NAME>Repairs and upkeep</NAME></NAME.LIST><PARENT>Indirect Expenses</PARENT></LEDGER>');
    expect(xml).not.toContain("ACTION=");
    const empty = tallyMasters({ ...month, bills: [], creditNotes: [], payments: [], expenses: [] });
    expect(empty).toContain("<REQUESTDATA>\n</REQUESTDATA>");
  });

  it("writes a kennel's one tax, and IGST to another state, on their own ledgers", () => {
    const oneTax: TallyBill = { ...gstBill, number: "B-1", cgstMinor: 0, sgstMinor: 0, taxMinor: 10000, totalMinor: 210000 };
    const other: TallyBill = { ...gstBill, number: "B-2", cgstMinor: 0, sgstMinor: 0, igstMinor: 36000 };
    const [a, b] = tallyVouchers({ ...month, bills: [oneTax, other], creditNotes: [], payments: [], expenses: [] });
    expect(a.entries.filter((e) => e.minor !== 0).map((e) => e.ledger)).toEqual(["Asha Rao (3210)", "Sales", "Output Tax"]);
    expect(b.entries.filter((e) => e.minor !== 0).map((e) => e.ledger)).toEqual(["Asha Rao (3210)", "Sales", "Output IGST"]);
    expect([a, b].every(balanced)).toBe(true);
  });
});
