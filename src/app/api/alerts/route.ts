import { connection, NextResponse } from "next/server";
import { getMemberships, getUser, owesCode } from "@/lib/auth";
import { alertText, isAlertKind } from "@/lib/alerts";
import { isLanguage } from "@/lib/i18n";
import { i18nFor } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * What a phone shows when a push wakes it (M61): the newest alerts the
 * signed-in person chose, in their own language, each with the page to open.
 * The push carried nothing; this is where the words come from, signed in.
 * With ?after= (an instant), only those after it, so a phone never shows one
 * twice.
 */
export async function GET(request: Request) {
  await connection();
  const none = (status: number) => NextResponse.json({ alerts: [] }, { status, headers: { "Cache-Control": "no-store" } });
  if (!isSupabaseConfigured()) return none(503);
  const user = await getUser();
  if (!user || (await owesCode())) return none(401);
  const after = new URL(request.url).searchParams.get("after");
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after).toISOString() : undefined;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_alerts", { p_after: since });
  if (error) return none(500);
  const memberships = await getMemberships();
  const languageOf = new Map(memberships.map((m) => [m.organizations!.id, m.language]));
  const alerts = data.flatMap((a) => {
    if (!isAlertKind(a.kind)) return [];
    const language = languageOf.get(a.org_id);
    const { m } = i18nFor(isLanguage(language) ? language : "en");
    return [{ id: a.id, at: a.created_at, url: a.link, ...alertText(m, { kind: a.kind, kennel: a.kennel, pet_name: a.pet_name }) }];
  });
  return NextResponse.json({ alerts }, { headers: { "Cache-Control": "no-store" } });
}
