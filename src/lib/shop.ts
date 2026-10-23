import { billFor, draftPayload } from "./billing";
import { saleLines } from "./core";
import type { Tables } from "./supabase/database.types";
import type { createClient } from "./supabase/server";

/**
 * Shared by the shop, the parent page and the stay page (M62). Kept out of
 * the "use server" files, which may export only async functions.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One thing for sale over the counter, with what is in stock. */
export interface ShopItem {
  item_id: string;
  name: string;
  kind: Tables<"stock_items">["kind"];
  supplier_id: string | null;
  low_level: number | null;
  on_hand: number;
  sell_price_minor: number;
  sell_tax_rate_bp: number;
  hsn_code: string | null;
}

/** What the kennel sells over the counter, by name. */
export async function shopItems(supabase: Supabase, orgId: string): Promise<ShopItem[] | null> {
  const { data, error } = await supabase
    .from("stock_levels")
    .select("item_id, name, kind, supplier_id, low_level, on_hand, sell_price_minor, sell_tax_rate_bp, hsn_code, is_active")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .not("sell_price_minor", "is", null)
    .order("name");
  if (error) return null;
  // A view's columns come back as possibly empty; each row here is a real item with a price.
  return data.map((i) => ({
    item_id: i.item_id!,
    name: i.name!,
    kind: i.kind!,
    supplier_id: i.supplier_id,
    low_level: i.low_level,
    on_hand: i.on_hand ?? 0,
    sell_price_minor: i.sell_price_minor!,
    sell_tax_rate_bp: i.sell_tax_rate_bp ?? 0,
    hsn_code: i.hsn_code,
  }));
}

/**
 * The bill of its own for a sale that is not on a stay: a draft with the
 * sale's lines, worked out under the kennel's tax, ready to issue. Returns
 * the bill's id, or the database's error.
 */
export async function makeSaleBill(supabase: Supabase, org: Tables<"organizations">, saleId: string): Promise<{ id: string } | { error: { message: string; code?: string } }> {
  const [sale, lines, existing] = await Promise.all([
    supabase.from("sales").select("client_id").eq("org_id", org.id).eq("id", saleId).single(),
    supabase.from("sale_lines").select("description, quantity, unit_price_minor, tax_rate_bp, hsn_code").eq("org_id", org.id).eq("sale_id", saleId).order("sort_order"),
    supabase.from("invoices").select("id").eq("org_id", org.id).eq("sale_id", saleId).neq("status", "void").maybeSingle(),
  ]);
  if (sale.error || lines.error || existing.error) return { error: sale.error ?? lines.error ?? existing.error! };
  if (existing.data) return { id: existing.data.id };
  const created = await supabase.from("invoices").insert({ org_id: org.id, client_id: sale.data.client_id, sale_id: saleId }).select("id").single();
  if (created.error) return { error: created.error };
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: created.data.id, ...draftPayload(billFor(org, saleLines(lines.data))) });
  if (saved.error) return { error: saved.error };
  return { id: created.data.id };
}
