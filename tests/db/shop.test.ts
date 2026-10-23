import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billFor, draftPayload } from "@/lib/billing";
import { saleLines, type InvoiceTotals, type LineInput, type SoldLine } from "@/lib/core";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Roadmap M62: selling over the counter. Things for sale are stock like the
 * kitchen's, the sum of their movements and never below nothing; a sale is
 * priced by the database, takes its stock in the same step, and goes on the
 * stay's bill or a bill of its own, to a parent or to the walk-in buyer.
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

const org = { tax_mode: "none" as const, gst_state_code: null, prices_include_tax: false, round_invoice_totals: true };

async function forSale(k: Kennel, name: string, price: number, extra: { rate?: number; low?: number } = {}): Promise<string> {
  const [{ id }] = await rows<{ id: string }>(
    k.owner,
    "insert into public.stock_items (org_id, name, unit, kind, sell_price_minor, sell_tax_rate_bp, hsn_code, low_level) values ($1, $2, 'piece', 'treat', $3, $4, '23091000', $5) returning id",
    [k.org, name, price, extra.rate ?? 1800, extra.low ?? null],
  );
  return id;
}

const buy = (k: Kennel, item: string, pieces: number) =>
  run(k.owner, "select public.record_purchase($1, $2, $3, 0, public.org_today($1))", [k.org, item, pieces]);

const onHand = async (actor: string, item: string) =>
  Number((await rows<{ on_hand: string }>(actor, "select on_hand from public.stock_levels where item_id = $1", [item]))[0].on_hand);

const sell = async (actor: string, k: Kennel, lines: { item_id: string; quantity: number }[], to: { client?: string; booking?: string } = {}) =>
  (await rows<{ id: string }>(actor, "select public.sell($1, $2, $3, $4) as id", [k.org, JSON.stringify(lines), to.client ?? null, to.booking ?? null]))[0].id;

const linesOf = async (actor: string, sale: string) =>
  (await rows<SoldLine>(actor, "select description, quantity, unit_price_minor::int, tax_rate_bp, hsn_code from public.sale_lines where sale_id = $1 order by sort_order", [sale]));

async function draft(actor: string, k: Kennel, client: string, t: InvoiceTotals, scope: { sale?: string; booking?: string }): Promise<string> {
  return as(db, user(actor), async () => {
    const r = await db.query<{ id: string }>(
      "insert into public.invoices (org_id, client_id, sale_id, booking_id) values ($1, $2, $3, $4) returning id",
      [k.org, client, scope.sale ?? null, scope.booking ?? null],
    );
    const { p_totals, p_lines } = draftPayload(t);
    await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p_totals), JSON.stringify(p_lines)]);
    return r.rows[0].id;
  });
}

describe("selling over the counter", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let bone: string;
  let toy: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    bone = await forSale(k, "Chew bone", 25000);
    toy = await forSale(k, "Rope toy", 40000, { low: 1 });
  });

  it("is refused until the kennel sells over the counter", async () => {
    await buy(k, bone, 2);
    const e = await fails(staff, "select public.sell($1, $2)", [k.org, JSON.stringify([{ item_id: bone, quantity: 1 }])]);
    expect(e.message).toContain("WB280");
    await run(k.owner, "update public.organizations set offers_shop = true where id = $1", [k.org]);
  });

  it("sells the last one and is refused the next one", async () => {
    const first = await sell(staff, k, [{ item_id: bone, quantity: 1 }]);
    expect(await onHand(staff, bone)).toBe(1);
    await sell(staff, k, [{ item_id: bone, quantity: 1 }]);
    expect(await onHand(staff, bone)).toBe(0);
    const e = await fails(staff, "select public.sell($1, $2)", [k.org, JSON.stringify([{ item_id: bone, quantity: 1 }])]);
    expect(e.message).toContain("WB130");
    // Nothing of the refused sale is left behind.
    expect(await rows(staff, "select id from public.sales where org_id = $1", [k.org])).toHaveLength(2);
    expect(await onHand(staff, bone)).toBe(0);
    // Each sale took its stock as a movement of its own.
    const [move] = await rows<{ kind: string; quantity: string }>(
      staff,
      "select m.kind, m.quantity from public.stock_moves m join public.sale_lines l on l.id = m.sale_line_id where l.sale_id = $1",
      [first],
    );
    expect({ ...move, quantity: Number(move.quantity) }).toEqual({ kind: "sale", quantity: -1 });
  });

  it("is priced by the database from the item, whatever the price is later", async () => {
    await buy(k, toy, 5);
    const sale = await sell(staff, k, [{ item_id: toy, quantity: 1 }, { item_id: toy, quantity: 1 }]);
    expect(await linesOf(staff, sale)).toEqual([{ description: "Rope toy", quantity: 2, unit_price_minor: 40000, tax_rate_bp: 1800, hsn_code: "23091000" }]);
    // Staff do not change a price; a manager does, and the sale keeps its own.
    await run(staff, "update public.stock_items set sell_price_minor = 1 where id = $1", [toy]);
    await run(manager, "update public.stock_items set sell_price_minor = 45000 where id = $1", [toy]);
    expect((await rows<{ sell_price_minor: number }>(staff, "select sell_price_minor from public.stock_items where id = $1", [toy]))[0].sell_price_minor).toBe(45000);
    expect((await linesOf(staff, sale))[0].unit_price_minor).toBe(40000);
    // Nobody writes a sale, its lines or a sale's stock by hand.
    expect((await fails(k.owner, "insert into public.sales (org_id, client_id, sold_on) values ($1, $2, current_date)", [k.org, k.client])).message).toMatch(/permission denied/);
    expect((await fails(k.owner, "update public.sale_lines set unit_price_minor = 1 where sale_id = $1", [sale])).message).toMatch(/permission denied/);
    const [line] = await rows<{ id: string }>(staff, "select id from public.sale_lines where sale_id = $1", [sale]);
    const byHand = await fails(k.owner, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, sale_line_id) values ($1, $2, 'sale', 1, current_date, $3)", [k.org, toy, line.id]);
    expect(byHand.message).toMatch(/row-level security/);
  });

  it("refuses what is not for sale, and sells by the piece only", async () => {
    const [{ id: rice }] = await rows<{ id: string }>(k.owner, "insert into public.stock_items (org_id, name, unit, kind) values ($1, 'Rice', 'g', 'grain') returning id", [k.org]);
    const e = await fails(staff, "select public.sell($1, $2)", [k.org, JSON.stringify([{ item_id: rice, quantity: 1 }])]);
    expect(e.message).toContain("WB281");
    const byWeight = await fails(manager, "update public.stock_items set sell_price_minor = 100 where id = $1", [rice]);
    expect(byWeight.message).toContain("stock_items_sold_by_the_piece");
    const none = await fails(staff, "select public.sell($1, '[]')", [k.org]);
    expect(none.message).toContain("WB287");
    const tooMany = await fails(staff, "select public.sell($1, $2)", [k.org, JSON.stringify([{ item_id: toy, quantity: 0 }])]);
    expect(tooMany.message).toContain("WB287");
  });

  it("bills a walk-in to the kennel's one walk-in buyer, who has no phone and no pets", async () => {
    const sales = await rows<{ client_id: string }>(staff, "select distinct client_id from public.sales where org_id = $1 and booking_id is null", [k.org]);
    expect(sales).toHaveLength(1);
    const [walkIn] = await rows<{ full_name: string; phone: string; is_walk_in: boolean }>(staff, "select full_name, phone, is_walk_in from public.clients where id = $1", [sales[0].client_id]);
    expect(walkIn).toEqual({ full_name: "Walk-in", phone: "", is_walk_in: true });
    // Nobody makes or unmakes a walk-in buyer by hand.
    const made = await fails(k.owner, "insert into public.clients (org_id, full_name, phone, is_walk_in) values ($1, 'Fake', '', true)", [k.org]);
    expect(made.message).toMatch(/permission denied/);
    const pet = await fails(staff, "insert into public.pets (org_id, client_id, name) values ($1, $2, 'Stray')", [k.org, sales[0].client_id]);
    expect(pet.message).toContain("WB286");
    const merge = await fails(manager, "select public.merge_clients($1, $2)", [k.client, sales[0].client_id]);
    expect(merge.message).toContain("WB018");
  });

  it("gives a sale a bill of its own, which staff issue only as it was sold", async () => {
    const sale = await sell(staff, k, [{ item_id: toy, quantity: 1 }], { client: k.client });
    const right = billFor(org, saleLines(await linesOf(staff, sale)));
    const wrongLines: LineInput[] = saleLines(await linesOf(staff, sale)).map((l) => ({ ...l, unitPriceMinor: 100 }));
    const wrong = await draft(staff, k, k.client, billFor(org, wrongLines), { sale });
    const refused = await fails(staff, "select public.issue_invoice($1)", [wrong]);
    expect(refused.message).toContain("WB050");
    await run(k.owner, "delete from public.invoices where id = $1", [wrong]);
    const bill = await draft(staff, k, k.client, right, { sale });
    await run(staff, "select public.issue_invoice($1)", [bill]);
    expect((await rows<{ total_minor: number }>(staff, "select total_minor from public.invoices where id = $1", [bill]))[0].total_minor).toBe(45000);
    // One live bill per sale, and only for its own buyer.
    const twice = await fails(staff, "insert into public.invoices (org_id, client_id, sale_id) values ($1, $2, $3)", [k.org, k.client, sale]);
    expect(twice.message).toMatch(/invoices_one_live_per_sale/);
    const walkIn = (await rows<{ id: string }>(staff, "select id from public.clients where org_id = $1 and is_walk_in", [k.org]))[0].id;
    const other = await fails(staff, "insert into public.invoices (org_id, client_id, sale_id) values ($1, $2, $3)", [k.org, walkIn, sale]);
    expect(other.message).toContain("WB288");
    // Its bill has gone out, so it is no longer cancelled.
    const cancel = await fails(manager, "select public.cancel_sale($1, 'Mistake')", [sale]);
    expect(cancel.message).toContain("WB283");
  });

  it("puts a sale on a stay on the stay's bill, until that bill goes out", async () => {
    await buy(k, bone, 3);
    const start = (await rows<{ d: string }>(staff, "select (public.org_today($1) - 1)::text as d", [k.org]))[0].d;
    const end = (await rows<{ d: string }>(staff, "select (public.org_today($1) + 1)::text as d", [k.org]))[0].d;
    const stay = await book(db, k, { pet: k.pets[0], start, end, kennel: k.kennels[0], rate: 100000 });
    const sale = await sell(staff, k, [{ item_id: bone, quantity: 2 }], { booking: stay });
    expect((await rows<{ client_id: string }>(staff, "select client_id from public.sales where id = $1", [sale]))[0].client_id).toBe(k.client);
    // A bill of its own is not for a sale on a stay.
    const own = await fails(staff, "insert into public.invoices (org_id, client_id, sale_id) values ($1, $2, $3)", [k.org, k.client, sale]);
    expect(own.message).toContain("WB288");
    // Staff issue the stay's bill only with the sale on it.
    const stayLine: LineInput = { description: "Boarding", quantity: 2, unitPriceMinor: 100000 };
    const without = await draft(staff, k, k.client, billFor(org, [stayLine]), { booking: stay });
    expect((await fails(staff, "select public.issue_invoice($1)", [without])).message).toContain("WB050");
    await run(k.owner, "delete from public.invoices where id = $1", [without]);
    const bill = await draft(staff, k, k.client, billFor(org, [stayLine, ...saleLines(await linesOf(staff, sale))]), { booking: stay });
    await run(staff, "select public.issue_invoice($1)", [bill]);
    // Then nothing more is sold on it, and the sale is not cancelled.
    const more = await fails(staff, "select public.sell($1, $3, null, $2)", [k.org, stay, JSON.stringify([{ item_id: bone, quantity: 1 }])]);
    expect(more.message).toContain("WB283");
    expect((await fails(manager, "select public.cancel_sale($1, 'Mistake')", [sale])).message).toContain("WB283");
    // Nor on a stay that was cancelled.
    const cancelled = await book(db, k, { pet: k.pets[1], start, end, kennel: k.kennels[1], status: "cancelled" });
    const e = await fails(staff, "select public.sell($1, $3, null, $2)", [k.org, cancelled, JSON.stringify([{ item_id: bone, quantity: 1 }])]);
    expect(e.message).toContain("WB282");
  });

  it("is cancelled by an owner or manager with a reason, and the stock comes back", async () => {
    const before = await onHand(staff, toy);
    const sale = await sell(staff, k, [{ item_id: toy, quantity: 2 }]);
    const walkIn = (await rows<{ client_id: string }>(staff, "select client_id from public.sales where id = $1", [sale]))[0].client_id;
    const bill = await draft(staff, k, walkIn, billFor(org, saleLines(await linesOf(staff, sale))), { sale });
    expect(await onHand(staff, toy)).toBe(before - 2);
    expect((await fails(staff, "select public.cancel_sale($1, 'Mistake')", [sale])).message).toContain("WB002");
    expect((await fails(manager, "select public.cancel_sale($1, ' ')", [sale])).message).toContain("WB285");
    await run(manager, "select public.cancel_sale($1, 'Rang up twice')", [sale]);
    expect(await onHand(staff, toy)).toBe(before);
    const [row] = await rows<{ status: string; cancel_reason: string }>(staff, "select status, cancel_reason from public.sales where id = $1", [sale]);
    expect(row).toEqual({ status: "cancelled", cancel_reason: "Rang up twice" });
    // Its draft bill went with it, and it is cancelled once.
    expect(await rows(staff, "select id from public.invoices where id = $1", [bill])).toHaveLength(0);
    expect((await fails(manager, "select public.cancel_sale($1, 'Again')", [sale])).message).toContain("WB284");
    // The history of changes has it.
    const history = await rows<{ action: string }>(manager, "select action from public.audit_log where table_name = 'sales' and row_id = $1 order by id", [sale]);
    expect(history.map((h) => h.action)).toEqual(["insert", "update"]);
  });

  it("is in the parent's export", async () => {
    const exported = await rows<{ x: { sales: { lines: unknown[] }[] } }>(manager, "select public.export_client($1) as x", [k.client]);
    expect(exported[0].x.sales.length).toBeGreaterThanOrEqual(2);
    expect(exported[0].x.sales.every((s) => s.lines.length > 0)).toBe(true);
  });

  it("stays in its own kennel", async () => {
    const other = await seedKennel(db);
    await run(other.owner, "update public.organizations set offers_shop = true where id = $1", [other.org]);
    expect(await rows(other.owner, "select id from public.sales where org_id = $1", [k.org])).toHaveLength(0);
    const e = await fails(other.owner, "select public.sell($1, $2)", [other.org, JSON.stringify([{ item_id: toy, quantity: 1 }])]);
    expect(e.message).toContain("WB281");
    const theirs = await fails(other.owner, "select public.sell($1, $2)", [k.org, JSON.stringify([{ item_id: toy, quantity: 1 }])]);
    expect(theirs.message).toContain("WB003");
    // A rider sells nothing.
    const rider = await addMember(db, k, "rider");
    expect((await fails(rider, "select public.sell($1, $2)", [k.org, JSON.stringify([{ item_id: toy, quantity: 1 }])])).message).toContain("WB003");
  });
});
