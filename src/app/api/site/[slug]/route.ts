import { connection, NextResponse } from "next/server";
import { formatMoney, upiLink, type PortionSettings } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { parentI18n } from "@/lib/i18n-server";
import { sendAlertsAfter } from "@/lib/push";
import { isRateLimited } from "@/lib/rate-limit-server";
import { bookingPayload, foodPayload, looksLikeRobot, MAX_SITE_BODY, originAllowed, SiteRequest, type Refusal } from "@/lib/site-request";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * Booking requests and food orders from a kennel's own website (M68). The
 * website's page posts here from the visitor's browser, so the answer is
 * readable only by the kennel's own website (Settings, "Your own website").
 * The body is JSON, sent as text/plain so the browser asks nothing first.
 *
 * Every request goes through the same public functions as Wagbook's own
 * pages (submit_intake, submit_food_order, food_order_paid): no new database
 * function, and the database checks everything again and works out the price.
 */

interface PublicIntake {
  language: string;
  website: string | null;
  country_code: string;
  services: { id: string; kind: string }[];
}

interface PublicFood {
  kennel: { name: string; locale: string; currency: string; country_code: string; upi_vpa: string | null; upi_payee_name: string };
  portions: PortionSettings;
}

type Answer = Record<string, unknown> & { ok: boolean };

function reply(body: Answer, status: number, origin: string | null): NextResponse {
  const headers: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return NextResponse.json(body, { status, headers });
}

/** The kennel behind the slug, as its public booking form sees it. Null when there is none. */
async function kennelFor(slug: string): Promise<PublicIntake | null> {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{3,40}$/i.test(slug)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_intake_form", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as PublicIntake;
}

/** A browser asking first (when a page sends JSON as application/json). */
export async function OPTIONS(request: Request, ctx: RouteContext<"/api/site/[slug]">) {
  await connection();
  const origin = request.headers.get("origin");
  const kennel = await kennelFor((await ctx.params).slug);
  if (!kennel || !originAllowed(origin, kennel.website)) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin!,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    },
  });
}

export async function POST(request: Request, ctx: RouteContext<"/api/site/[slug]">) {
  await connection();
  const slug = (await ctx.params).slug.toLowerCase();
  const origin = request.headers.get("origin");
  const kennel = await kennelFor(slug);
  const { m } = parentI18n(kennel?.language);
  const w = m.site;
  if (!kennel) return reply({ ok: false, error: "unavailable", message: w.unavailable }, 404, null);
  // Only the kennel's own website may send, and read the answer.
  if (!originAllowed(origin, kennel.website)) return reply({ ok: false, error: "not_allowed", message: w.notAllowed }, 403, null);
  if (await isRateLimited()) return reply({ ok: false, error: "rate_limited", message: m.errors.slowDown }, 429, origin);

  const raw = await request.text();
  let parsed: ReturnType<typeof SiteRequest.safeParse>;
  try {
    parsed = raw.length > MAX_SITE_BODY ? SiteRequest.safeParse(null) : SiteRequest.safeParse(JSON.parse(raw));
  } catch {
    parsed = SiteRequest.safeParse(null);
  }
  if (!parsed.success) return reply({ ok: false, error: "bad_request", message: w.unreadable }, 400, origin);
  const r = parsed.data;
  const ref = r.ref ?? null;
  const refused = (why: Refusal) => reply({ ok: false, error: "invalid", field: why, message: w.refusals[why] }, 422, origin);

  // A robot is answered as if all is well, and nothing is kept.
  if (r.kind !== "paid" && looksLikeRobot(r)) return reply({ ok: true, ref }, 200, origin);
  const supabase = createAnonClient();

  if (r.kind === "paid") {
    if (!r.token) return reply({ ok: false, error: "bad_request", message: w.unreadable }, 400, origin);
    const { data, error } = await supabase.rpc("food_order_paid", { p_token: r.token });
    if (error) return refusedByDatabase(error, origin, kennel.language);
    return reply({ ok: true, ref, status: data }, 200, origin);
  }

  if (r.kind === "booking") {
    const payload = bookingPayload(r, { country: kennel.country_code, services: kennel.services });
    if (typeof payload === "string") return refused(payload);
    const { data, error } = await supabase.rpc("submit_intake", { p_slug: slug, p_payload: payload });
    if (error) return refusedByDatabase(error, origin, kennel.language);
    const repeat = (data as { repeat?: boolean } | null)?.repeat === true;
    if (!repeat) sendAlertsAfter();
    return reply({ ok: true, ref, ...(repeat ? { repeat } : {}) }, 200, origin);
  }

  const form = await supabase.rpc("get_public_food_form", { p_slug: slug });
  const food = form.data as unknown as PublicFood | null;
  if (form.error || !food) return reply({ ok: false, error: "unavailable", message: w.unavailable }, 404, origin);
  const payload = foodPayload(r, { country: food.kennel.country_code, portions: food.portions });
  if (typeof payload === "string") return refused(payload);
  const { data, error } = await supabase.rpc("submit_food_order", { p_slug: slug, p_payload: payload as never });
  if (error) return refusedByDatabase(error, origin, kennel.language);
  const o = data as { token: string; status: string; amount_minor: number | null; starts_on: string | null; kind: string; repeat?: boolean };
  if (!o.repeat) sendAlertsAfter();
  const k = food.kennel;
  const amount = o.amount_minor === null ? null : Number(o.amount_minor);
  let link: string | null = null;
  if (amount !== null && amount > 0 && k.upi_vpa) {
    // The payment note is the website's reference, so staff can match the money to the order.
    link = upiLink({ vpa: k.upi_vpa, payeeName: k.upi_payee_name, amountMinor: amount, note: ref ?? `${k.name} food` });
  }
  return reply(
    {
      ok: true,
      ref,
      kind: o.kind,
      status: o.status,
      served: o.status !== "waiting_area",
      amount_minor: amount,
      amount: amount === null ? null : formatMoney(amount, { currency: k.currency, locale: k.locale, trimZeros: true }),
      currency: k.currency,
      starts_on: o.starts_on,
      token: o.token,
      upi_link: link,
      ...(o.repeat ? { repeat: true } : {}),
    },
    200,
    origin,
  );
}

/** A database refusal: its own sentence for something the visitor can fix, or a plain "try again". */
function refusedByDatabase(error: { code?: string | null; message: string; details?: string | null }, origin: string | null, language: string): NextResponse {
  const t = parentI18n(language);
  const code = /WB(\d{3})/.exec(error.message)?.[0] ?? null;
  if (code === "WB040" || code === "WB180") return reply({ ok: false, error: "unavailable", message: t.m.site.unavailable }, 404, origin);
  if (code === "WB048" || code === "WB184") return reply({ ok: false, error: "rate_limited", message: friendlyError(error, t) }, 429, origin);
  if (code) return reply({ ok: false, error: "invalid", code, message: friendlyError(error, t) }, 422, origin);
  console.error("site request failed", error.code, error.message);
  return reply({ ok: false, error: "server_error", message: t.m.errors.generic }, 500, origin);
}
