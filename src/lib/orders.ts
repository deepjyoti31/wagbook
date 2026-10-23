import type { createClient } from "./supabase/server";

/**
 * Shared by the screens for orders to suppliers (M63). Kept out of the
 * "use server" files, which may export only async functions.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One line of an order: what was ordered, what came and what is still to come, in the item's unit. */
export interface OrderLine {
  order_id: string;
  item_id: string;
  name: string;
  unit: "g" | "ml" | "piece";
  ordered: number;
  received: number;
  still_to_come: number;
}

/** The lines of some orders with how far each has come (supplier_order_progress), by name. Null when they could not be read. */
export async function orderProgress(supabase: Supabase, orgId: string, orderIds: readonly string[]): Promise<OrderLine[] | null> {
  if (orderIds.length === 0) return [];
  const [progress, items] = await Promise.all([
    supabase.from("supplier_order_progress").select("order_id, item_id, ordered, received, still_to_come").eq("org_id", orgId).in("order_id", orderIds),
    supabase.from("stock_items").select("id, name, unit").eq("org_id", orgId),
  ]);
  if (progress.error || items.error) return null;
  const itemOf = new Map(items.data.map((i) => [i.id, i]));
  // A view's columns come back as possibly empty; each row here is a real line.
  return progress.data
    .map((p) => ({
      order_id: p.order_id!,
      item_id: p.item_id!,
      name: itemOf.get(p.item_id!)?.name ?? "",
      unit: itemOf.get(p.item_id!)?.unit ?? "g",
      ordered: p.ordered ?? 0,
      received: p.received ?? 0,
      still_to_come: p.still_to_come ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
