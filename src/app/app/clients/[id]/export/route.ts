import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { todayIn, zipStore, type ZipEntry } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { getAppI18n } from "@/lib/i18n-server";
import { BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

/**
 * Everything held about one parent, for a request under India's DPDP Act
 * (roadmap M9), as a ZIP file (M44): parent.json, and every photo and
 * certificate it names under files/, at its storage path. The small copy of
 * each photo is left out (it is the same photo, smaller). A file that could
 * not be read is listed in parent.json under files_not_included. Owners and
 * managers only; export_client() refuses anyone else (WB070).
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

  const record = data as { files?: unknown };
  const paths = (Array.isArray(record.files) ? record.files : []).filter((p): p is string => typeof p === "string" && !p.endsWith(".small.jpg"));
  const files: ZipEntry[] = [];
  const missing: string[] = [];
  // One at a time: a parent's files are tens, not thousands, and this keeps memory flat.
  for (const path of paths) {
    const { data: blob, error: readError } = await supabase.storage.from(BUCKET).download(path);
    if (readError || !blob) missing.push(path);
    else files.push({ name: `files/${path}`, bytes: new Uint8Array(await blob.arrayBuffer()) });
  }
  const json = JSON.stringify({ ...record, files_not_included: missing }, null, 2);
  const zip = zipStore([{ name: "parent.json", bytes: new TextEncoder().encode(json) }, ...files]);

  return new Response(zip as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="parent-${id.slice(0, 8)}-${todayIn(org.time_zone)}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
