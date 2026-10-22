import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createTestDb, createUser, errorOf, user } from "./harness";

let db: PGlite;
let a: Kennel;
let b: Kennel;

beforeAll(async () => {
  db = await createTestDb();
  a = await seedKennel(db);
  b = await seedKennel(db);
});
afterAll(() => db.close());

describe("every table is locked down", () => {
  it("has row level security on, with at least one policy unless it is deliberately sealed", async () => {
    const res = await db.query<{ table: string; rls: boolean; policies: number }>(`
      select c.relname as table, c.relrowsecurity as rls,
             (select count(*)::int from pg_policy p where p.polrelid = c.oid) as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 1`);
    // Tables nobody may touch directly: only SECURITY DEFINER functions do.
    const sealed = new Set(["invoice_counters", "recovery_codes"]);
    for (const t of res.rows) {
      expect(t.rls, `${t.table} must have row level security enabled`).toBe(true);
      if (!sealed.has(t.table)) expect(t.policies, `${t.table} needs policies`).toBeGreaterThan(0);
    }
  });

  it("gives the anonymous role no privilege on any table, view or sequence", async () => {
    const res = await db.query<{ name: string }>(`
      select c.relname as name
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'S')
        and (has_table_privilege('anon', c.oid, 'select')
          or (c.relkind <> 'S' and (has_table_privilege('anon', c.oid, 'insert')
            or has_table_privilege('anon', c.oid, 'update')
            or has_table_privilege('anon', c.oid, 'delete'))))`);
    expect(res.rows).toEqual([]);
  });

  it("lets the anonymous role run exactly the twelve public functions and nothing else", async () => {
    const res = await db.query<{ name: string }>(`
      select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
      order by 1`);
    expect(res.rows.map((r) => r.name)).toEqual([
      // A known parent's own booking link: see docs/05-security-and-privacy.md.
      "food_order_paid",
      "get_public_booking_form",
      // The kennel's food order page (M32): see docs/05-security-and-privacy.md.
      "get_public_food_form",
      "get_public_intake_form",
      "get_public_invoice",
      "get_public_stay",
      // Only reached through Storage, for a certificate sent with an intake form; see docs/05-security-and-privacy.md.
      "intake_upload_allowed",
      // Only reached through Storage, for photos on a stay page; see docs/05-security-and-privacy.md.
      "stay_media_visible",
      "submit_booking_request",
      "submit_food_order",
      // A known parent's changes to their food, from their own link.
      "submit_food_request",
      "submit_intake",
    ]);
  });

  it("gives every SECURITY DEFINER function an empty search_path", async () => {
    const res = await db.query<{ name: string; config: string[] | null }>(`
      select p.proname as name, p.proconfig as config
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef`);
    expect(res.rows.length).toBeGreaterThan(5);
    for (const f of res.rows) {
      expect(f.config ?? [], `${f.name} must set search_path = ''`).toContain('search_path=""');
    }
  });

  it("makes every view obey the caller's row level security", async () => {
    const res = await db.query<{ name: string; options: string[] | null }>(`
      select c.relname as name, c.reloptions as options
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'`);
    for (const v of res.rows) expect(v.options ?? [], `${v.name} must be security_invoker`).toContain("security_invoker=true");
  });
});

describe("tenant isolation", () => {
  const tables = [
    "organizations", "memberships", "clients", "pets", "vaccinations", "kennels", "services", "peak_periods",
    "bookings", "booking_items", "care_items", "care_tasks", "play_yards", "play_sessions", "stay_updates",
    "incidents", "invoices", "invoice_lines", "credit_notes", "credit_note_lines", "reminders_sent", "day_packs", "passes", "payments", "expenses", "intake_submissions", "audit_log",
    "appointment_places", "appointment_services", "appointment_service_prices", "appointments", "appointment_items", "pet_grooming",
    "courses", "packages", "package_parts",
    "trips", "required_vaccines", "health_overrides", "cancellation_rules", "credits", "credit_uses",
    "kennel_service", "shifts", "rota", "leave_requests", "attendance",
  ];

  it("shows a member only their own organisation's rows, in every table", async () => {
    await book(db, a, { pet: a.pets[0], start: "2027-05-01", end: "2027-05-03", kennel: a.kennels[0] });
    await book(db, b, { pet: b.pets[0], start: "2027-05-01", end: "2027-05-03", kennel: b.kennels[0] });

    await as(db, user(a.owner), async () => {
      for (const t of tables) {
        const col = t === "organizations" ? "id" : "org_id";
        const res = await db.query<{ n: number }>(`select count(*)::int as n from public.${t} where ${col} <> $1`, [a.org]);
        expect(res.rows[0].n, `${t} leaked another organisation's rows`).toBe(0);
      }
      const mine = await db.query<{ n: number }>("select count(*)::int as n from public.bookings");
      expect(mine.rows[0].n).toBe(1);
    });
  });

  it("shows a signed-in user with no membership nothing at all", async () => {
    const stranger = await createUser(db, "stranger@example.test");
    await as(db, user(stranger), async () => {
      for (const t of tables) {
        const res = await db.query<{ n: number }>(`select count(*)::int as n from public.${t}`);
        expect(res.rows[0].n, `${t} is visible to a stranger`).toBe(0);
      }
    });
  });

  it("refuses to write into another organisation", async () => {
    const e1 = await errorOf(() =>
      as(db, user(a.owner), () =>
        db.query("insert into public.clients (org_id, full_name, phone) values ($1, 'Intruder', '+919000000001')", [b.org]),
      ),
    );
    expect(e1.code).toBe("42501");

    await as(db, user(a.owner), async () => {
      const upd = await db.query("update public.clients set full_name = 'Hacked' where org_id = $1", [b.org]);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query("delete from public.kennels where org_id = $1", [b.org]);
      expect(del.affectedRows).toBe(0);
    });
  });

  it("refuses to link a row to a parent in another organisation", async () => {
    // A's owner tries to attach a pet to B's client while claiming org A.
    const e = await errorOf(() =>
      as(db, user(a.owner), () =>
        db.query("insert into public.pets (org_id, client_id, name) values ($1, $2, 'Smuggled')", [a.org, b.client]),
      ),
    );
    expect(e.code).toBe("23503");
  });

  it("cuts off a deactivated member at once", async () => {
    const staff = await addMember(db, a, "staff");
    await as(db, user(staff), async () => {
      expect((await db.query("select 1 from public.clients")).rows.length).toBeGreaterThan(0);
    });
    await as(db, user(a.owner), () =>
      db.query("update public.memberships set is_active = false where org_id = $1 and user_id = $2", [a.org, staff]),
    );
    await as(db, user(staff), async () => {
      expect((await db.query("select 1 from public.clients")).rows.length).toBe(0);
    });
  });

  it("gives the anonymous role nothing from tables", async () => {
    const e = await errorOf(() => as(db, anon, () => db.query("select * from public.clients")));
    expect(e.code).toBe("42501");
  });
});

describe("roles", () => {
  let staff: string;
  let manager: string;

  beforeAll(async () => {
    staff = await addMember(db, a, "staff");
    manager = await addMember(db, a, "manager");
  });

  it("lets staff run the day but not change the rate card, kennels or settings", async () => {
    await as(db, user(staff), async () => {
      await db.query("insert into public.clients (org_id, full_name, phone) values ($1, 'Walk In', '+919000000002')", [a.org]);
    });
    for (const sql of [
      "insert into public.services (org_id, kind, name, price_minor) values ($1, 'addon', 'Free stuff', 0)",
      "insert into public.kennels (org_id, name) values ($1, 'Secret kennel')",
      "insert into public.expenses (org_id, spent_on, category, amount_minor) values ($1, '2027-05-01', 'misc', 100)",
    ]) {
      const e = await errorOf(() => as(db, user(staff), () => db.query(sql, [a.org])));
      expect(e.code, sql).toBe("42501");
    }
    await as(db, user(staff), async () => {
      const upd = await db.query("update public.organizations set name = 'Renamed by staff' where id = $1", [a.org]);
      expect(upd.affectedRows).toBe(0);
      const del = await db.query("delete from public.clients where org_id = $1", [a.org]);
      expect(del.affectedRows).toBe(0);
      expect((await db.query("select 1 from public.audit_log")).rows.length).toBe(0);
      expect((await db.query("select 1 from public.expenses")).rows.length).toBe(0);
    });
  });

  it("lets staff add a routine for one pet but not a house routine", async () => {
    await as(db, user(staff), () =>
      db.query(
        "insert into public.care_items (org_id, pet_id, kind, label, due_time) values ($1, $2, 'medication', 'Tablet', '08:00')",
        [a.org, a.pets[0]],
      ),
    );
    const e = await errorOf(() =>
      as(db, user(staff), () =>
        db.query("insert into public.care_items (org_id, kind, label, due_time) values ($1, 'meal', 'Breakfast', '09:00')", [a.org]),
      ),
    );
    expect(e.code).toBe("42501");
  });

  it("lets a manager manage staff but never create or touch an owner", async () => {
    await as(db, user(manager), async () => {
      await db.query("insert into public.services (org_id, kind, name, price_minor) values ($1, 'addon', 'Grooming', 200000)", [a.org]);
      const demoteOwner = await db.query(
        "update public.memberships set role = 'staff' where org_id = $1 and user_id = $2",
        [a.org, a.owner],
      );
      expect(demoteOwner.affectedRows).toBe(0);
    });
    const promote = await errorOf(() =>
      as(db, user(manager), () =>
        db.query("update public.memberships set role = 'owner' where org_id = $1 and user_id = $2", [a.org, staff]),
      ),
    );
    expect(promote.code).toBe("42501");
    const viaFunction = await errorOf(() =>
      as(db, user(manager), () =>
        db.query("select public.invite_member_by_email($1, 'owner1@example.test', 'owner', 'X')", [a.org]),
      ),
    );
    expect(viaFunction.message).toContain("WB002");
  });

  it("does not let staff add people", async () => {
    const e = await errorOf(() =>
      as(db, user(staff), () => db.query("select public.invite_member_by_email($1, 'owner2@example.test', 'staff', 'X')", [a.org])),
    );
    expect(e.message).toContain("WB002");
  });

  it("never leaves an organisation without an owner", async () => {
    const e1 = await errorOf(() =>
      as(db, user(a.owner), () =>
        db.query("update public.memberships set role = 'manager' where org_id = $1 and user_id = $2", [a.org, a.owner]),
      ),
    );
    expect(e1.message).toContain("WB011");
    const e2 = await errorOf(() =>
      as(db, user(a.owner), () => db.query("delete from public.memberships where org_id = $1 and user_id = $2", [a.org, a.owner])),
    );
    expect(e2.message).toContain("WB011");
  });

  it("lets an owner delete the organisation and everything in it", async () => {
    const c = await seedKennel(db);
    const booking = await book(db, c, { pet: c.pets[0], start: "2027-06-01", end: "2027-06-04", kennel: c.kennels[0] });
    await as(db, user(c.owner), async () => {
      await db.query(
        "insert into public.payments (org_id, client_id, booking_id, amount_minor, method, received_on) values ($1, $2, $3, 50000, 'upi', '2027-06-01')",
        [c.org, c.client, booking],
      );
      const del = await db.query("delete from public.organizations where id = $1", [c.org]);
      expect(del.affectedRows).toBe(1);
    });
    const left = await db.query<{ n: number }>("select count(*)::int as n from public.bookings where org_id = $1", [c.org]);
    expect(left.rows[0].n).toBe(0);
    const audit = await db.query<{ n: number }>("select count(*)::int as n from public.audit_log where org_id = $1", [c.org]);
    expect(audit.rows[0].n).toBe(0);
  });
});

describe("file storage", () => {
  it("keeps each organisation's files to itself", async () => {
    await as(db, user(a.owner), async () => {
      await db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [`${a.org}/pets/x/profile.jpg`]);
    });
    const e = await errorOf(() =>
      as(db, user(a.owner), () =>
        db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [`${b.org}/pets/x/profile.jpg`]),
      ),
    );
    expect(e.code).toBe("42501");
    const e2 = await errorOf(() =>
      as(db, user(a.owner), () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', 'loose.jpg')")),
    );
    expect(e2.code).toBe("42501");
    await as(db, user(b.owner), async () => {
      expect((await db.query("select 1 from storage.objects")).rows.length).toBe(0);
    });
  });
});
