import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, Notice, Section, Select } from "@/components/ui";
import { applyPackageToStay, groomBeforeHome } from "@/app/app/appointments/actions";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatMoney, localClock, localDate, packageDayDate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

interface StayAppointment {
  id: string;
  status: "requested" | "confirmed" | "done" | "no_show" | "cancelled";
  starts_at: string;
  in_package: boolean;
  service_id: string;
  appointment_services: { name: string } | null;
}

/**
 * A stay's appointments (M34), its package and what of it is still to book
 * (M37), and Groom before going home (M35), on the booking page.
 */
export async function StayAppointments({
  t,
  booking: b,
  open,
  appointments,
  packageItems,
  notice,
}: {
  t: I18n;
  booking: { id: string; pet_id: string; kind: "boarding" | "daycare"; start_date: string; end_date: string; expected_departure: string | null; package_id: string | null; package_price_minor: number | null; packages: { name: string } | null };
  open: boolean;
  appointments: readonly StayAppointment[];
  packageItems: readonly { id: string; description: string; quantity: number }[];
  notice: "applied" | "left" | null;
}) {
  const { org, canManage } = await requireOrg();
  const { m, locale } = t;
  const w = m.stayAppointments;
  const supabase = await createClient();
  const [parts, packages, grooms] = await Promise.all([
    b.package_id
      ? supabase.from("package_parts").select("id, service_id, on_day, appointment_services(name)").eq("org_id", org.id).eq("package_id", b.package_id).not("service_id", "is", null).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    !b.package_id && open ? supabase.from("packages").select("id, name, price_minor").eq("org_id", org.id).eq("kind", b.kind).eq("is_active", true).order("name") : Promise.resolve({ data: [], error: null }),
    org.offers_appointments && open
      ? supabase.from("appointment_services").select("id, name").eq("org_id", org.id).eq("kind", "groom").eq("is_addon", false).eq("is_active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const today = todayIn(org.time_zone);
  // Parts of the package not booked yet: each appointment part against the live package appointments of its service.
  const booked = appointments.filter((a) => a.in_package && a.status !== "cancelled");
  const toBook = (parts.data ?? []).filter((part, i, all) => {
    const before = all.slice(0, i).filter((x) => x.service_id === part.service_id).length;
    return booked.filter((a) => a.service_id === part.service_id).length <= before;
  });
  const pickUp = (b.expected_departure ?? org.check_out_time).slice(0, 5);
  const bookFrom = b.start_date > today ? b.start_date : today;

  return (
    <Section title={w.title} count={appointments.filter((a) => a.status !== "cancelled").length}>
      {notice ? <Notice tone={notice === "left" ? "info" : "ok"}>{notice === "left" ? w.appliedLeft : w.applied}</Notice> : null}
      {b.package_id ? (
        <div className="mb-4 space-y-2 rounded-xl border border-rule bg-paper p-4">
          <p className="font-bold">{fill(w.packageIs, { name: b.packages?.name ?? "", price: money(b.package_price_minor ?? 0) })}</p>
          {packageItems.map((i) => (
            <p key={i.id} className="text-slate">
              {w.inPackage}: {fill(w.extraInPackage, { name: i.description, quantity: Number(i.quantity) })}
            </p>
          ))}
          {toBook.length > 0 && open ? (
            <>
              <p className="font-semibold">{w.toBook}</p>
              <ul className="space-y-2">
                {toBook.map((part) => {
                  const day = packageDayDate(part.on_day ?? "first", b.start_date, b.end_date);
                  return (
                    <li key={part.id} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1">
                        {part.appointment_services?.name}, {formatDate(day, locale)}
                      </span>
                      <Link href={`/app/appointments/new?pet=${b.pet_id}&service=${part.service_id}&date=${day}&package=1`} className={buttonStyles.secondary}>
                        {w.bookPart}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}

      {appointments.length === 0 ? (
        <Empty>{w.empty}</Empty>
      ) : (
        <Ledger>
          {appointments.map((a) => (
            <li key={a.id}>
              <Link href={`/app/appointments/${a.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ground">
                <span className="font-bold tabular-nums">
                  {formatDate(localDate(a.starts_at, org.time_zone), locale)}, {localClock(a.starts_at, org.time_zone)}
                </span>
                <span className="min-w-0 flex-1">
                  {a.appointment_services?.name}
                  {a.in_package ? ` (${w.inPackage})` : ""}
                </span>
                <Badge tone={a.status === "requested" ? "attention" : a.status === "done" ? "good" : a.status === "cancelled" ? "alert" : "neutral"}>{m.appointmentStatus[a.status]}</Badge>
              </Link>
            </li>
          ))}
        </Ledger>
      )}

      {open && org.offers_appointments ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={`/app/appointments/new?pet=${b.pet_id}&date=${bookFrom}`} className={buttonStyles.secondary}>
            {w.book}
          </Link>
        </div>
      ) : null}

      {open && (grooms.data ?? []).length > 0 ? (
        <ActionForm action={groomBeforeHome} className="mt-4 space-y-3 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="bookingId" value={b.id} />
          <p className="font-bold">{w.groomBefore}</p>
          {grooms.data!.length > 1 ? (
            <Field label={m.newAppointment.service}>
              <Select name="serviceId" defaultValue={grooms.data![0].id}>
                {grooms.data!.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="serviceId" value={grooms.data![0].id} />
          )}
          <p className="text-sm text-slate">{fill(w.groomBeforeHint, { service: grooms.data![0].name, date: formatDate(b.end_date, locale), time: pickUp })}</p>
          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
            {w.groomBefore}
          </SubmitButton>
        </ActionForm>
      ) : null}

      {open && !b.package_id && (packages.data ?? []).length > 0 ? (
        <ActionForm action={applyPackageToStay} className="mt-4 grid items-end gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
          <input type="hidden" name="bookingId" value={b.id} />
          <p className="font-bold sm:col-span-2">{w.addPackage}</p>
          <Field label={w.choosePackage}>
            <Select name="packageId" defaultValue={packages.data![0].id}>
              {packages.data!.map((p) => (
                <option key={p.id} value={p.id}>
                  {fill(w.packageOption, { name: p.name, price: p.price_minor === null ? m.appointmentSetup.onRequest : money(p.price_minor) })}
                </option>
              ))}
            </Select>
          </Field>
          {canManage ? (
            <Field label={w.packagePrice}>
              <Input name="price" inputMode="decimal" />
            </Field>
          ) : null}
          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
            {w.addPackageButton}
          </SubmitButton>
        </ActionForm>
      ) : null}
    </Section>
  );
}
