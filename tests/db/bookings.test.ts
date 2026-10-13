import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

describe("double booking is impossible", () => {
  let k: Kennel;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 3, pets: 4 });
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
      const outside = await db.query<{ n: number }>("select public.generate_care_tasks($1, '2027-04-18') as n", [k.org]);
      expect(outside.rows[0].n).toBe(0);

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
    const b1 = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    const b2 = await book(db, k, { pet: k.pets[1], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });

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
    expect((await errorOf(() => add(yards[0], b2, k.pets[1], "07:10"))).message).toContain("play_sessions_one_pet_per_yard");
    // Back to back in the same yard: fine.
    await add(yards[0], b2, k.pets[1], "07:20");
    // Same pet in another yard at the same time: refused.
    expect((await errorOf(() => add(yards[1], b1, k.pets[0], "07:05"))).message).toContain("play_sessions_one_yard_per_pet");
    // A skipped session frees its slot.
    await as(db, user(k.owner), () =>
      db.query("update public.play_sessions set status = 'skipped' where pet_id = $1 and starts_at = '07:00'", [k.pets[0]]),
    );
    await add(yards[0], b1, k.pets[0], "07:00", 15);
  });
});
