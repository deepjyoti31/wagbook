import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { ZipWriter } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

/**
 * A month of photos as a ZIP (M49), in a folder for each pet, named by the
 * day they were taken. Sent a photo at a time, so a big month never sits in
 * the server's memory whole. Only once the last photo is sent is the month
 * noted as downloaded, which lets an owner remove it from Wagbook.
 */
export async function GET(request: NextRequest) {
  await connection();
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  if (!canManage) return new Response(m.errors.codes.WB002, { status: 403 });
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(month)) return new Response(m.errors.codes.WB241, { status: 400 });

  const supabase = await createClient();
  const { data: files, error } = await supabase.rpc("photo_month_files", { p_org: org.id, p_month: month });
  if (error) return new Response(m.errors.codes.WB241, { status: 400 });

  const dayOf = new Intl.DateTimeFormat("en-CA", { timeZone: org.time_zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const writer = new ZipWriter();
  const seen = new Map<string, number>();
  let next = 0;
  let sent = 0;
  let bytes = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      while (next < files.length) {
        const f = files[next++];
        const got = await supabase.storage.from(BUCKET).download(f.path);
        // A photo removed meanwhile is left out; the rest still go.
        if (got.error || !got.data) continue;
        const folder = folderName(f.pet_name) || "Other";
        const day = dayOf.format(new Date(f.taken_at));
        const n = (seen.get(`${folder}/${day}`) ?? 0) + 1;
        seen.set(`${folder}/${day}`, n);
        const photo = new Uint8Array(await got.data.arrayBuffer());
        sent += 1;
        bytes += photo.length;
        controller.enqueue(writer.add({ name: `${folder}/${day} ${n}.jpg`, bytes: photo }));
        return;
      }
      controller.enqueue(writer.end());
      await supabase.rpc("record_photo_download", { p_org: org.id, p_month: month, p_files: sent, p_bytes: bytes });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="wagbook-photos-${month.slice(0, 7)}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}

/** A pet's name as a folder: no characters a computer refuses in a folder name. */
function folderName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}
