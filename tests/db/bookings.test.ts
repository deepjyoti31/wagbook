import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

describe("double booking is impossible", () => {
  let k: Kennel;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 3, pets: 1 });
    // Pets of four different parents: siblings may share a kennel (see "shared kennels").
    for (let i = 0; i < 3; i++) k.pets.push(await strangerPet(db, k));
    await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0] });
  });

  it("refuses a second pet in the same kennel on overlapping nights", async () => {
    const e = await errorOf(() => book(db, k, { pet: k.pets[1], start: "2027-04-16", end: "2027-04-18", kennel: k.kennels[0] }));
    expect(e.code).toBe("23P01");
    expect(e.message).toContain("bookings_no_kennel_overlap");
  });

  it("allows one pet to leave and another to arrive in the same kennel on the same day", async () => {
    await book(db, k, { pet: k.pets[1], start: "2027-04-17", end: "2027-04-19", kennel: k.kennels[0] });
  });

  it("refuses the same pet twice for overlapping dates, whatever the kennel", async () => {
    const e = await errorOf(() => book(db, k, { pet: k.pets[0], start: "2027-04-15", end: "2027-04-16", kennel: k.kennels[1] }));
    expect(e.code).toBe("23P01");
    expect(e.message).toContain("bookings_no_pet_overlap");
  });

  it("treats a day boarding visit as holding the kennel for that day", async () => {
    await book(db, k, { pet: k.pets[2], start: "2027-04-20", end: "2027-04-20", kennel: k.kennels[1], kind: "daycare" });
    const e = await errorOf(() => book(db, k, { pet: k.pets[3], start: "2027-04-20", end: "2027-04-22", kennel: k.kennels[1] }));
    expect(e.code).toBe("23P01");
  });

  it("frees the kennel when a booking is cancelled or checked out", async () => {
    const id = await book(db, k, { pet: k.pets[3], start: "2027-05-01", end: "2027-05-05", kennel: k.kennels[2] });
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled' where id = $1", [id]));
    await book(db, k, { pet: k.pets[2], start: "2027-05-02", end: "2027-05-04", kennel: k.kennels[2] });
  });

  it("requires a boarding stay to have at least one night and dates in order", async () => {
    expect((await errorOf(() => book(db, k, { pet: k.pets[3], start: "2027-07-01", end: "2027-07-01" }))).code).toBe("23514");
    expect((await errorOf(() => book(db, k, { pet: k.pets[3], start: "2027-07-02", end: "2027-07-01", kind: "daycare" }))).code).toBe("23514");
  });

  it("offers only kennels that are free for the whole stay", async () => {
    await as(db, user(k.owner), async () => {
      const free = await db.query<{ name: string }>("select name from public.available_kennels($1, 'boarding', '2027-04-15', '2027-04-18')", [k.org]);
      expect(free.rows.map((r) => r.name)).toEqual(["K02", "K03"]);
    });
  });
});

describe("capacity", () => {
  let k: Kennel;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 2, pets: 4 });
  });

  it("refuses a booking that would put more pets in house than there are kennels, even with no kennel chosen", async () => {
    await book(db, k, { pet: k.pets[0], start: "2027-08-10", end: "2027-08-15" });
    await book(db, k, { pet: k.pets[1], start: "2027-08-12", end: "2027-08-14" });
    const e = await errorOf(() => book(db, k, { pet: k.pets[2], start: "2027-08-13", end: "2027-08-16" }));
    expect(e.message).toContain("WB020");
    expect(e.message).toContain("2027-08-13");
  });

  it("does not count requests, so an enquiry never blocks a real booking", async () => {
    await book(db, k, { pet: k.pets[2], start: "2027-08-12", end: "2027-08-14", status: "requested" });
    // ...but confirming it is refused while the house is full.
    const e = await errorOf(() =>
      as(db, user(k.owner), () =>
        db.query("update public.bookings set status = 'confirmed' where pet_id = $1 and status = 'requested'", [k.pets[2]]),
      ),
    );
    expect(e.message).toContain("WB020");
  });

  it("counts a kennel taken out of service", async () => {
    await as(db, user(k.owner), () => db.query("update public.kennels set is_active = false where id = $1", [k.kennels[1]]));
    const e = await errorOf(() => book(db, k, { pet: k.pets[3], start: "2027-09-01", end: "2027-09-03" }).then(() =>
      book(db, k, { pet: k.pets[2], start: "2027-09-01", end: "2027-09-03" }),
    ));
    expect(e.message).toContain("WB020");
    await as(db, user(k.owner), () => db.query("update public.kennels set is_active = true where id = $1", [k.kennels[1]]));
  });

  it("can be switched off by the kennel", async () => {
    await as(db, user(k.owner), () => db.query("update public.organizations set allow_overbooking = true where id = $1", [k.org]));
    await book(db, k, { pet: k.pets[3], start: "2027-08-13", end: "2027-08-14" });
    await as(db, user(k.owner), () => db.query("update public.organizations set allow_overbooking = false where id = $1", [k.org]));
  });

  it("reports occupancy by day", async () => {
    await as(db, user(k.owner), async () => {
      const res = await db.query<{ day: string; occupied: number; capacity: number }>(
        "select day::text, occupied, capacity from public.occupancy_by_day($1, '2027-08-09', '2027-08-15')",
        [k.org],
      );
      expect(res.rows.map((r) => r.occupied)).toEqual([0, 1, 1, 2, 3, 1, 0]);
      expect(res.rows.every((r) => r.capacity === 2)).toBe(true);
    });
  });
});

describe("check-in and check-out", () => {
  it("stamps who and when, and records it in the audit log", async () => {
    const k = await seedKennel(db);
    const staff = await addMember(db, k, "staff");
    const id = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0] });

    await as(db, user(staff), () => db.query("update public.bookings set status = 'checked_in' where id = $1", [id]));
    await as(db, user(staff), () => db.query("update public.bookings set status = 'checked_out' where id = $1", [id]));

    const row = await db.query<{ checked_in_by: string; checked_out_by: string; checked_in_at: string; created_by: string }>(
      "select checked_in_by, checked_out_by, checked_in_at, created_by from public.bookings where id = $1",
      [id],
    );
    expect(row.rows[0].checked_in_by).toBe(staff);
    expect(row.rows[0].checked_out_by).toBe(staff);
    expect(row.rows[0].checked_in_at).not.toBeNull();
    expect(row.rows[0].created_by).toBe(k.owner);

    await as(db, user(k.owner), async () => {
      const log = await db.query<{ action: string; actor: string; new_data: Record<string, unknown> }>(
        "select action, actor, new_data from public.audit_log where table_name = 'bookings' and row_id = $1 order by id",
        [id],
      );
      expect(log.rows.map((r) => r.action)).toEqual(["insert", "update", "update"]);
      expect(log.rows[1].actor).toBe(staff);
      expect(log.rows[1].new_data.status).toBe("checked_in");
      // Only changed columns are stored for updates, and never the secret link token.
      expect(log.rows[1].new_data).not.toHaveProperty("rate_minor");
      expect(log.rows[0].new_data).not.toHaveProperty("public_token");
    });
  });

  it("gives every booking its own unguessable stay-page token", async () => {
    const k = await seedKennel(db);
    await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17" });
    await book(db, k, { pet: k.pets[1], start: "2027-04-14", end: "2027-04-17" });
    const res = await db.query<{ public_token: string }>("select public_token from public.bookings where org_id = $1", [k.org]);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].public_token).toMatch(/^[0-9a-f]{64}$/);
    expect(res.rows[0].public_token).not.toBe(res.rows[1].public_token);
  });
});

describe("daily care", () => {
  it("creates each day's tasks once from the house and per-pet routines", async () => {
    const k = await seedKennel(db);
    const b1 = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0], status: "checked_in" });
    await book(db, k, { pet: k.pets[1], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[1] }); // not checked in yet

    await as(db, user(k.owner), async () => {
      for (const [label, time] of [["Breakfast", "09:00"], ["Lunch", "14:00"], ["Dinner", "19:00"]]) {
        await db.query("insert into public.care_items (org_id, kind, label, due_time) values ($1, 'meal', $2, $3)", [k.org, label, time]);
      }
      await db.query(
        "insert into public.care_items (org_id, pet_id, kind, label, details, due_time) values ($1, $2, 'medication', 'Tablet', '1 with food', '08:00')",
        [k.org, k.pets[0]],
      );
      await db.query(
        "insert into public.care_items (org_id, pet_id, kind, label, due_time) values ($1, $2, 'medication', 'Other dog tablet', '08:00')",
        [k.org, k.pets[1]],
      );

      const first = await db.query<{ n: number }>("select public.generate_care_tasks($1, '2027-04-15') as n", [k.org]);
      expect(first.rows[0].n).toBe(4); // 3 meals + this pet's tablet; nothing for the pet not in house
      const again = await db.query<{ n: number }>("select public.generate_care_tasks($1, '2027-04-15') as n", [k.org]);
      expect(again.rows[0].n).toBe(0);
      const before = await db.query<{ n: number }>("select public.generate_care_tasks($1, '2027-04-13') as n", [k.org]);
      expect(before.rows[0].n).toBe(0);
      // Still checked in after the end date (an overstay): the pet is still fed.
      const overstay = await db.query<{ n: number }>("select public.generate_care_tasks($1, '2027-04-18') as n", [k.org]);
      expect(overstay.rows[0].n).toBe(4);

      const tasks = await db.query<{ label: string }>(
        "select label from public.care_tasks where booking_id = $1 and task_date = '2027-04-15' order by due_time, label",
        [b1],
      );
      expect(tasks.rows.map((t) => t.label)).toEqual(["Tablet", "Breakfast", "Lunch", "Dinner"]);
    });
  });

  it("stamps who did a task and clears it on undo", async () => {
    const k = await seedKennel(db);
    const staff = await addMember(db, k, "staff");
    const b1 = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    const t = await as(db, user(staff), async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.care_tasks (org_id, booking_id, pet_id, task_date, kind, label) values ($1, $2, $3, '2027-04-15', 'walk', 'Evening walk') returning id",
        [k.org, b1, k.pets[0]],
      );
      await db.query("update public.care_tasks set status = 'done' where id = $1", [r.rows[0].id]);
      return r.rows[0].id;
    });
    const done = await db.query<{ done_by: string; done_at: string }>("select done_by, done_at from public.care_tasks where id = $1", [t]);
    expect(done.rows[0].done_by).toBe(staff);
    expect(done.rows[0].done_at).not.toBeNull();
    await as(db, user(staff), () => db.query("update public.care_tasks set status = 'pending' where id = $1", [t]));
    const undone = await db.query<{ done_by: string | null }>("select done_by from public.care_tasks where id = $1", [t]);
    expect(undone.rows[0].done_by).toBeNull();
  });
});

describe("solo play", () => {
  it("never lets two pets share a yard, or one pet be in two yards", async () => {
    const k = await seedKennel(db);
    const other = await strangerPet(db, k);
    const b1 = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    const b2 = await book(db, k, { pet: other, start: "2027-04-14", end: "2027-04-17", status: "checked_in" });

    const yards = await as(db, user(k.owner), async () => {
      const r = await db.query<{ id: string }>(
        "insert into public.play_yards (org_id, name) values ($1, 'Yard A'), ($1, 'Yard B') returning id",
        [k.org],
      );
      return r.rows.map((x) => x.id);
    });

    const add = (yard: string, booking: string, pet: string, at: string, minutes = 20) =>
      as(db, user(k.owner), () =>
        db.query(
          "insert into public.play_sessions (org_id, yard_id, booking_id, pet_id, session_date, starts_at, duration_minutes) values ($1, $2, $3, $4, '2027-04-15', $5, $6)",
          [k.org, yard, booking, pet, at, minutes],
        ),
      );

    await add(yards[0], b1, k.pets[0], "07:00");
    // Overlapping in the same yard: refused.
    expect((await errorOf(() => add(yards[0], b2, other, "07:10"))).message).toContain("play_sessions_one_pet_per_yard");
    // Back to back in the same yard: fine.
    await add(yards[0], b2, other, "07:20");
    // Same pet in another yard at the same time: refused.
    expect((await errorOf(() => add(yards[1], b1, k.pets[0], "07:05"))).message).toContain("play_sessions_one_yard_per_pet");
    // A skipped session frees its slot.
    await as(db, user(k.owner), () =>
      db.query("update public.play_sessions set status = 'skipped' where pet_id = $1 and starts_at = '07:00'", [k.pets[0]]),
    );
    await add(yards[0], b1, k.pets[0], "07:00", 15);
  });
});

describe("only owners and managers decide what a stay costs", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let extra: string;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 4, pets: 4 });
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    extra = await as(db, user(k.owner), async () => {
      await db.query("insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'boarding', 'Boarding', 'night', 120000, true)", [k.org]);
      await db.query("insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'daycare', 'Day boarding', 'day', 72000, true)", [k.org]);
      const r = await db.query<{ id: string }>("insert into public.services (org_id, kind, name, price_minor) values ($1, 'addon', 'Grooming', 200000) returning id", [k.org]);
      return r.rows[0].id;
    });
  });

  it("lets staff book at the price on the price list", async () => {
    await book(db, k, { pet: k.pets[0], start: "2027-10-01", end: "2027-10-03", rate: 120000 }, staff);
    await book(db, k, { pet: k.pets[1], start: "2027-10-01", end: "2027-10-01", kind: "daycare", rate: 72000 }, staff);
  });

  it("refuses staff a price that is not on the price list, or a discount", async () => {
    const e = await errorOf(() => book(db, k, { pet: k.pets[2], start: "2027-10-01", end: "2027-10-03", rate: 100000 }, staff));
    expect(e.message).toContain("WB023");
    const d = await errorOf(() =>
      as(db, user(staff), () =>
        db.query(
          `insert into public.bookings (org_id, client_id, pet_id, start_date, end_date, rate_minor, discount_minor)
           values ($1, $2, $3, '2027-10-05', '2027-10-07', 120000, 10000)`,
          [k.org, k.client, k.pets[2]],
        ),
      ),
    );
    expect(d.message).toContain("WB023");
  });

  it("refuses staff changing the price, discount, tax or kind of a booking, but not its dates or notes", async () => {
    const id = await book(db, k, { pet: k.pets[3], start: "2027-10-10", end: "2027-10-12" }, staff);
    for (const change of ["rate_minor = 1", "discount_minor = 100", "tax_rate_bp = 1800", "sac_code = '9986'", "kind = 'daycare'"]) {
      const e = await errorOf(() => as(db, user(staff), () => db.query(`update public.bookings set ${change} where id = $1`, [id])));
      expect(e.message, change).toContain("WB022");
    }
    await as(db, user(staff), () => db.query("update public.bookings set end_date = '2027-10-13', notes = 'Likes the radio' where id = $1", [id]));
    const row = await db.query<{ rate_minor: string; end_date: string }>("select rate_minor, end_date::text from public.bookings where id = $1", [id]);
    expect(Number(row.rows[0].rate_minor)).toBe(120000);
    expect(row.rows[0].end_date).toBe("2027-10-13");
  });

  it("lets a manager turn boarding into day boarding, and then holds the kennel the day-boarding way", async () => {
    const id = await book(db, k, { pet: k.pets[0], start: "2028-02-01", end: "2028-02-02", kennel: k.kennels[0] }, manager);
    // As boarding the stay leaves on 2 February, so another pet may arrive in that kennel that day.
    const next = await book(db, k, { pet: await strangerPet(db, k), start: "2028-02-02", end: "2028-02-04", kennel: k.kennels[0] }, manager);
    // As day boarding it would hold the kennel all of the 2nd too, which that pet now has.
    const e = await errorOf(() => as(db, user(manager), () => db.query("update public.bookings set kind = 'daycare', rate_minor = 72000 where id = $1", [id])));
    expect(e.message).toContain("bookings_no_kennel_overlap");
    await as(db, user(manager), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Test' where id = $1", [next]));
    await as(db, user(manager), () => db.query("update public.bookings set kind = 'daycare', rate_minor = 72000 where id = $1", [id]));
    const row = await db.query<{ kind: string }>("select kind from public.bookings where id = $1", [id]);
    expect(row.rows[0].kind).toBe("daycare");
  });

  it("lets a manager set any price and discount, and records the change in the audit log", async () => {
    const id = await book(db, k, { pet: k.pets[2], start: "2027-11-01", end: "2027-11-04", rate: 99900 }, manager);
    await as(db, user(manager), () => db.query("update public.bookings set rate_minor = 110000, discount_minor = 5000 where id = $1", [id]));
    await as(db, user(k.owner), async () => {
      const log = await db.query<{ old_data: Record<string, unknown>; new_data: Record<string, unknown>; actor: string }>(
        "select old_data, new_data, actor from public.audit_log where table_name = 'bookings' and row_id = $1 and action = 'update'",
        [id],
      );
      expect(log.rows[0].actor).toBe(manager);
      expect(Number(log.rows[0].old_data.rate_minor)).toBe(99900);
      expect(Number(log.rows[0].new_data.rate_minor)).toBe(110000);
    });
  });

  it("lets staff add an extra at its listed price, or a one-off item, and nothing cheaper", async () => {
    const id = await book(db, k, { pet: k.pets[0], start: "2027-12-01", end: "2027-12-03" }, staff);
    const add = (service: string | null, price: number, actor = staff) =>
      as(db, user(actor), () =>
        db.query<{ id: string }>(
          "insert into public.booking_items (org_id, booking_id, service_id, description, unit_price_minor) values ($1, $2, $3, 'Extra', $4) returning id",
          [k.org, id, service, price],
        ),
      );
    const listed = (await add(extra, 200000)).rows[0].id;
    await add(null, 150000); // a vet bill paid for the parent
    expect((await errorOf(() => add(extra, 100000))).message).toContain("WB023");
    expect((await errorOf(() => as(db, user(staff), () => db.query("update public.booking_items set unit_price_minor = 1 where id = $1", [listed])))).message).toContain("WB025");
    expect((await errorOf(() => as(db, user(staff), () => db.query("update public.booking_items set quantity = 0.5 where id = $1", [listed])))).message).toContain("WB025");
    // Removing an extra is for managers.
    await as(db, user(staff), () => db.query("delete from public.booking_items where id = $1", [listed]));
    const still = await db.query<{ n: number }>("select count(*)::int as n from public.booking_items where id = $1", [listed]);
    expect(still.rows[0].n).toBe(1);
    await add(extra, 1, manager);
  });

  it("adds up the extras on a booking", async () => {
    const id = await book(db, k, { pet: k.pets[1], start: "2028-01-10", end: "2028-01-13" }, staff);
    await as(db, user(staff), async () => {
      await db.query(
        "insert into public.booking_items (org_id, booking_id, service_id, description, unit_price_minor, quantity) values ($1, $2, $3, 'Grooming', 200000, 2)",
        [k.org, id, extra],
      );
      await db.query("insert into public.booking_items (org_id, booking_id, description, unit_price_minor) values ($1, $2, 'Pick-up', 50000)", [k.org, id]);
      const sum = await db.query<{ total: string }>(
        "select sum(round(quantity * unit_price_minor))::bigint as total from public.booking_items where org_id = $1 and booking_id = $2",
        [k.org, id],
      );
      expect(Number(sum.rows[0].total)).toBe(450000);
    });
  });
});

describe("families, requests and overstays", () => {
  let k: Kennel;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 2, pets: 3 });
  });

  it("books several pets of one parent together, and refuses another parent's pet in the group", async () => {
    const group = "00000000-0000-4000-8000-000000000001";
    await as(db, user(k.owner), () =>
      db.query(
        `insert into public.bookings (org_id, client_id, pet_id, start_date, end_date, rate_minor, group_id)
         values ($1, $2, $3, '2027-06-01', '2027-06-04', 120000, $5), ($1, $2, $4, '2027-06-01', '2027-06-04', 120000, $5)`,
        [k.org, k.client, k.pets[0], k.pets[1], group],
      ),
    );
    const together = await db.query<{ n: number }>("select count(*)::int as n from public.bookings where group_id = $1", [group]);
    expect(together.rows[0].n).toBe(2);

    const otherParent = await as(db, user(k.owner), async () => {
      const c = await db.query<{ id: string }>("insert into public.clients (org_id, full_name, phone) values ($1, 'Someone else', '+919222200000') returning id", [k.org]);
      const p = await db.query<{ id: string }>("insert into public.pets (org_id, client_id, name) values ($1, $2, 'Stranger') returning id", [k.org, c.rows[0].id]);
      return { client: c.rows[0].id, pet: p.rows[0].id };
    });
    const e = await errorOf(() =>
      as(db, user(k.owner), () =>
        db.query(
          `insert into public.bookings (org_id, client_id, pet_id, start_date, end_date, rate_minor, group_id)
           values ($1, $2, $3, '2027-07-01', '2027-07-04', 120000, $4)`,
          [k.org, otherParent.client, otherParent.pet, group],
        ),
      ),
    );
    expect(e.message).toContain("WB024");
  });

  it("lets a request sit in a taken kennel without holding it, and refuses to confirm it there", async () => {
    await book(db, k, { pet: k.pets[0], start: "2027-08-01", end: "2027-08-05", kennel: k.kennels[0] });
    const request = await book(db, k, { pet: await strangerPet(db, k), start: "2027-08-02", end: "2027-08-04", kennel: k.kennels[0], status: "requested" });
    // The request does not hold space: the other kennel can still take a confirmed booking for those nights.
    await book(db, k, { pet: k.pets[2], start: "2027-08-02", end: "2027-08-04", kennel: k.kennels[1] });
    const e = await errorOf(() => as(db, user(k.owner), () => db.query("update public.bookings set status = 'confirmed' where id = $1", [request])));
    expect(e.code).toBe("23P01");
  });

  it("extends an overstaying pet to today, unless its kennel is promised to someone else", async () => {
    const stay = await book(db, k, { pet: k.pets[0], start: "2027-09-01", end: "2027-09-03", kennel: k.kennels[0], status: "checked_in" });
    await book(db, k, { pet: await strangerPet(db, k), start: "2027-09-05", end: "2027-09-07", kennel: k.kennels[0] });
    // Two days late, the kennel is free until the 5th: fine.
    await as(db, user(k.owner), () => db.query("update public.bookings set end_date = '2027-09-05' where id = $1", [stay]));
    // One more day runs into the next pet's stay: refused, and nothing changes.
    const e = await errorOf(() => as(db, user(k.owner), () => db.query("update public.bookings set end_date = '2027-09-06' where id = $1", [stay])));
    expect(e.message).toContain("bookings_no_kennel_overlap");
    const row = await db.query<{ end_date: string }>("select end_date::text from public.bookings where id = $1", [stay]);
    expect(row.rows[0].end_date).toBe("2027-09-05");
  });

  it("stamps who confirmed the vaccinations at check-in, whatever the app sends", async () => {
    const staff = await addMember(db, k, "staff");
    const id = await book(db, k, { pet: k.pets[2], start: "2027-10-01", end: "2027-10-03" });
    await as(db, user(staff), () =>
      db.query(
        "update public.bookings set status = 'checked_in', vaccinations_checked_at = '2000-01-01', gate_notes = 'New food', belongings = 'Bed' where id = $1",
        [id],
      ),
    );
    const row = await db.query<{ by: string; at: string }>("select vaccinations_checked_by as by, vaccinations_checked_at::text as at from public.bookings where id = $1", [id]);
    expect(row.rows[0].by).toBe(staff);
    expect(row.rows[0].at.startsWith("2000")).toBe(false);
  });
});
