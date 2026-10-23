import { DEFAULT_TALLY_LEDGERS, type TallyLedgers } from "./core";
import type { createClient } from "./supabase/server";

/**
 * The kennel's ledger names in Tally (M64), from tally_settings, or the
 * defaults while none are saved. Kept out of the "use server" files, which
 * may export only async functions.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The ledger settings' columns, in the order the form asks for them, with the TallyLedgers key each fills. */
export const TALLY_FIELDS = [
  ["sales_ledger", "sales"],
  ["cgst_ledger", "cgst"],
  ["sgst_ledger", "sgst"],
  ["igst_ledger", "igst"],
  ["tax_ledger", "tax"],
  ["round_off_ledger", "roundOff"],
  ["cash_ledger", "cash"],
  ["bank_ledger", "bank"],
  ["credit_ledger", "credit"],
  ["parents_group", "parentsGroup"],
  ["expenses_group", "expensesGroup"],
] as const;

export type TallyColumn = (typeof TALLY_FIELDS)[number][0];

/** The names to write in the file. Null when they could not be read. */
export async function tallyLedgers(supabase: Supabase, orgId: string): Promise<TallyLedgers | null> {
  const { data, error } = await supabase.from("tally_settings").select("*").eq("org_id", orgId).maybeSingle();
  if (error) return null;
  if (!data) return DEFAULT_TALLY_LEDGERS;
  const out: TallyLedgers = { ...DEFAULT_TALLY_LEDGERS, company: data.company };
  for (const [column, key] of TALLY_FIELDS) out[key] = data[column];
  return out;
}
