import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Notice } from "@/components/ui";
import { letPetIn } from "@/app/app/bookings/door-actions";
import { requireOrg } from "@/lib/auth";
import { formatDate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Health papers at the door (M40): what the pet lacks on the day by the
 * kennel's rules, a warning or a refusal as the kennel set it, and, for an
 * owner or manager, letting it in anyway with the reason. Says nothing while
 * the kennel does not check, or the pet lacks nothing.
 */
export async function HealthAtTheDoor({ t, petId, on, bookingId, appointmentId }: { t: I18n; petId: string; on: string; bookingId?: string; appointmentId?: string }) {
  const { org, canManage } = await requireOrg();
  if (org.health_check === "off") return null;
  const { m, locale } = t;
  const w = m.health;
  const supabase = await createClient();
  const [problems, overrides] = await Promise.all([
    supabase.rpc("pet_health_problems", { p_org: org.id, p_pet: petId, p_on: on }),
    supabase
      .from("health_overrides")
      .select("reason, created_at")
      .eq("org_id", org.id)
      .eq(bookingId ? "booking_id" : "appointment_id", bookingId ?? appointmentId ?? "")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (problems.error || !problems.data || problems.data.length === 0) return null;
  const lacks = problems.data.map((p) =>
    p.problem === "vaccine" ? fill(w.problems.vaccine, { vaccine: p.detail }) : p.problem === "deworming" ? w.problems.deworming : p.problem === "ticks" ? w.problems.ticks : w.problems.neutering,
  );
  const letIn = overrides.data?.[0];

  return (
    <div className="mb-4 space-y-3">
      <Notice tone={org.health_check === "refuse" && !letIn ? "error" : "info"}>
        {fill(org.health_check === "refuse" && !letIn ? w.refused : w.warned, { date: formatDate(on, locale), lacks: lacks.join(", ") })}
      </Notice>
      {letIn ? (
        <p className="font-semibold">{fill(w.letInBecause, { reason: letIn.reason })}</p>
      ) : canManage && org.health_check === "refuse" ? (
        <ActionForm action={letPetIn} className="flex flex-wrap items-end gap-2 rounded-xl border border-rule bg-paper p-4">
          {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
          {appointmentId ? <input type="hidden" name="appointmentId" value={appointmentId} /> : null}
          <div className="min-w-48 flex-1">
            <Field label={w.why}>
              <Input name="reason" required minLength={3} maxLength={300} />
            </Field>
          </div>
          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
            {w.letInButton}
          </SubmitButton>
        </ActionForm>
      ) : null}
    </div>
  );
}
