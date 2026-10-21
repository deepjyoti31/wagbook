import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Roadmap M25: groundwork for more than boarding (D44). What the kennel
 * offers, parents' addresses, the areas served, people's skills, and weights.
 */

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

const run = (actor: string, sql: string, params: unknown[] = []) => as(db, user(actor), () => db.query(sql, params));
const rows = async <T,>(actor: string, sql: string, params: unknown[] = []) =>
  as(db, user(actor), async () => (await db.query<T>(sql, params)).rows);
const fails = (actor: string, sql: string, params: unknown[] = []) => errorOf(() => run(actor, sql, params));

describe("what the kennel offers", () => {
  let k: Kennel;
  beforeAll(async () => {
    k = await seedKennel(db);
  });

  it("is all off for a new kennel", async () => {
    const [o] = await rows<Record<string, boolean>>(k.owner, "select offers_appointments, offers_kitchen, offers_food_delivery from public.organizations where id = $1", [k.org]);
    expect(o).toEqual({ offers_appointments: false, offers_kitchen: false, offers_food_delivery: false });
  });

  it("delivers food only from its own kitchen", async () => {
    const e = await fails(k.owner, "update public.organizations set offers_food_delivery = true where id = $1", [k.org]);
    expect(e.message).toContain("organizations_delivery_needs_kitchen");
    await run(k.owner, "update public.organizations set offers_kitchen = true, offers_food_delivery = true where id = $1", [k.org]);
    const e2 = await fails(k.owner, "update public.organizations set offers_kitchen = false where id = $1", [k.org]);
    expect(e2.message).toContain("organizations_delivery_needs_kitchen");
  });

  it("is switched by owners and managers, not staff", async () => {
    const staff = await addMember(db, k, "staff");
    const changed = await rows(staff, "update public.organizations set offers_appointments = true where id = $1 returning id", [k.org]);
    expect(changed).toHaveLength(0);
    const manager = await addMember(db, k, "manager");
    expect(await rows(manager, "update public.organizations set offers_appointments = true where id = $1 returning id", [k.org])).toHaveLength(1);
  });

  it("tells the intake form whether to ask for an address", async () => {
    const [{ slug }] = await rows<{ slug: string }>(k.owner, "select slug from public.organizations where id = $1", [k.org]);
    const [{ v }] = await as(db, { kind: "anon" }, async () =>
      (await db.query<{ v: { delivers: boolean } }>("select public.get_public_intake_form($1) as v", [slug])).rows,
    );
    expect(v.delivers).toBe(true);
  });
});

describe("a parent's addresses", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let address: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
  });

  it("are added by anyone, with a PIN code, and stamped with who added them", async () => {
    const [a] = await rows<{ id: string; created_by: string }>(
      staff,
      "insert into public.client_addresses (org_id, client_id, line, area, postal_code) values ($1, $2, '12 First Cross', 'Indiranagar', '560038') returning id, created_by",
      [k.org, k.client],
    );
    address = a.id;
    expect(a.created_by).toBe(staff);
    const bad = await fails(staff, "insert into public.client_addresses (org_id, client_id, line, postal_code) values ($1, $2, 'x', '5')", [k.org, k.client]);
    expect(bad.message).toContain("client_addresses_postal_code_check");
    const map = await fails(staff, "insert into public.client_addresses (org_id, client_id, line, postal_code, map_url) values ($1, $2, 'x', '560038', 'javascript:alert(1)')", [k.org, k.client]);
    expect(map.message).toContain("client_addresses_map_url_check");
  });

  it("are changed only by owners and managers, and deleted only by owners", async () => {
    expect(await rows(staff, "update public.client_addresses set line = 'Moved' where id = $1 returning id", [address])).toHaveLength(0);
    expect(await rows(manager, "update public.client_addresses set door_note = 'Ring twice' where id = $1 returning id", [address])).toHaveLength(1);
    expect(await rows(manager, "delete from public.client_addresses where id = $1 returning id", [address])).toHaveLength(0);
  });

  it("come from the intake form for a new parent, but never rewrite a known one's", async () => {
    const [{ slug }] = await rows<{ slug: string }>(k.owner, "select slug from public.organizations where id = $1", [k.org]);
    const send = (phone: string, postal: string) =>
      as(db, { kind: "anon" }, () =>
        db.query("select public.submit_intake($1, $2)", [
          slug,
          { v: 1, consent: true, parent: { name: "New Parent", phone, address: "7 Lake View", area: "Domlur", postal_code: postal }, pets: [{ name: "Max" }], stay: {} },
        ]),
      );
    await send("+919822200011", "560071");
    await send("+919822200012", "not a pin");
    const ids = await rows<{ id: string }>(staff, "select id from public.intake_submissions where org_id = $1 and parent_phone like '+9198222000%' order by parent_phone", [k.org]);
    const clients: string[] = [];
    for (const s of ids) clients.push((await rows<{ id: string }>(staff, "select public.accept_intake($1) as id", [s.id]))[0].id);
    const made = await rows<{ client_id: string; kind: string; line: string; area: string; postal_code: string }>(
      k.owner, "select client_id, kind, line, area, postal_code from public.client_addresses where client_id = any($1)", [clients],
    );
    expect(made).toEqual([{ client_id: clients[0], kind: "home", line: "7 Lake View", area: "Domlur", postal_code: "560071" }]);
  });

  it("never point at another kennel's parent", async () => {
    const other = await seedKennel(db);
    const e = await fails(k.owner, "insert into public.client_addresses (org_id, client_id, line, postal_code) values ($1, $2, 'x', '560038')", [k.org, other.client]);
    expect(e.message).toMatch(/foreign key|violates/);
    expect(await rows(other.owner, "select id from public.client_addresses where org_id = $1", [k.org])).toHaveLength(0);
  });

  it("are in the parent's export, move when parents merge, and go when the parent is erased", async () => {
    const [{ e }] = await rows<{ e: { addresses: { line: string }[] } }>(k.owner, "select public.export_client($1) as e", [k.client]);
    expect(e.addresses.map((a) => a.line)).toEqual(["12 First Cross"]);

    const [{ id: twin }] = await rows<{ id: string }>(k.owner, "insert into public.clients (org_id, full_name, phone) values ($1, 'Twin', '+919811100099') returning id", [k.org]);
    await run(k.owner, "insert into public.client_addresses (org_id, client_id, kind, line, postal_code) values ($1, $2, 'work', 'Office park', '560103')", [k.org, twin]);
    await run(k.owner, "select public.merge_clients($1, $2)", [k.client, twin]);
    const kept = await rows<{ kind: string }>(k.owner, "select kind from public.client_addresses where client_id = $1 order by kind", [k.client]);
    expect(kept.map((a) => a.kind)).toEqual(["home", "work"]);

    await run(k.owner, "select public.erase_client($1)", [k.client]);
    expect(await rows(k.owner, "select id from public.client_addresses where client_id = $1", [k.client])).toHaveLength(0);
  });
});

describe("areas served", () => {
  let k: Kennel;
  let staff: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
  });

  it("are set by owners and managers, one row a PIN code, with a charge that is never negative", async () => {
    await run(k.owner, "insert into public.service_areas (org_id, postal_code, name, delivery_charge_minor) values ($1, '560038', 'Indiranagar', 5000)", [k.org]);
    const twice = await fails(k.owner, "insert into public.service_areas (org_id, postal_code, name) values ($1, '560038', 'Again')", [k.org]);
    expect(twice.message).toContain("service_areas_org_id_postal_code_key");
    const negative = await fails(k.owner, "insert into public.service_areas (org_id, postal_code, name, delivery_charge_minor) values ($1, '560001', 'Centre', -1)", [k.org]);
    expect(negative.message).toContain("service_areas_delivery_charge_minor_check");
    const byStaff = await fails(staff, "insert into public.service_areas (org_id, postal_code, name) values ($1, '560002', 'X')", [k.org]);
    expect(byStaff.message).toMatch(/row-level security/);
    expect(await rows(staff, "select name from public.service_areas where org_id = $1", [k.org])).toEqual([{ name: "Indiranagar" }]);
  });
});

describe("people's skills", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
  });

  it("are set by owners and managers, from the list, and not by staff on themselves", async () => {
    expect(await rows(manager, "update public.memberships set skills = '{cook,rider}' where org_id = $1 and user_id = $2 returning user_id", [k.org, staff])).toHaveLength(1);
    expect(await rows(staff, "update public.memberships set skills = '{groomer}' where org_id = $1 and user_id = $2 returning user_id", [k.org, staff])).toHaveLength(0);
    const odd = await fails(manager, "update public.memberships set skills = '{juggler}' where org_id = $1 and user_id = $2", [k.org, staff]);
    expect(odd.message).toMatch(/invalid input value for enum/);
    const [{ skills }] = await rows<{ skills: string }>(k.owner, "select skills::text from public.memberships where org_id = $1 and user_id = $2", [k.org, staff]);
    expect(skills).toBe("{cook,rider}");
  });
});

describe("weights", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let pet: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    pet = k.pets[0];
  });

  const latest = async () => (await rows<{ weight_g: number | null }>(k.owner, "select weight_g from public.pets where id = $1", [pet]))[0].weight_g;

  it("are whole grams, weighed by anyone, and the pet carries the latest", async () => {
    await run(staff, "insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g) values ($1, $2, '2027-01-10', 34500)", [k.org, pet]);
    await run(staff, "insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g, body_condition) values ($1, $2, '2027-02-10', 33800, 6)", [k.org, pet]);
    // An older weighing written down later does not become the latest.
    await run(staff, "insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g) values ($1, $2, '2026-12-01', 36000)", [k.org, pet]);
    expect(await latest()).toBe(33800);
    const zero = await fails(staff, "insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g) values ($1, $2, '2027-03-01', 0)", [k.org, pet]);
    expect(zero.message).toContain("pet_weights_weight_g_check");
    const score = await fails(staff, "insert into public.pet_weights (org_id, pet_id, weighed_on, weight_g, body_condition) values ($1, $2, '2027-03-01', 30000, 10)", [k.org, pet]);
    expect(score.message).toContain("pet_weights_body_condition_check");
  });

  it("cannot be written onto the pet by hand", async () => {
    await run(staff, "update public.pets set weight_g = 1, target_weight_g = 32000 where id = $1", [pet]);
    const [p] = await rows<{ weight_g: number; target_weight_g: number }>(k.owner, "select weight_g, target_weight_g from public.pets where id = $1", [pet]);
    expect(p).toEqual({ weight_g: 33800, target_weight_g: 32000 });
  });

  it("are corrected by owners and managers, removed by owners, and the pet follows", async () => {
    const [w] = await rows<{ id: string }>(k.owner, "select id from public.pet_weights where pet_id = $1 and weighed_on = '2027-02-10'", [pet]);
    expect(await rows(staff, "update public.pet_weights set weight_g = 33000 where id = $1 returning id", [w.id])).toHaveLength(0);
    expect(await rows(manager, "update public.pet_weights set weight_g = 33000 where id = $1 returning id", [w.id])).toHaveLength(1);
    expect(await latest()).toBe(33000);
    expect(await rows(manager, "delete from public.pet_weights where id = $1 returning id", [w.id])).toHaveLength(0);
    expect(await rows(k.owner, "delete from public.pet_weights where id = $1 returning id", [w.id])).toHaveLength(1);
    expect(await latest()).toBe(34500);
  });

  it("are in the parent's export, with the pet", async () => {
    const [{ e }] = await rows<{ e: { pets: { id: string; weights: { weight_g: number }[] }[] } }>(k.owner, "select public.export_client($1) as e", [k.client]);
    expect(e.pets.find((p) => p.id === pet)!.weights.map((w) => w.weight_g)).toEqual([36000, 34500]);
  });
});
