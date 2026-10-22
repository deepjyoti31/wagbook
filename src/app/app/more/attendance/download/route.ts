import { connection, type NextRequest } from "next/server";
import { requireOrg } from "@/lib/auth";
import { attendanceSheet, decimalHours, isYearMonth, localClock, monthBounds, todayIn, toCsv } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { monthAttendance } from "@/lib/team";

/**
 * A month's attendance as CSV (M43), a line for each person and day with
 * something on it: first in, last out (kennel time), hours worked as a
 * decimal, leave, shifts on the rota, and any note written by hand. Owners
 * and managers get everyone; anyone else their own.
 */
export async function GET(request: NextRequest) {
  await connection();
  const { org, user, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  const w = m.attendance;
  if (!org.keeps_rota) return plain(w.off, 404);
  const asked = request.nextUrl.searchParams.get("month");
  const month = isYearMonth(asked) ? asked : todayIn(org.time_zone).slice(0, 7);
  const { first, last } = monthBounds(month);
  const supabase = await createClient();
  const data = await monthAttendance(supabase, { orgId: org.id, userId: user.id, canManage }, first, last);
  const sheet = attendanceSheet(month, data.people, data.stretches, data.leave, data.rota);
  const clock = (iso: string | null) => (iso ? localClock(iso, org.time_zone) : "");

  const rows = sheet.flatMap((r) =>
    r.days
      .filter((d) => d.stretches > 0 || d.onLeave || d.shifts > 0)
      .map((d) => {
        const those = data.stretches.filter((s) => s.user_id === r.person.user_id && s.work_date === d.date);
        const lastOut = those.at(-1)?.clocked_out_at ?? null;
        return [
          d.date,
          r.person.display_name,
          clock(those[0]?.clocked_in_at ?? null),
          clock(lastOut),
          d.stretches > 0 ? decimalHours(d.minutes) : "",
          d.onLeave,
          d.shifts,
          those.flatMap((s) => (s.note ? [s.note] : [])).join("; "),
        ];
      }),
  );
  const c = w.csv;
  const csv = toCsv([c.date, c.name, c.in, c.out, c.hours, c.onLeave, c.shifts, c.note], rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="attendance-${month}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function plain(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
}
