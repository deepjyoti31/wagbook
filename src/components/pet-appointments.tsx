import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Input, Ledger, LedgerRow, Section, Select } from "@/components/ui";
import { saveGroomingCard, sellCourse } from "@/app/app/appointments/actions";
import { requireOrg } from "@/lib/auth";
import { addDays, formatDate, localDate, PET_COATS, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * On the pet page while the kennel offers appointments: the grooming card
 * with the last groom and when the next is due (M35), and training courses
 * with what is left of each (M36).
 */
export async function PetAppointments({ t, petId }: { t: I18n; petId: string }) {
  const { org, canManage } = await requireOrg();
  const { m, locale } = t;
  const g = m.grooming;
  const c = m.courses;
  const supabase = await createClient();
  const [pet, card, lastGroom, courses, training] = await Promise.all([
    supabase.from("pets").select("coat").eq("org_id", org.id).eq("id", petId).maybeSingle(),
    supabase.from("pet_grooming").select("usual_cut, products, skin, behaviour, every_weeks").eq("org_id", org.id).eq("pet_id", petId).maybeSingle(),
    supabase.from("appointments").select("starts_at").eq("org_id", org.id).eq("pet_id", petId).eq("kind", "groom").eq("status", "done").order("starts_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("course_balances").select("course_id, name, sessions, sessions_used, invoice_id").eq("org_id", org.id).eq("pet_id", petId).order("name"),
    supabase.from("appointment_services").select("id, name").eq("org_id", org.id).eq("kind", "training").eq("is_addon", false).eq("is_active", true).order("name"),
  ]);
  const last = lastGroom.data ? localDate(lastGroom.data.starts_at, org.time_zone) : null;
  const every = card.data?.every_weeks ?? null;
  const today = todayIn(org.time_zone);

  return (
    <>
      <Section title={g.title}>
        <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
          <p>
            {last ? fill(g.last, { date: formatDate(last, locale) }) : g.never} {last && every ? fill(g.due, { date: formatDate(addDays(last, every * 7), locale) }) : null}
          </p>
          <ActionForm action={saveGroomingCard} className="grid items-end gap-4 sm:grid-cols-2">
            <input type="hidden" name="petId" value={petId} />
            <Field label={g.coat}>
              <Select name="coat" defaultValue={pet.data?.coat ?? ""}>
                <option value="">{g.noCoat}</option>
                {PET_COATS.map((x) => (
                  <option key={x} value={x}>
                    {m.coats[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={g.usualCut}>
              <Input name="usual_cut" maxLength={300} defaultValue={card.data?.usual_cut ?? ""} />
            </Field>
            <Field label={g.products}>
              <Input name="products" maxLength={300} defaultValue={card.data?.products ?? ""} />
            </Field>
            <Field label={g.skin}>
              <Input name="skin" maxLength={300} defaultValue={card.data?.skin ?? ""} />
            </Field>
            <Field label={g.behaviour}>
              <Input name="behaviour" maxLength={300} defaultValue={card.data?.behaviour ?? ""} />
            </Field>
            <Field label={g.every}>
              <Input name="every_weeks" inputMode="numeric" defaultValue={every ?? ""} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {g.save}
            </SubmitButton>
          </ActionForm>
          <Link href={`/app/appointments/new?pet=${petId}&date=${today}`} className={buttonStyles.quiet}>
            {g.book}
          </Link>
        </div>
      </Section>

      {(courses.data ?? []).length > 0 || (canManage && (training.data ?? []).length > 0) ? (
        <Section title={c.title} count={(courses.data ?? []).length}>
          {(courses.data ?? []).length === 0 ? (
            <p className="mb-3 text-slate">{c.none}</p>
          ) : (
            <Ledger>
              {courses.data!.map((x) => (
                <LedgerRow key={x.course_id}>
                  <span className="flex-1">{fill(c.line, { name: x.name ?? "", used: x.sessions_used ?? 0, sessions: x.sessions ?? 0 })}</span>
                  {x.invoice_id ? (
                    <Link href={`/app/bills/${x.invoice_id}`} className="font-semibold underline underline-offset-4">
                      {c.bill}
                    </Link>
                  ) : null}
                </LedgerRow>
              ))}
            </Ledger>
          )}
          {canManage && (training.data ?? []).length > 0 ? (
            <ActionForm action={sellCourse} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <input type="hidden" name="petId" value={petId} />
              <p className="font-bold sm:col-span-2">{c.sell}</p>
              <Field label={c.service}>
                <Select name="serviceId" defaultValue={training.data![0].id}>
                  {training.data!.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={c.name}>
                <Input name="name" required maxLength={80} placeholder={c.nameExample} />
              </Field>
              <Field label={c.sessions}>
                <Input name="sessions" inputMode="numeric" required defaultValue="6" />
              </Field>
              <Field label={c.price}>
                <Input name="price" inputMode="decimal" required />
              </Field>
              <Field label={c.starts}>
                <Input type="date" name="starts_on" defaultValue={today} />
              </Field>
              <SubmitButton pendingLabel={m.common.saving}>{c.sellButton}</SubmitButton>
            </ActionForm>
          ) : null}
        </Section>
      ) : null}
    </>
  );
}
