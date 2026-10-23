import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { shoppingList } from "@/lib/core";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Roadmap M63: orders to suppliers. Stock goes in on receiving, not on
 * ordering, in full or in part and never more than is still to come; the
 * supplier's bill is an expense, once; and what is still to come is taken off
 * the kitchen's shopping list.
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

const onHand = async (actor: string, item: string) =>
  Number((await rows<{ on_hand: string }>(actor, "select on_hand from public.stock_levels where item_id = $1", [item]))[0].on_hand);
const onOrder = async (actor: string, k: Kennel) =>
  new Map((await rows<{ item_id: string; on_order: string }>(actor, "select item_id, on_order from public.stock_on_order where org_id = $1", [k.org])).map((r) => [r.item_id, Number(r.on_order)]));

describe("orders to suppliers", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let butcher: string;
  let chicken: string;
  let rice: string;
  let order: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    [{ id: butcher }] = await rows<{ id: string }>(k.owner, "insert into public.suppliers (org_id, name, phone) values ($1, 'Butcher', '+919800000001') returning id", [k.org]);
    [{ id: chicken }] = await rows<{ id: string }>(k.owner, "insert into public.stock_items (org_id, name, unit, kind, supplier_id) values ($1, 'Chicken', 'g', 'meat', $2) returning id", [k.org, butcher]);
    [{ id: rice }] = await rows<{ id: string }>(k.owner, "insert into public.stock_items (org_id, name, unit, kind) values ($1, 'Rice', 'g', 'grain') returning id", [k.org]);
  });

  it("is placed by owners and managers, and puts nothing in stock", async () => {
    const lines = JSON.stringify([{ item_id: chicken, quantity: 5000 }, { item_id: rice, quantity: 2000 }]);
    const e = await fails(staff, "select public.place_supplier_order($1, $2, $3)", [k.org, butcher, lines]);
    expect(e.message).toMatch(/row-level security/);
    [{ id: order }] = await rows<{ id: string }>(manager, "select public.place_supplier_order($1, $2, $3, 'By Friday') as id", [k.org, butcher, lines]);
    expect(await onHand(staff, chicken)).toBe(0);
    expect(await onOrder(staff, k)).toEqual(new Map([[chicken, 5000], [rice, 2000]]));
    expect((await fails(manager, "select public.place_supplier_order($1, $2, '[]')", [k.org, butcher])).message).toContain("WB289");
    // Its lines are never changed.
    expect((await fails(k.owner, "update public.supplier_order_lines set quantity = 1 where order_id = $1", [order])).message).toMatch(/permission denied/);
  });

  it("stops the shopping list asking for what is on an order not yet received", async () => {
    // The cook plan needs 6 kg of chicken and 3 kg of rice.
    const plan = [{ version_id: "v", grams: 10_000 }];
    const ingredients = [
      { version_id: "v", item_id: chicken, quantity_per_kg: 600 },
      { version_id: "v", item_id: rice, quantity_per_kg: 300 },
    ];
    const items = async () => {
      const ordered = await onOrder(staff, k);
      return (await rows<{ item_id: string; name: string; supplier_id: string | null; on_hand: string }>(staff, "select item_id, name, supplier_id, on_hand from public.stock_levels where org_id = $1", [k.org])).map((i) => ({
        ...i,
        unit: "g" as const,
        on_hand: Number(i.on_hand),
        on_order: ordered.get(i.item_id) ?? 0,
      }));
    };
    expect((shoppingList(plan, ingredients, await items())).map((l) => [l.name, l.buy])).toEqual([
      ["Chicken", 1000],
      ["Rice", 1000],
    ]);
  });

  it("is received in part by anyone, which puts that much in stock", async () => {
    await run(staff, "select public.receive_supplier_order($1, public.org_today($2), $3)", [order, k.org, JSON.stringify([{ item_id: chicken, quantity: 3000, use_by: null }])]);
    expect(await onHand(staff, chicken)).toBe(3000);
    expect(await onOrder(staff, k)).toEqual(new Map([[chicken, 2000], [rice, 2000]]));
    const [move] = await rows<{ supplier_id: string; kind: string }>(staff, "select supplier_id, kind from public.stock_moves where supplier_order_id = $1", [order]);
    expect(move).toEqual({ supplier_id: butcher, kind: "purchase" });
    // Staff still do not buy in without an order, and record no cost.
    const bought = await fails(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on) values ($1, $2, 'purchase', 100, current_date)", [k.org, rice]);
    expect(bought.message).toMatch(/row-level security/);
    const cost = await fails(staff, "select public.receive_supplier_order($1, current_date, $2)", [order, JSON.stringify([{ item_id: rice, quantity: 100, cost_minor: 500 }])]);
    expect(cost.message).toMatch(/row-level security/);
  });

  it("never takes in more than is still to come, or what was not ordered", async () => {
    const tooMuch = await fails(staff, "select public.receive_supplier_order($1, current_date, $2)", [order, JSON.stringify([{ item_id: chicken, quantity: 2500 }])]);
    expect(tooMuch.message).toContain("WB292");
    const [{ id: oil }] = await rows<{ id: string }>(k.owner, "insert into public.stock_items (org_id, name, unit, kind) values ($1, 'Oil', 'ml', 'oil') returning id", [k.org]);
    const notOnIt = await fails(staff, "select public.receive_supplier_order($1, current_date, $2)", [order, JSON.stringify([{ item_id: oil, quantity: 100 }])]);
    expect(notOnIt.message).toContain("WB291");
    const nothing = await fails(staff, "select public.receive_supplier_order($1, current_date, '[]')", [order]);
    expect(nothing.message).toContain("WB289");
  });

  it("is received in full, with a cost for recipes when a manager receives it", async () => {
    await run(manager, "select public.receive_supplier_order($1, current_date, $2)", [order, JSON.stringify([
      { item_id: chicken, quantity: 2000, cost_minor: 44000 },
      { item_id: rice, quantity: 2000 },
    ])]);
    expect(await onOrder(staff, k)).toEqual(new Map());
    expect(await onHand(staff, chicken)).toBe(5000);
    const progress = await rows<{ still_to_come: string }>(staff, "select still_to_come from public.supplier_order_progress where order_id = $1", [order]);
    expect(progress.map((p) => Number(p.still_to_come))).toEqual([0, 0]);
    const [cost] = await rows<{ cost_minor: string }>(manager, "select c.cost_minor from public.stock_costs c join public.stock_moves m on m.id = c.move_id where m.supplier_order_id = $1", [order]);
    expect(Number(cost.cost_minor)).toBe(44000);
  });

  it("records the supplier's bill as an expense, once, by owners and managers", async () => {
    const e = await fails(staff, "select public.record_supplier_bill($1, 120000, current_date, 'Food', 'B-9')", [order]);
    expect(e.message).toContain("WB003");
    const [{ id: expense }] = await rows<{ id: string }>(manager, "select public.record_supplier_bill($1, 120000, current_date, 'Food', 'B-9') as id", [order]);
    const [row] = await rows<{ amount_minor: string; vendor: string; category: string }>(manager, "select amount_minor, vendor, category from public.expenses where id = $1", [expense]);
    expect({ ...row, amount_minor: Number(row.amount_minor) }).toEqual({ amount_minor: 120000, vendor: "Butcher", category: "Food" });
    const [o] = await rows<{ expense_id: string; bill_number: string }>(manager, "select expense_id, bill_number from public.supplier_orders where id = $1", [order]);
    expect(o).toEqual({ expense_id: expense, bill_number: "B-9" });
    const again = await fails(manager, "select public.record_supplier_bill($1, 1, current_date, 'Food')", [order]);
    expect(again.message).toContain("WB293");
  });

  it("is closed by a manager when the rest is not coming, and then takes nothing in", async () => {
    const [{ id: second }] = await rows<{ id: string }>(manager, "select public.place_supplier_order($1, $2, $3) as id", [k.org, butcher, JSON.stringify([{ item_id: rice, quantity: 1000 }])]);
    expect((await onOrder(staff, k)).get(rice)).toBe(1000);
    await run(staff, "update public.supplier_orders set status = 'closed' where id = $1", [second]);
    expect((await onOrder(staff, k)).get(rice)).toBe(1000);
    await run(manager, "update public.supplier_orders set status = 'closed' where id = $1", [second]);
    expect((await onOrder(staff, k)).get(rice)).toBeUndefined();
    const late = await fails(staff, "select public.receive_supplier_order($1, current_date, $2)", [second, JSON.stringify([{ item_id: rice, quantity: 1000 }])]);
    expect(late.message).toContain("WB290");
    // An order that something came against is never deleted; one with nothing is, by an owner.
    expect((await fails(k.owner, "delete from public.supplier_orders where id = $1", [order])).message).toMatch(/foreign key/);
    await run(manager, "delete from public.supplier_orders where id = $1", [second]);
    expect(await rows(staff, "select id from public.supplier_orders where id = $1", [second])).toHaveLength(1);
    await run(k.owner, "delete from public.supplier_orders where id = $1", [second]);
    expect(await rows(staff, "select id from public.supplier_orders where id = $1", [second])).toHaveLength(0);
  });

  it("stays in its own kennel", async () => {
    const other = await seedKennel(db);
    expect(await rows(other.owner, "select * from public.supplier_orders where org_id = $1", [k.org])).toHaveLength(0);
    expect(await rows(other.owner, "select * from public.stock_on_order where org_id = $1", [k.org])).toHaveLength(0);
    const e = await fails(other.owner, "select public.receive_supplier_order($1, current_date, $2)", [order, JSON.stringify([{ item_id: rice, quantity: 1 }])]);
    expect(e.message).toContain("WB003");
    const theirs = await fails(other.owner, "select public.place_supplier_order($1, $2, $3)", [other.org, butcher, JSON.stringify([{ item_id: rice, quantity: 1 }])]);
    expect(theirs.message).toMatch(/foreign key|violates/);
  });
});
