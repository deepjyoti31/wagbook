import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything held about one parent, as a JSON file, for a request under
 * India's DPDP Act (roadmap M9). Owners and managers only; export_client()
 * refuses anyone else (WB070). The file names the photos and certificates by
 * their storage paths; it does not contain them.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/app/clients/[id]/export">) {
  // Per request, always: without this the build could save a response made with no one signed in.
  await connection();
  const { id } = await params;
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return plain(t.m.parent.privacy.onlyManagers, 403);
  if (!/^[0-9a-f-]{36}$/.test(id)) return plain(t.m.errors.parentNotFound, 404);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("export_client", { p_client: id });
  if (error || !data) return plain(friendlyError(error, t), error?.code === "42501" ? 403 : 404);

  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="parent-${id.slice(0, 8)}-${todayIn(org.time_zone)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
