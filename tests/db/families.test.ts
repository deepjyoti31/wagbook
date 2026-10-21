import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice, stayLines, type InvoiceTotals, type LineInput } from "../../src/lib/core";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Families: two pets of one parent may share a kennel (two at most, never
 * with another parent's pet), siblings may play together, and a family booked
 * together is billed on one bill.
 */

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

/** Book several pets of one parent together, in one statement, as New booking does. */
async function bookFamily(
  k: Kennel,
  pets: { pet: string; kennel?: string | null; rate?: number; alone?: number | null }[],
  stay: { start: string; end: string; status?: string },
  actor: string = k.owner,
): Promise<{ group: string; ids: string[] }> {
  return as(db, user(actor), async () => {
    const group = (await db.query<{ id: string }>("select gen_random_uuid() as id")).rows[0].id;
    // $1 to $6 are the same for every pet; then four for each pet: the pet, its kennel, its price and its price alone.
    const rows = pets.map((_, i) => `($1, $2, $${7 + i * 4}, 'boarding', $4, $5, $6, $${8 + i * 4}, $${9 + i * 4}, $${10 + i * 4}::bigint, $3)`).join(", ");
    const params: unknown[] = [k.org, k.client, group, stay.status ?? "confirmed", stay.start, stay.end];
    params.push(...pets.flatMap((p) => [p.pet, p.kennel ?? null, p.rate ?? 120000, p.alone ?? null]));
    const r = await db.query<{ id: string }>(
      `insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, alone_rate_minor, group_id)
       values ${rows} returning id`,
      params,
    );
    return { group, ids: r.rows.map((x) => x.id) };
  });
}

describe("shared kennels", () => {
  let k: Kennel;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 2, pets: 3 });
  });

  it("lets two pets of one parent share a kennel, never a third, and never another parent's pet", async () => {
    await bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[0] }, { pet: k.pets[1], kennel: k.kennels[0] }], { start: "2027-04-14", end: "2027-04-17" });
    const third = await errorOf(() => book(db, k, { pet: k.pets[2], start: "2027-04-16", end: "2027-04-18", kennel: k.kennels[0] }));
    expect(third.message).toContain("WB027");
    const stranger = await errorOf(async () => book(db, k, { pet: await strangerPet(db, k), start: "2027-04-15", end: "2027-04-16", kennel: k.kennels[0] }));
    expect(stranger.message).toContain("bookings_no_kennel_overlap");
    // The third sibling may come in on the day the others leave.
    await book(db, k, { pet: k.pets[2], start: "2027-04-17", end: "2027-04-18", kennel: k.kennels[0] });
  });

  it("refuses a third pet even when the kennel allows overbooking", async () => {
    await as(db, user(k.owner), () => db.query("update public.organizations set allow_overbooking = true where id = $1", [k.org]));
    await bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[1] }, { pet: k.pets[1], kennel: k.kennels[1] }], { start: "2027-05-01", end: "2027-05-03" });
    expect((await errorOf(() => book(db, k, { pet: k.pets[2], start: "2027-05-02", end: "2027-05-03", kennel: k.kennels[1] }))).message).toContain("WB027");
    await as(db, user(k.owner), () => db.query("update public.organizations set allow_overbooking = false where id = $1", [k.org]));
  });

  it("counts a shared kennel once against capacity, and a pet with no kennel yet as needing one", async () => {
    // Two kennels: the siblings share K01, a stranger takes K02. The house is full.
    await bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[0] }, { pet: k.pets[1], kennel: k.kennels[0] }], { start: "2027-06-01", end: "2027-06-04" });
    await book(db, k, { pet: await strangerPet(db, k), start: "2027-06-01", end: "2027-06-04", kennel: k.kennels[1] });
    const full = await errorOf(async () => book(db, k, { pet: await strangerPet(db, k), start: "2027-06-02", end: "2027-06-03" }));
    expect(full.message).toContain("WB020");
    await as(db, user(k.owner), async () => {
      const occ = await db.query<{ occupied: number; capacity: number; pets: number }>(
        "select occupied, capacity, pets from public.occupancy_by_day($1, '2027-06-01', '2027-06-01')",
        [k.org],
      );
      expect(occ.rows[0]).toEqual({ occupied: 2, capacity: 2, pets: 3 });
      const report = await db.query<{ boarding: number; kennels_used: number }>("select boarding, kennels_used from public.report_occupancy($1, '2027-06-01', '2027-06-01')", [k.org]);
      expect(report.rows[0]).toEqual({ boarding: 3, kennels_used: 2 });
    });
  });

  it("offers a sibling's kennel while it has room, and never to another parent", async () => {
    const k2 = await seedKennel(db, { kennels: 2, pets: 3 });
    await book(db, k2, { pet: k2.pets[0], start: "2027-07-01", end: "2027-07-05", kennel: k2.kennels[0] });
    const other = await as(db, user(k2.owner), async () =>
      (await db.query<{ id: string }>("select client_id as id from public.pets where id = $1", [await strangerPet(db, k2)])).rows[0].id,
    );
    await as(db, user(k2.owner), async () => {
      const offered = async (client: string | null, pets = 1) =>
        (await db.query<{ name: string }>("select name from public.available_kennels($1, 'boarding', '2027-07-02', '2027-07-04', $2, $3)", [k2.org, client, pets])).rows.map((r) => r.name);
      expect(await offered(k2.client)).toEqual(["K01", "K02"]);
      expect(await offered(k2.client, 2)).toEqual(["K02"]);
      expect(await offered(other)).toEqual(["K02"]);
      expect(await offered(null)).toEqual(["K02"]);
    });
    await book(db, k2, { pet: k2.pets[1], start: "2027-07-02", end: "2027-07-04", kennel: k2.kennels[0] });
    await as(db, user(k2.owner), async () => {
      const full = await db.query<{ name: string }>("select name from public.available_kennels($1, 'boarding', '2027-07-03', '2027-07-04', $2)", [k2.org, k2.client]);
      expect(full.rows.map((r) => r.name)).toEqual(["K02"]);
    });
  });

  it("lets siblings play together, and never another parent's pet", async () => {
    const k3 = await seedKennel(db, { kennels: 3, pets: 2 });
    const family = await bookFamily(k3, [{ pet: k3.pets[0], kennel: k3.kennels[0] }, { pet: k3.pets[1], kennel: k3.kennels[0] }], { start: "2027-08-01", end: "2027-08-03", status: "checked_in" });
    const strangerDog = await strangerPet(db, k3);
    const strangerStay = await book(db, k3, { pet: strangerDog, start: "2027-08-01", end: "2027-08-03", kennel: k3.kennels[1], status: "checked_in" });
    const yard = await as(db, user(k3.owner), async () => (await db.query<{ id: string }>("insert into public.play_yards (org_id, name) values ($1, 'Yard A') returning id", [k3.org])).rows[0].id);
    const play = (booking: string, pet: string, at: string) =>
      as(db, user(k3.owner), () =>
        db.query(
          "insert into public.play_sessions (org_id, yard_id, booking_id, pet_id, session_date, starts_at, duration_minutes) values ($1, $2, $3, $4, '2027-08-02', $5, 20)",
          [k3.org, yard, booking, pet, at],
        ),
      );
    await play(family.ids[0], k3.pets[0], "08:00");
    await play(family.ids[1], k3.pets[1], "08:00");
    expect((await errorOf(() => play(strangerStay, strangerDog, "08:10"))).message).toContain("play_sessions_one_pet_per_yard");
    const parents = await db.query<{ client_id: string }>("select distinct client_id from public.play_sessions where yard_id = $1", [yard]);
    expect(parents.rows.map((r) => r.client_id)).toEqual([k3.client]);
  });
});

describe("the shared kennel price", () => {
  let k: Kennel;
  let staff: string;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 3, pets: 3 });
    staff = await addMember(db, k, "staff");
    await as(db, user(k.owner), () =>
      db.query("insert into public.services (org_id, kind, name, unit, price_minor, shared_price_minor, is_default) values ($1, 'boarding', 'Boarding', 'night', 120000, 90000, true)", [k.org]),
    );
  });

  it("is only for stays, not extras", async () => {
    const e = await errorOf(() =>
      as(db, user(k.owner), () => db.query("insert into public.services (org_id, kind, name, price_minor, shared_price_minor) values ($1, 'addon', 'Bath', 50000, 40000)", [k.org])),
    );
    expect(e.message).toContain("services_shared_price_only_for_stays");
  });

  it("lets staff book the second pet of a shared kennel at it, with the usual price for nights alone", async () => {
    await bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[0] }, { pet: k.pets[1], kennel: k.kennels[0], rate: 90000, alone: 120000 }], { start: "2027-09-01", end: "2027-09-04" }, staff);
  });

  it("refuses staff the shared price without the usual price for nights alone, or with another", async () => {
    for (const alone of [null, 90000]) {
      const e = await errorOf(() =>
        bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[2] }, { pet: k.pets[1], kennel: k.kennels[2], rate: 90000, alone }], { start: "2027-09-20", end: "2027-09-22" }, staff),
      );
      expect(e.message).toContain("WB023");
    }
  });

  it("refuses staff the shared price for a pet that is alone in its kennel, or has none", async () => {
    expect((await errorOf(() => book(db, k, { pet: k.pets[2], start: "2027-09-10", end: "2027-09-12", kennel: k.kennels[1], rate: 90000 }, staff))).message).toContain("WB023");
    expect((await errorOf(() => book(db, k, { pet: k.pets[2], start: "2027-09-10", end: "2027-09-12", rate: 90000 }, staff))).message).toContain("WB023");
    // Two siblings in different kennels are not sharing either.
    const e = await errorOf(() =>
      bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[1] }, { pet: k.pets[1], kennel: k.kennels[2], rate: 90000, alone: 120000 }], { start: "2027-10-01", end: "2027-10-03" }, staff),
    );
    expect(e.message).toContain("WB023");
  });
});

describe("a family booking", () => {
  let k: Kennel;
  let manager: string;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 3, pets: 2 });
    manager = await addMember(db, k, "manager");
  });

  it("stays the family it was booked as", async () => {
    const family = await bookFamily(k, [{ pet: k.pets[0] }, { pet: k.pets[1] }], { start: "2027-11-01", end: "2027-11-03" });
    const out = await errorOf(() => as(db, user(manager), () => db.query("update public.bookings set group_id = null where id = $1", [family.ids[1]])));
    expect(out.message).toContain("WB026");
    const alone = await book(db, k, { pet: k.pets[0], start: "2027-12-01", end: "2027-12-03" });
    const into = await errorOf(() => as(db, user(manager), () => db.query("update public.bookings set group_id = $1 where id = $2", [family.group, alone])));
    expect(into.message).toContain("WB026");
  });

  it("moves with its parent when two parents are merged", async () => {
    const family = await bookFamily(k, [{ pet: k.pets[0] }, { pet: k.pets[1] }], { start: "2028-01-05", end: "2028-01-07" });
    const keep = await as(db, user(k.owner), async () =>
      (await db.query<{ id: string }>("insert into public.clients (org_id, full_name, phone) values ($1, 'Same person', '+919811100001') returning id", [k.org])).rows[0].id,
    );
    await as(db, user(k.owner), async () => {
      const yard = (await db.query<{ id: string }>("insert into public.play_yards (org_id, name) values ($1, 'Merge yard') returning id", [k.org])).rows[0].id;
      await db.query(
        "insert into public.play_sessions (org_id, yard_id, booking_id, pet_id, session_date, starts_at, duration_minutes) values ($1, $2, $3, $4, '2028-01-06', '09:00', 20)",
        [k.org, yard, family.ids[0], k.pets[0]],
      );
    });
    await as(db, user(k.owner), () => db.query("select public.merge_clients($1, $2)", [keep, k.client]));
    const rows = await db.query<{ client_id: string }>("select distinct client_id from public.bookings where group_id = $1", [family.group]);
    expect(rows.rows.map((r) => r.client_id)).toEqual([keep]);
    // Play sessions follow, so the siblings can still play together.
    const play = await db.query<{ client_id: string }>("select client_id from public.play_sessions where booking_id = $1", [family.ids[0]]);
    expect(play.rows.map((r) => r.client_id)).toEqual([keep]);
  });
});

describe("one bill for a family", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let family: { group: string; ids: string[] };

  /** The JSON the app sends to save_invoice_draft(). */
  function payload(t: InvoiceTotals) {
    return {
      totals: {
        subtotal_minor: t.subtotalMinor, discount_minor: t.discountMinor, taxable_minor: t.taxableMinor, cgst_minor: t.cgstMinor,
        sgst_minor: t.sgstMinor, igst_minor: t.igstMinor, tax_minor: t.taxMinor, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor,
      },
      lines: t.lines.map((l, i) => ({
        sort_order: i, description: l.description, sac_code: l.sacCode, quantity: l.quantity, unit_price_minor: l.unitPriceMinor,
        discount_minor: l.discountMinor, taxable_minor: l.taxableMinor, tax_rate_bp: l.taxRateBp, cgst_minor: l.cgstMinor,
        sgst_minor: l.sgstMinor, igst_minor: l.igstMinor, tax_minor: l.taxMinor, total_minor: l.totalMinor,
      })),
    };
  }

  async function makeDraft(actor: string, t: InvoiceTotals, link: { booking?: string; group?: string }, client = k.client): Promise<string> {
    return as(db, user(actor), async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.invoices (org_id, client_id, booking_id, group_id) values ($1, $2, $3, $4) returning id",
        [k.org, client, link.booking ?? null, link.group ?? null],
      );
      const p = payload(t);
      await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p.totals), JSON.stringify(p.lines)]);
      return r.rows[0].id;
    });
  }

  const issue = (actor: string, id: string) =>
    as(db, user(actor), async () => (await db.query<{ total_minor: string }>("select total_minor from public.issue_invoice($1)", [id])).rows[0]);

  // Two siblings sharing K01 for three nights, the second at the shared price, and a bath for the first.
  const stay = { kind: "boarding" as const, startDate: "2028-03-01", endDate: "2028-03-04" };
  const familyLines = (): LineInput[] => [
    ...stayLines({ ...stay, petName: "Dog A", rateMinor: 120000, addOns: [{ description: "Bath (Dog A)", quantity: 1, unitPriceMinor: 50000 }] }),
    ...stayLines({ ...stay, petName: "Dog B", rateMinor: 90000 }),
  ];

  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 3, pets: 3 });
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    family = await bookFamily(k, [{ pet: k.pets[0], kennel: k.kennels[0] }, { pet: k.pets[1], kennel: k.kennels[0], rate: 90000 }], { start: "2028-03-01", end: "2028-03-04" });
    await as(db, user(k.owner), () =>
      db.query("insert into public.booking_items (org_id, booking_id, description, unit_price_minor) values ($1, $2, 'Bath', 50000)", [k.org, family.ids[0]]),
    );
  });

  it("refuses to bill a pet of a family on its own", async () => {
    const t = computeInvoice(stayLines({ ...stay, petName: "Dog A", rateMinor: 120000 }), { mode: "none" });
    expect((await errorOf(() => makeDraft(staff, t, { booking: family.ids[0] }))).message).toContain("WB053");
  });

  it("refuses a bill for one stay and a family at once, or for a family of another parent", async () => {
    const t = computeInvoice(familyLines(), { mode: "none" });
    const both = await errorOf(() => makeDraft(manager, t, { booking: family.ids[0], group: family.group }));
    expect(both.message).toMatch(/WB053|invoices_one_stay_or_one_family/);
    const otherParent = await as(db, user(k.owner), async () =>
      (await db.query<{ id: string }>("select client_id as id from public.pets where id = $1", [await strangerPet(db, k)])).rows[0].id,
    );
    expect((await errorOf(() => makeDraft(manager, t, { group: family.group }, otherParent))).message).toContain("WB054");
  });

  it("refuses staff a family bill that leaves a pet out", async () => {
    const t = computeInvoice(stayLines({ ...stay, petName: "Dog A", rateMinor: 120000, addOns: [{ description: "Bath", quantity: 1, unitPriceMinor: 50000 }] }), { mode: "none" });
    const id = await makeDraft(staff, t, { group: family.group });
    expect((await errorOf(() => issue(staff, id))).message).toContain("WB050");
    await as(db, user(k.owner), () => db.query("delete from public.invoices where id = $1", [id]));
  });

  it("lets staff issue the family's bill as its bookings price it, takes in an advance on either pet, and only once", async () => {
    await as(db, user(staff), () =>
      db.query(
        "insert into public.payments (org_id, client_id, booking_id, amount_minor, method, received_on) values ($1, $2, $3, 100000, 'upi', '2028-03-01')",
        [k.org, k.client, family.ids[1]],
      ),
    );
    const t = computeInvoice(familyLines(), { mode: "none" });
    const id = await makeDraft(staff, t, { group: family.group });
    const issued = await issue(staff, id);
    expect(Number(issued.total_minor)).toBe(3 * 120000 + 50000 + 3 * 90000);
    const balance = await as(db, user(staff), async () =>
      (await db.query<{ paid_minor: string; due_minor: string; group_id: string }>("select paid_minor, due_minor, group_id from public.invoice_balances where invoice_id = $1", [id])).rows[0],
    );
    expect(Number(balance.paid_minor)).toBe(100000);
    expect(Number(balance.due_minor)).toBe(3 * 120000 + 50000 + 3 * 90000 - 100000);
    expect(balance.group_id).toBe(family.group);
    expect((await errorOf(() => makeDraft(staff, t, { group: family.group }))).message).toContain("invoices_one_live_per_family");
  });

  it("leaves a cancelled pet off the family's bill", async () => {
    const f = await bookFamily(k, [{ pet: k.pets[0] }, { pet: k.pets[1] }], { start: "2028-04-01", end: "2028-04-03" });
    await as(db, user(staff), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Unwell' where id = $1", [f.ids[1]]));
    const lines = stayLines({ kind: "boarding", startDate: "2028-04-01", endDate: "2028-04-03", petName: "Dog A", rateMinor: 120000 });
    const withBoth = computeInvoice([...lines, ...lines], { mode: "none" });
    const both = await makeDraft(staff, withBoth, { group: f.group });
    expect((await errorOf(() => issue(staff, both))).message).toContain("WB050");
    await as(db, user(k.owner), () => db.query("delete from public.invoices where id = $1", [both]));
    await issue(staff, await makeDraft(staff, computeInvoice(lines, { mode: "none" }), { group: f.group }));
  });
});
