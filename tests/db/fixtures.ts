import type { PGlite } from "@electric-sql/pglite";
import { as, createOrg, createUser, user } from "./harness";

export interface Kennel {
  owner: string;
  org: string;
  kennels: string[];
  client: string;
  pets: string[];
}

let counter = 0;

/**
 * A ready-made kennel business: an owner, an organisation, some kennels, one
 * client and some pets. Everything is created as the owner through the same
 * paths the app uses, so fixtures also exercise row level security.
 */
export async function seedKennel(db: PGlite, opts: { kennels?: number; pets?: number } = {}): Promise<Kennel> {
  const n = ++counter;
  const owner = await createUser(db, `owner${n}@example.test`);
  const org = await createOrg(db, owner, `Test Kennel ${n}`, `test-kennel-${n}`);

  return as(db, user(owner), async () => {
    const kennels: string[] = [];
    for (let i = 1; i <= (opts.kennels ?? 2); i++) {
      const r = await db.query<{ id: string }>(
        "insert into public.kennels (org_id, name, sort_order) values ($1, $2, $3) returning id",
        [org, `K${String(i).padStart(2, "0")}`, i],
      );
      kennels.push(r.rows[0].id);
    }
    const c = await db.query<{ id: string }>(
      "insert into public.clients (org_id, full_name, phone) values ($1, $2, $3) returning id",
      [org, `Parent ${n}`, `+9198765${String(10000 + n).slice(-5)}`],
    );
    const client = c.rows[0].id;
    const pets: string[] = [];
    for (let i = 1; i <= (opts.pets ?? 3); i++) {
      const p = await db.query<{ id: string }>(
        "insert into public.pets (org_id, client_id, name) values ($1, $2, $3) returning id",
        [org, client, `Dog ${n}-${i}`],
      );
      pets.push(p.rows[0].id);
    }
    return { owner, org, kennels, client, pets };
  });
}

/**
 * Add a working member with a role, the way it really happens: an owner
 * invites them by email, and they accept.
 */
export async function addMember(db: PGlite, k: Kennel, role: "owner" | "manager" | "staff"): Promise<string> {
  const id = await inviteMember(db, k, role);
  await as(db, user(id), () => db.query("select public.respond_to_invitation($1, true)", [k.org]));
  return id;
}

/** Create an account and invite it, without accepting. Returns the invited user's id. */
export async function inviteMember(db: PGlite, k: Kennel, role: "owner" | "manager" | "staff", inviter: string = k.owner): Promise<string> {
  const email = `${role}${++counter}@example.test`;
  const id = await createUser(db, email);
  await as(db, user(inviter), () =>
    db.query("select public.invite_member_by_email($1, $2, $3, $4)", [k.org, email, role, `A ${role}`]),
  );
  return id;
}

export interface BookingInput {
  pet: string;
  start: string;
  end: string;
  kennel?: string | null;
  kind?: "boarding" | "daycare";
  status?: string;
  rate?: number;
}

/** Book a pet, for its own parent. */
export async function book(db: PGlite, k: Kennel, b: BookingInput, actor: string = k.owner): Promise<string> {
  return as(db, user(actor), async () => {
    const r = await db.query<{ id: string }>(
      `insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor)
       select $1, p.client_id, p.id, $3, $4, $5, $6, $7, $8 from public.pets p where p.org_id = $1 and p.id = $2 returning id`,
      [k.org, b.pet, b.kind ?? "boarding", b.status ?? "confirmed", b.start, b.end, b.kennel ?? null, b.rate ?? 120000],
    );
    return r.rows[0].id;
  });
}

/**
 * A pet of another parent. The pets of seedKennel() are siblings, and
 * siblings may share a kennel and a yard; a stranger's pet may not.
 */
export async function strangerPet(db: PGlite, k: Kennel): Promise<string> {
  const n = ++counter;
  return as(db, user(k.owner), async () => {
    const c = await db.query<{ id: string }>(
      "insert into public.clients (org_id, full_name, phone) values ($1, $2, $3) returning id",
      [k.org, `Other parent ${n}`, `+9197654${String(10000 + n).slice(-5)}`],
    );
    const p = await db.query<{ id: string }>(
      "insert into public.pets (org_id, client_id, name) values ($1, $2, $3) returning id",
      [k.org, c.rows[0].id, `Other dog ${n}`],
    );
    return p.rows[0].id;
  });
}
