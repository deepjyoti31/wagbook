import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";
import { IMPORT_COLUMNS, parseCsv, readDate, readImport } from "./import";

const today = "2026-10-22";
const file = (rows: Record<string, string>[], header: readonly string[] = IMPORT_COLUMNS) =>
  toCsv(header, rows.map((r) => header.map((h) => r[h] ?? "")));
const good = { parent_name: "Asha Rao", phone: "98765 43210", pet_name: "Mithai" };

describe("parseCsv", () => {
  it("reads quotes, commas and line breaks inside cells, CRLF and a byte order mark", () => {
    expect(parseCsv('﻿a,b\r\n"one, two","say ""hi""\nthere"\r\n\r\nlast,\n')).toEqual([
      ["a", "b"],
      ["one, two", 'say "hi"\nthere'],
      ["last", ""],
    ]);
  });

  it("reads what toCsv writes", () => {
    const rows = [["name", "note"], ["Bruno", 'Barks at "cats", sometimes']];
    expect(parseCsv(toCsv(rows[0], rows.slice(1)))).toEqual(rows);
  });
});

describe("readDate", () => {
  it("takes ISO dates and day-first dates, and refuses dates that do not exist", () => {
    expect(readDate("2021-03-01")).toBe("2021-03-01");
    expect(readDate("01/03/2021")).toBe("2021-03-01");
    expect(readDate("1-3-2021")).toBe("2021-03-01");
    expect(readDate("01.03.2021")).toBe("2021-03-01");
    expect(readDate("31/02/2021")).toBeNull();
    expect(readDate("March 2021")).toBeNull();
  });
});

describe("readImport", () => {
  it("turns a good row into a parent, a pet and its vaccinations", () => {
    const r = readImport(
      file([{ ...good, email: "asha@example.in", pin_code: "560038", species: "Dog", sex: "F", neutered: "yes", weight_kg: "18,5", date_of_birth: "01/03/2021",
        vaccine_1: "Rabies", given_on_1: "10/01/2026", valid_until_1: "10/01/2027" }]),
      { country: "IN", today },
    );
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].line).toBe(2);
    expect(r.rows[0].row).toMatchObject({
      parent: { name: "Asha Rao", phone: "+919876543210", email: "asha@example.in", postal_code: "560038" },
      pet: { name: "Mithai", species: "dog", sex: "female", is_neutered: true, weight_g: 18500, date_of_birth: "2021-03-01" },
      vaccinations: [{ vaccine: "Rabies", given_on: "2026-01-10", valid_until: "2027-01-10" }],
    });
  });

  it("names every problem in a row, and keeps the line to fix and send again", () => {
    const r = readImport(
      file([
        good,
        { parent_name: "", phone: "12345", pet_name: "", species: "horse", sex: "both", neutered: "maybe", weight_kg: "heavy", pin_code: "5600",
          email: "not-an-email", date_of_birth: "2030-01-01", given_on_1: "2026-01-01", vaccine_2: "DHPP", given_on_2: "2026-05-01", valid_until_2: "2026-04-01" },
      ]),
      { country: "IN", today },
    );
    expect(r.rows.map((x) => x.line)).toEqual([2]);
    expect(r.problems.map((p) => `${p.line} ${p.kind} ${p.column}`).sort()).toEqual([
      "3 email email",
      "3 future date_of_birth",
      "3 neutered neutered",
      "3 parentName parent_name",
      "3 petName pet_name",
      "3 phone phone",
      "3 pin pin_code",
      "3 sex sex",
      "3 species species",
      "3 vaccine vaccine_1",
      "3 vaccineDates valid_until_2",
      "3 weight weight_kg",
    ]);
    expect(r.badLines).toHaveLength(1);
    expect(r.badLines[0].line).toBe(3);
  });

  it("lets a parent have several pets, but not the same pet twice", () => {
    const r = readImport(file([good, { ...good, pet_name: "Laddoo" }, { ...good, pet_name: "MITHAI" }]), { country: "IN", today });
    expect(r.rows.map((x) => x.row.pet.name)).toEqual(["Mithai", "Laddoo"]);
    expect(r.problems).toEqual([{ line: 4, kind: "samePet", column: "pet_name" }]);
  });

  it("reads columns in any order and case, and says which it ignored or lacks", () => {
    const header = ["Pet Name", "PHONE", "parent name", "favourite toy"];
    const r = readImport(file([{ "Pet Name": "Mithai", PHONE: "+91 98765 43210", "parent name": "Asha", "favourite toy": "Ball" }], header), { country: "IN", today });
    expect(r.unknownColumns).toEqual(["favourite toy"]);
    expect(r.rows).toHaveLength(1);
    const missing = readImport(file([{ pet_name: "Mithai" }], ["pet_name"]), { country: "IN", today });
    expect(missing.missingColumns).toEqual(["parent_name", "phone"]);
    expect(missing.rows).toEqual([]);
  });

  it("outside India needs the + form of a phone number and takes any postal code with a digit", () => {
    const r = readImport(file([{ ...good, phone: "+14155552671", pin_code: "sw1a 1aa" }, { ...good, phone: "4155552671", pet_name: "Two" }]), { country: "GB", today });
    expect(r.rows.map((x) => x.row.parent.postal_code)).toEqual(["SW1A 1AA"]);
    expect(r.problems).toEqual([{ line: 3, kind: "phone", column: "phone" }]);
  });

  it("reads at most 2000 rows, and says so", () => {
    const r = readImport(file(Array.from({ length: 2001 }, (_, i) => ({ ...good, pet_name: `Dog ${i}` }))), { country: "IN", today });
    expect(r.rows).toHaveLength(2000);
    expect(r.cutShort).toBe(true);
  });

  it("refuses a name longer than the database keeps", () => {
    const r = readImport(file([{ ...good, pet_name: "x".repeat(81) }]), { country: "IN", today });
    expect(r.problems).toEqual([{ line: 2, kind: "tooLong", column: "pet_name" }]);
  });
});
