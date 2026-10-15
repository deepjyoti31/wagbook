import { connection, type NextRequest } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { MAX_QUEUED } from "@/lib/offline-ticks";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ taskIds: z.array(z.uuid()).min(1).max(MAX_QUEUED) });

/**
 * Receives care ticks made while the phone was offline (src/lib/offline-ticks.ts).
 * It can only mark a pending task done, which is safe to repeat. Answers with
 * the ids the phone can forget: those now done, skipped, or not found in this
 * kennel. Same origin and JSON only, so another site cannot post here with
 * the staff member's cookie.
 */
export async function POST(request: NextRequest) {
  await connection();
  const { org } = await requireOrg();
  if (request.headers.get("origin") !== request.nextUrl.origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ taken: [] }, { status: 403 });
  }
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ taken: [] }, { status: 400 });
  const ids = [...new Set(parsed.data.taskIds)];

  const supabase = await createClient();
  const done = await supabase.from("care_tasks").update({ status: "done" }).eq("org_id", org.id).in("id", ids).eq("status", "pending");
  if (done.error) return Response.json({ taken: [] }, { status: 500 });
  const after = await supabase.from("care_tasks").select("id, status").eq("org_id", org.id).in("id", ids);
  if (after.error) return Response.json({ taken: [] }, { status: 500 });
  const stillPending = new Set(after.data.filter((t) => t.status === "pending").map((t) => t.id));
  return Response.json({ taken: ids.filter((id) => !stillPending.has(id)) }, { headers: { "Cache-Control": "private, no-store" } });
}
