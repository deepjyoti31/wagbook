import { connection, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * For an uptime service to watch every few minutes (M48,
 * docs/10-setup-and-deploy.md, "Know when it breaks"): 200 and "ok" when the
 * app can reach the database, 503 when it cannot.
 *
 * It asks the database for the intake form of a kennel that cannot exist,
 * one of the functions anyone may call, so the check adds nothing to what a
 * stranger can do. Any answer from the database, even "not found", means it
 * is up; no answer means it is not.
 */
export async function GET() {
  await connection();
  if (!isSupabaseConfigured()) return answer(false, "not set up");
  try {
    const { error } = await createAnonClient().rpc("get_public_intake_form", { p_slug: "-health-check-" });
    // A Postgres error code (five letters or digits) is the database answering.
    if (error && !/^[0-9A-Z]{5}$/.test(error.code ?? "")) return answer(false, "database unreachable");
    return answer(true, "ok");
  } catch {
    return answer(false, "database unreachable");
  }
}

function answer(ok: boolean, status: string) {
  return NextResponse.json({ status }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
