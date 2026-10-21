import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Roadmap M26: stock. Stock is never edited; it is the sum of its movements,
 * never below nothing, and a stock take is the one way to correct it. Owners
 * and managers buy and see costs; staff record waste and stock takes.
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

export async function stockItem(k: Kennel, name: string, unit = "g", extra: { never?: boolean } = {}): Promise<string> {
  const [{ id }] = await rows<{ id: string }>(
    k.owner,
    "insert into public.stock_items (org_id, name, unit, kind, never_in_recipe) values ($1, $2, $3, 'meat', $4) returning id",
    [k.org, name, unit, extra.never ?? false],
  );
  return id;
}

const buy = (actor: string, k: Kennel, item: string, quantity: number, cost: number, on: string, extra: { useBy?: string; expense?: string } = {}) =>
  rows<{ id: string }>(actor, "select public.record_purchase($1, $2, $3, $4, $5, null, $6, 'B-17', null, $7) as id", [
    k.org, item, quantity, cost, on, extra.useBy ?? null, extra.expense ?? null,
  ]);

const onHand = async (actor: string, item: string) =>
  Number((await rows<{ on_hand: string }>(actor, "select on_hand from public.stock_levels where item_id = $1", [item]))[0].on_hand);

describe("stock", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let chicken: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    chicken = await stockItem(k, "Chicken");
  });

  it("is bought in by owners and managers, with its cost, and optionally as an expense in the same step", async () => {
    const [{ id }] = await buy(manager, k, chicken, 10000, 220000, "2027-03-01", { useBy: "2027-03-04", expense: "Food" });
    expect(await onHand(staff, chicken)).toBe(10000);
    const [cost] = await rows<{ cost_minor: string; expense_id: string | null }>(manager, "select cost_minor, expense_id from public.stock_costs where move_id = $1", [id]);
    expect(Number(cost.cost_minor)).toBe(220000);
    const [expense] = await rows<{ amount_minor: string; category: string }>(manager, "select amount_minor, category from public.expenses where id = $1", [cost.expense_id]);
    expect({ ...expense, amount_minor: Number(expense.amount_minor) }).toEqual({ amount_minor: 220000, category: "Food" });
    // Without a category, no expense.
    const [{ id: second }] = await buy(k.owner, k, chicken, 2000, 44000, "2027-03-02");
    expect((await rows<{ expense_id: string | null }>(k.owner, "select expense_id from public.stock_costs where move_id = $1", [second]))[0].expense_id).toBeNull();
  });

  it("is not bought by staff, who see no cost", async () => {
    const e = await fails(staff, "select public.record_purchase($1, $2, 100, 100, '2027-03-02')", [k.org, chicken]);
    expect(e.message).toContain("WB131");
    const direct = await fails(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on) values ($1, $2, 'purchase', 100, '2027-03-02')", [k.org, chicken]);
    expect(direct.message).toMatch(/row-level security/);
    expect(await rows(staff, "select * from public.stock_costs where org_id = $1", [k.org])).toHaveLength(0);
    // Staff still read what is in stock.
    expect(await rows(staff, "select id from public.stock_moves where org_id = $1", [k.org])).toHaveLength(2);
  });

  it("goes out as waste with a reason, never below nothing", async () => {
    await run(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, reason) values ($1, $2, 'waste', -500, '2027-03-03', 'dropped')", [k.org, chicken]);
    const noReason = await fails(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on) values ($1, $2, 'waste', -500, '2027-03-03')", [k.org, chicken]);
    expect(noReason.message).toContain("stock_moves_shape");
    const tooMuch = await fails(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, reason) values ($1, $2, 'waste', -20000, '2027-03-03', 'spoiled')", [k.org, chicken]);
    expect(tooMuch.message).toContain("WB130");
    expect(await onHand(staff, chicken)).toBe(11500);
  });

  it("is never taken out by hand as used in cooking: only a batch does that", async () => {
    const e = await fails(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on) values ($1, $2, 'used', -100, '2027-03-03')", [k.org, chicken]);
    expect(e.message).toContain("stock_moves_shape");
  });

  it("is corrected only by a stock take, which records the difference", async () => {
    await run(staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, counted) values ($1, $2, 'count', 0, '2027-03-04', 11000)", [k.org, chicken]);
    expect(await onHand(staff, chicken)).toBe(11000);
    const [take] = await rows<{ quantity: string }>(staff, "select quantity from public.stock_moves where item_id = $1 and kind = 'count'", [chicken]);
    expect(Number(take.quantity)).toBe(-500);
  });

  it("is never changed or deleted, not even by an owner", async () => {
    const changed = await fails(k.owner, "update public.stock_moves set quantity = 1 where item_id = $1", [chicken]);
    expect(changed.message).toMatch(/permission denied/);
    const deleted = await fails(k.owner, "delete from public.stock_moves where item_id = $1", [chicken]);
    expect(deleted.message).toMatch(/permission denied/);
  });

  it("stays in its own kennel", async () => {
    const other = await seedKennel(db);
    expect(await rows(other.owner, "select * from public.stock_levels where org_id = $1", [k.org])).toHaveLength(0);
    const e = await fails(other.owner, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, counted) values ($1, $2, 'count', 0, '2027-03-04', 5)", [other.org, chicken]);
    expect(e.message).toMatch(/foreign key|violates/);
  });
});
