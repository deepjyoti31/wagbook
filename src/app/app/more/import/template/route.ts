import { connection } from "next/server";
import { requireOrg } from "@/lib/auth";
import { IMPORT_COLUMNS, toCsv } from "@/lib/core";

/**
 * The spreadsheet template for bringing in parents and pets (M47): the
 * columns, and one example line of invented people to write over.
 */
export async function GET() {
  await connection();
  await requireOrg();
  const example: Record<string, string> = {
    parent_name: "Asha Rao",
    phone: "98765 43210",
    email: "asha@example.com",
    address: "12 First Cross",
    area: "Indiranagar",
    pin_code: "560038",
    city: "Bengaluru",
    pet_name: "Mithai",
    species: "dog",
    breed: "Indie",
    sex: "female",
    date_of_birth: "01/03/2021",
    neutered: "yes",
    weight_kg: "18.5",
    food_notes: "Two meals, no chicken",
    vaccine_1: "Rabies",
    given_on_1: "10/01/2026",
    valid_until_1: "10/01/2027",
  };
  const csv = toCsv(IMPORT_COLUMNS, [IMPORT_COLUMNS.map((c) => example[c] ?? "")]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="wagbook-parents-and-pets.csv"',
      "Cache-Control": "no-store",
    },
  });
}
