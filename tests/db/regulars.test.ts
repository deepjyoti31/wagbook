import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Day boarding regulars: days that repeat (a series, one booking a day), and
 * packs of days bought up front, which a day can be paid from but never
 * beyond what was bought.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3, pets: 2 });
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  await as(db, user(k.owner), () =>
    db.query("insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'daycare', 'Day boarding', 'day', 72000, true)", [k.org]),
  );
});
afterAll(() => db.close());

/** Sell a pack of `days` days from `from` to `to`, as a manager. */
const sell = (days: number, from: string, to: string, client = k.client) =>
  as(db, user(manager), async () =>
    (
      await db.query<{ id: string }>(
        "insert into public.passes (org_id, client_id, name, days, price_minor, starts_on, valid_until) values ($1, $2, '10 days', $3, 600000, $4, $5) returning id",
        [k.org, client, days, from, to],
      )
    ).rows[0].id,
  );

/** A day of day boarding paid from a pack, booked by `actor`. */
const day = (pass: string, date: string, actor = staff, pet = k.pets[0], status = "confirmed") =>
  as(db, user(actor), async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, rate_minor, pass_id)
         select $1, p.client_id, p.id, 'daycare', $5, $3, $3, 0, $4 from public.pets p where p.id = $2 returning id`,
        [k.org, pet, date, pass, status],
      )
    ).rows[0].id,
  );

const left = (pass: string) =>
  as(db, user(staff), async () => (await db.query<{ days_left: number; days_used: number }>("select days_left, days_used from public.pass_balances where pass_id = $1", [pass])).rows[0]);

describe("day boarding packs", () => {
  it("let staff pay a day from a pack at no price, and count what is used", async () => {
    const pass = await sell(3, "2027-06-01", "2027-06-30");
    await day(pass, "2027-06-02");
    await day(pass, "2027-06-03");
    expect(await left(pass)).toEqual({ days_left: 1, days_used: 2 });
  });

  it("never give more days than were bought, counting a family's pets", async () => {
    const pass = await sell(2, "2027-07-01", "2027-07-31");
    await day(pass, "2027-07-02");
    await day(pass, "2027-07-02", staff, k.pets[1]);
    expect((await errorOf(() => day(pass, "2027-07-03"))).message).toContain("WB112");
    // A cancelled day gives its day back.
    const third = await as(db, user(staff), async () =>
      (await db.query<{ id: string }>("select id from public.bookings where pass_id = $1 and pet_id = $2", [pass, k.pets[1]])).rows[0].id,
    );
    await as(db, user(staff), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Unwell' where id = $1", [third]));
    await day(pass, "2027-07-03");
  });

  it("hold no days for a request until it is confirmed, then check again", async () => {
    const pass = await sell(1, "2027-08-01", "2027-08-31");
    const asked = await day(pass, "2027-08-05", staff, k.pets[0], "requested");
    await day(pass, "2027-08-06");
    const e = await errorOf(() => as(db, user(staff), () => db.query("update public.bookings set status = 'confirmed' where id = $1", [asked])));
    expect(e.message).toContain("WB112");
  });

  it("are only for day boarding of their own parent, inside their dates, and cost nothing", async () => {
    const pass = await sell(5, "2027-09-01", "2027-09-30");
    expect((await errorOf(() => day(pass, "2027-10-02"))).message).toContain("WB111");
    const stranger = await strangerPet(db, k);
    expect((await errorOf(() => day(pass, "2027-09-02", manager, stranger))).message).toContain("WB110");
    const priced = await errorOf(() =>
      as(db, user(manager), () =>
        db.query(
          "insert into public.bookings (org_id, client_id, pet_id, kind, start_date, end_date, rate_minor, pass_id) values ($1, $2, $3, 'daycare', '2027-09-04', '2027-09-04', 72000, $4)",
          [k.org, k.client, k.pets[0], pass],
        ),
      ),
    );
    expect(priced.message).toContain("bookings_pass_covers_the_price");
  });

  it("let staff move a booked day onto a pack, but not off it, and are sold only by owners and managers", async () => {
    const pass = await sell(5, "2027-11-01", "2027-11-30");
    const b = await book(db, k, { pet: k.pets[0], kind: "daycare", start: "2027-11-05", end: "2027-11-05", rate: 72000 }, staff);
    await as(db, user(staff), () => db.query("update public.bookings set pass_id = $2, rate_minor = 0 where id = $1", [b, pass]));
    const off = await errorOf(() => as(db, user(staff), () => db.query("update public.bookings set pass_id = null, rate_minor = 72000 where id = $1", [b])));
    expect(off.message).toContain("WB022");
    const sold = await errorOf(() =>
      as(db, user(staff), () =>
        db.query("insert into public.passes (org_id, client_id, name, days, price_minor, starts_on, valid_until) values ($1, $2, 'Free days', 99, 0, '2027-11-01', '2027-11-30')", [k.org, k.client]),
      ),
    );
    expect(sold.message).toMatch(/row-level security|permission denied/);
  });

  it("move with their parent when two parents are merged", async () => {
    const pass = await sell(5, "2027-12-01", "2027-12-31");
    await day(pass, "2027-12-02");
    const keep = await as(db, user(manager), async () =>
      (await db.query<{ id: string }>("insert into public.clients (org_id, full_name, phone) values ($1, 'Same person', '+919811100777') returning id", [k.org])).rows[0].id,
    );
    await as(db, user(manager), () => db.query("select public.merge_clients($1, $2)", [keep, k.client]));
    const moved = await as(db, user(manager), async () => (await db.query<{ client_id: string }>("select client_id from public.passes where id = $1", [pass])).rows[0].client_id);
    expect(moved).toBe(keep);
    k = { ...k, client: keep };
  });
});

describe("a repeating series", () => {
  it("is day boarding, one booking a day", async () => {
    const e = await errorOf(() =>
      as(db, user(manager), () =>
        db.query(
          "insert into public.bookings (org_id, client_id, pet_id, kind, start_date, end_date, rate_minor, series_id) values ($1, $2, $3, 'boarding', '2028-01-04', '2028-01-05', 120000, gen_random_uuid())",
          [k.org, k.client, k.pets[0]],
        ),
      ),
    );
    expect(e.message).toContain("bookings_series_is_day_boarding");
  });
});
