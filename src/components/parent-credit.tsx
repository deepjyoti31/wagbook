import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, Input, Section } from "@/components/ui";
import { giveCredit } from "@/app/app/bookings/door-actions";
import { formatDate, formatMoney } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * A parent's credit (M38): each amount from a cancellation or given as
 * goodwill, what is left of it and when it ends, and for an owner or manager
 * a form to give some. Spent as a payment on a bill.
 */
export async function ParentCredit({ t, org, clientId, canManage }: { t: I18n; org: { id: string; currency: string }; clientId: string; canManage: boolean }) {
  const w = t.m.credit;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credit_balances")
    .select("credit_id, kind, amount_minor, left_minor, expires_on, reason, spendable")
    .eq("org_id", org.id)
    .eq("client_id", clientId)
    .order("expires_on", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load credit.");
  if (data.length === 0 && !canManage) return null;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: t.locale, trimZeros: true });
  const spendable = data.filter((c) => c.spendable).reduce((sum, c) => sum + (c.left_minor ?? 0), 0);

  return (
    <Section title={w.title} count={data.length}>
      {data.length === 0 ? (
        <Empty>{w.none}</Empty>
      ) : (
        <>
          <p className="mb-3 text-lg font-bold">{fill(w.total, { amount: money(spendable) })}</p>
          <ul className="space-y-2">
            {data.map((c) => (
              <li key={c.credit_id} className="flex flex-wrap items-center gap-2">
                <span>
                  {fill(w.line, { amount: money(c.amount_minor ?? 0), left: money(c.left_minor ?? 0), date: formatDate(c.expires_on ?? "", t.locale) })}
                </span>
                <Badge>{w.kinds[c.kind ?? "goodwill"]}</Badge>
                {!c.spendable ? <Badge>{w.ended}</Badge> : (c.left_minor ?? 0) === 0 ? <Badge>{w.usedUp}</Badge> : null}
                {c.reason ? <span className="block w-full text-sm text-slate">{c.reason}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {canManage ? (
        <ActionForm action={giveCredit} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
          <input type="hidden" name="clientId" value={clientId} />
          <Field label={w.amount}>
            <Input name="amount" inputMode="decimal" required />
          </Field>
          <Field label={w.reason}>
            <Input name="reason" required maxLength={300} placeholder={w.reasonExample} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel={t.m.common.saving}>
            {w.give}
          </SubmitButton>
        </ActionForm>
      ) : null}
    </Section>
  );
}
