import { describe, expect, it } from "vitest";
import { gstDate, gstr1Sheet, placeOfSupply, type Gstr1Bill, type Gstr1Note } from "./gstr1";

const line = (taxable: number, rateBp = 1800, sac: string | null = "998612", intra = true) => ({
  taxRateBp: rateBp,
  sacCode: sac,
  taxableMinor: taxable,
  igstMinor: intra ? 0 : Math.round((taxable * rateBp) / 10000),
  cgstMinor: intra ? Math.round((taxable * rateBp) / 20000) : 0,
  sgstMinor: intra ? Math.round((taxable * rateBp) / 20000) : 0,
});
const bill = (over: Partial<Gstr1Bill>): Gstr1Bill => ({
  number: "WB/27-28/0001",
  date: "2027-04-14",
  cancelled: false,
  buyerName: "Priya Demo",
  buyerGstin: null,
  placeOfSupply: "29",
  sellerState: "29",
  totalMinor: 141600,
  lines: [line(120000)],
  ...over,
});

describe("GSTR-1 sheets", () => {
  const bills = [
    bill({}),
    bill({ number: "WB/27-28/0002", buyerGstin: "29AAGCB7383J1Z4", buyerName: "A Company", lines: [line(100000), line(50000, 500, "998599")], totalMinor: 170500 }),
    bill({ number: "WB/27-28/0003", placeOfSupply: "27", totalMinor: 15000000, lines: [line(12711864, 1800, "998612", false)] }),
    bill({ number: "WB/27-28/0004", cancelled: true }),
    bill({ number: "WB/27-28/0005", placeOfSupply: "27", totalMinor: 59000, lines: [line(50000, 1800, "998612", false)] }),
  ];
  const notes: Gstr1Note[] = [
    { number: "CN/27-28/0001", date: "2027-04-20", totalMinor: 59000, lines: [line(50000)], bill: { ...bills[0], date: "2027-03-30" } },
    { number: "CN/27-28/0002", date: "2027-04-21", totalMinor: 11800, lines: [line(10000)], bill: { ...bills[1] } },
  ];

  it("write dates and places of supply as the offline tool does", () => {
    expect(gstDate("2027-04-05")).toBe("05-Apr-2027");
    expect(placeOfSupply("29")).toBe("29-Karnataka");
  });

  it("list bills to a registered buyer one row per rate", () => {
    expect(gstr1Sheet("b2b", bills, notes).rows).toEqual([
      ["29AAGCB7383J1Z4", "A Company", "WB/27-28/0002", "14-Apr-2027", "1705.00", "29-Karnataka", "N", "", "Regular B2B", "", "18", "1000.00", "0.00"],
      ["29AAGCB7383J1Z4", "A Company", "WB/27-28/0002", "14-Apr-2027", "1705.00", "29-Karnataka", "N", "", "Regular B2B", "", "5", "500.00", "0.00"],
    ]);
  });

  it("list large bills to another state one by one, and add up the rest less their credit notes", () => {
    expect(gstr1Sheet("b2cl", bills, notes).rows.map((r) => r[0])).toEqual(["WB/27-28/0003"]);
    expect(gstr1Sheet("b2cs", bills, notes).rows).toEqual([
      // Karnataka: 1,200 billed, less a 500 credit note on a bill from last month. The cancelled bill is left out.
      ["OE", "27-Maharashtra", "", "18", "500.00", "0.00", ""],
      ["OE", "29-Karnataka", "", "18", "700.00", "0.00", ""],
    ]);
  });

  it("put credit notes on registered buyers' bills in cdnr, and the rest in b2cs", () => {
    expect(gstr1Sheet("cdnr", bills, notes).rows).toEqual([
      ["29AAGCB7383J1Z4", "A Company", "CN/27-28/0002", "21-Apr-2027", "C", "29-Karnataka", "N", "Regular B2B", "118.00", "", "18", "100.00", "0.00"],
    ]);
    expect(gstr1Sheet("cdnur", bills, notes).rows).toEqual([]);
  });

  it("add up value and tax by service code and rate, less credit notes", () => {
    const hsn = gstr1Sheet("hsn", bills, notes).rows;
    expect(hsn.find((r) => r[0] === "998599")).toEqual(["998599", "", "NA", "0", "525.00", "5", "500.00", "0.00", "12.50", "12.50", "0.00"]);
    // 1,200 + 1,000 + 127,118.64 + 500, less 500 and 100.
    expect(hsn.find((r) => r[0] === "998612")?.[6]).toBe("129218.64");
  });

  it("count the numbers used, and how many bills were cancelled", () => {
    expect(gstr1Sheet("docs", bills, notes).rows).toEqual([
      ["Invoices for outward supply", "WB/27-28/0001", "WB/27-28/0005", 5, 1],
      ["Credit Note", "CN/27-28/0001", "CN/27-28/0002", 2, 0],
    ]);
  });
});
