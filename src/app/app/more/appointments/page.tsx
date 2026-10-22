import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { Badge, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { APPOINTMENT_KINDS, formatMoney, PACKAGE_DAYS, PET_COATS, PRICINGS, SIZE_BANDS } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addPackage, addPackagePart, addPlace, addService, removePackage, removePackagePart, removeService, removeServicePrice, savePlace, setServicePrice } from "./actions";

export const generateMetadata = () => appTitle((m) => m.appointmentSetup.title);

export default function AppointmentSetupPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Setup />
    </Suspense>
  );
}

const SKILLS = ["groomer", "trainer", "swim_supervisor"] as const;

async function Setup() {
  const { org, canManage, canDelete } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const w = m.appointmentSetup;
  if (!org.offers_appointments) {
    return (
      <>
        <PageTitle title={w.title} />
        <Notice tone="info">{w.off}</Notice>
      </>
    );
  }
  const supabase = await createClient();
  const [places, services, prices, packages, parts, extras] = await Promise.all([
    supabase.from("appointment_places").select("id, name, opens, closes, is_active").eq("org_id", org.id).order("sort_order").order("name"),
    supabase
      .from("appointment_services")
      .select("id, kind, name, minutes, cleanup_minutes, place_id, pricing, price_minor, tax_rate_bp, sac_code, skill, checks_vaccinations, is_addon, max_people")
      .eq("org_id", org.id)
      .eq("is_active", true)
      .order("kind")
      .order("sort_order")
      .order("name"),
    supabase.from("appointment_service_prices").select("id, service_id, size, coat, breed, price_minor").eq("org_id", org.id).order("created_at"),
    supabase.from("packages").select("id, name, kind, price_minor, about").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("package_parts").select("id, package_id, service_id, extra_id, on_day, quantity").eq("org_id", org.id).order("sort_order").order("created_at"),
    supabase.from("services").select("id, name").eq("org_id", org.id).eq("kind", "addon").eq("is_active", true).order("name"),
  ]);
  if (places.error || services.error || prices.error || packages.error || parts.error || extras.error) throw new Error("Could not load appointment setup.");
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const placeName = (id: string | null) => places.data.find((p) => p.id === id)?.name ?? "";
  const serviceName = (id: string | null) => services.data.find((s) => s.id === id)?.name ?? "";
  const taxed = org.tax_mode !== "none";
  const booked = services.data.filter((s) => !s.is_addon);
  const clock = (t: string) => t.slice(0, 5);

  return (
    <>
      <PageTitle title={w.title} />
      {canManage ? null : <Notice tone="info">{w.viewOnly}</Notice>}

      <Section title={w.places} count={places.data.length}>
        <p className="mb-3 text-slate">{w.placesAbout}</p>
        {places.data.length === 0 ? (
          <Empty>{w.placesEmpty}</Empty>
        ) : (
          <Ledger>
            {places.data.map((p) => (
              <LedgerRow key={p.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{p.name}</span> <span className="text-slate">{fill(w.placeHours, { opens: clock(p.opens), closes: clock(p.closes) })}</span>{" "}
                  {p.is_active ? null : <Badge tone="attention">{w.outOfService}</Badge>}
                </span>
                {canManage ? (
                  <ActionForm action={savePlace} className="flex w-full flex-wrap items-end gap-3">
                    <input type="hidden" name="placeId" value={p.id} />
                    <div className="w-28">
                      <Field label={w.opens}>
                        <Input type="time" name="opens" defaultValue={clock(p.opens)} required />
                      </Field>
                    </div>
                    <div className="w-28">
                      <Field label={w.closes}>
                        <Input type="time" name="closes" defaultValue={clock(p.closes)} required />
                      </Field>
                    </div>
                    <label className="flex min-h-12 items-center gap-2 font-semibold">
                      <input type="checkbox" name="is_active" defaultChecked={p.is_active} className="size-5" />
                      {w.inService}
                    </label>
                    <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                      {w.savePlace}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addPlace} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label={w.placeName}>
                <Input name="name" required maxLength={60} placeholder={w.placeNameExample} />
              </Field>
            </div>
            <Field label={w.opens}>
              <Input type="time" name="opens" defaultValue="09:00" required />
            </Field>
            <Field label={w.closes}>
              <Input type="time" name="closes" defaultValue="18:00" required />
            </Field>
            <SubmitButton pendingLabel={m.common.saving}>{w.addPlaceButton}</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      <Section title={w.services} count={services.data.length}>
        <p className="mb-3 text-slate">{w.servicesAbout}</p>
        {services.data.length === 0 ? (
          <Empty>{w.servicesEmpty}</Empty>
        ) : (
          <Ledger>
            {services.data.map((s) => {
              const own = prices.data.filter((p) => p.service_id === s.id);
              return (
                <LedgerRow key={s.id}>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p>
                      <span className="font-bold">{s.name}</span> <Badge>{m.appointmentKinds[s.kind]}</Badge>{" "}
                      <span className="text-slate">{s.pricing === "quote" ? m.pricings.quote : money(s.price_minor)}</span>
                    </p>
                    <p className="text-sm text-slate">
                      {s.is_addon
                        ? w.addonLine
                        : [
                            fill(w.serviceLine, { minutes: s.minutes, place: placeName(s.place_id) }),
                            s.cleanup_minutes > 0 ? fill(w.cleanupLine, { minutes: s.cleanup_minutes }) : null,
                            s.skill ? m.skills.names[s.skill] : null,
                            m.pricings[s.pricing],
                          ]
                            .filter(Boolean)
                            .join(", ")}
                    </p>
                    {s.pricing === "by_size" || s.pricing === "by_coat" ? (
                      <details>
                        <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{fill(w.pricesTitle, { name: s.name })}</summary>
                        <p className="mb-2 text-sm text-slate">{w.pricesAbout[s.pricing]}</p>
                        <ul className="mb-3 space-y-1">
                          {own.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-2">
                              <span className="flex-1">
                                {p.breed ?? (p.coat ? m.coats[p.coat] : p.size ? m.sizes[p.size] : "")}: {money(p.price_minor)}
                              </span>
                              {canDelete ? (
                                <ActionForm action={removeServicePrice} className="contents">
                                  <input type="hidden" name="priceId" value={p.id} />
                                  <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                                    {m.common.remove}
                                  </SubmitButton>
                                </ActionForm>
                              ) : null}
                            </li>
                          ))}
                          <li className="text-sm text-slate">{fill(w.usual, { price: money(s.price_minor) })}</li>
                        </ul>
                        {canManage ? (
                          <ActionForm action={setServicePrice} className="grid items-end gap-3 sm:grid-cols-3">
                            <input type="hidden" name="serviceId" value={s.id} />
                            {s.pricing === "by_size" ? (
                              <Field label={w.size}>
                                <Select name="size" defaultValue="small">
                                  {SIZE_BANDS.map((b) => (
                                    <option key={b} value={b}>
                                      {m.sizes[b]}
                                    </option>
                                  ))}
                                </Select>
                              </Field>
                            ) : (
                              <>
                                <Field label={w.coat}>
                                  <Select name="coat" defaultValue="short">
                                    {PET_COATS.map((c) => (
                                      <option key={c} value={c}>
                                        {m.coats[c]}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                                <Field label={w.breed}>
                                  <Input name="breed" maxLength={80} placeholder={w.breedExample} />
                                </Field>
                              </>
                            )}
                            <Field label={w.price}>
                              <Input name="price" inputMode="decimal" required />
                            </Field>
                            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                              {w.addPrice}
                            </SubmitButton>
                          </ActionForm>
                        ) : null}
                      </details>
                    ) : null}
                  </div>
                  {canManage ? (
                    <ActionForm action={removeService} className="contents">
                      <input type="hidden" name="serviceId" value={s.id} />
                      <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                        {m.common.remove}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
        {canManage && places.data.length > 0 ? (
          <ActionForm action={addService} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="font-bold sm:col-span-2">{w.addService}</p>
            <Field label={w.name}>
              <Input name="name" required maxLength={80} placeholder={w.nameExample} />
            </Field>
            <Field label={w.kind}>
              <Select name="kind" defaultValue="groom">
                {APPOINTMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {m.appointmentKinds[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.place}>
              <Select name="placeId" defaultValue={places.data[0].id}>
                {places.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.minutes}>
              <Input name="minutes" inputMode="numeric" defaultValue="60" />
            </Field>
            <Field label={w.cleanup}>
              <Input name="cleanup" inputMode="numeric" defaultValue="0" />
            </Field>
            <Field label={w.pricing}>
              <Select name="pricing" defaultValue="fixed">
                {PRICINGS.map((p) => (
                  <option key={p} value={p}>
                    {m.pricings[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.price} hint={w.priceHint}>
              <Input name="price" inputMode="decimal" />
            </Field>
            <Field label={w.skill}>
              <Select name="skill" defaultValue="">
                <option value="">{w.noSkill}</option>
                {SKILLS.map((s) => (
                  <option key={s} value={s}>
                    {m.skills.names[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.maxPeople}>
              <Input name="max_people" inputMode="numeric" />
            </Field>
            {taxed ? (
              <>
                <Field label={w.rate} hint={w.rateHint}>
                  <Input name="rate" inputMode="decimal" />
                </Field>
                <Field label={w.sac}>
                  <Input name="sac" inputMode="numeric" maxLength={8} />
                </Field>
              </>
            ) : null}
            <label className="flex min-h-12 items-center gap-2 font-semibold sm:col-span-2">
              <input type="checkbox" name="checks_vaccinations" defaultChecked className="size-5" />
              {w.checksVaccinations}
            </label>
            <label className="flex min-h-12 items-center gap-2 font-semibold sm:col-span-2">
              <input type="checkbox" name="is_addon" className="size-5" />
              {w.isAddon}
            </label>
            <SubmitButton pendingLabel={m.common.saving}>{w.addServiceButton}</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      <Section title={w.packages} count={packages.data.length}>
        <p className="mb-3 text-slate">{w.packagesAbout}</p>
        {packages.data.length === 0 ? (
          <Empty>{w.packagesEmpty}</Empty>
        ) : (
          <Ledger>
            {packages.data.map((p) => {
              const own = parts.data.filter((x) => x.package_id === p.id);
              return (
                <LedgerRow key={p.id}>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p>
                      <span className="font-bold">{p.name}</span> <Badge>{m.labels.bookingKind[p.kind]}</Badge>{" "}
                      <span className="text-slate">{p.price_minor === null ? w.onRequest : money(p.price_minor)}</span>
                    </p>
                    {p.about ? <p className="text-sm text-slate">{p.about}</p> : null}
                    {own.length === 0 ? (
                      <p className="text-sm text-slate">{w.partsEmpty}</p>
                    ) : (
                      <ul className="space-y-1">
                        {own.map((x) => (
                          <li key={x.id} className="flex flex-wrap items-center gap-2">
                            <span className="flex-1">
                              {x.service_id
                                ? fill(w.partAppointment, { service: serviceName(x.service_id), day: x.on_day ? m.packageDays[x.on_day] : "" })
                                : fill(w.partExtra, { extra: extras.data.find((e) => e.id === x.extra_id)?.name ?? "", quantity: x.quantity })}
                            </span>
                            {canDelete ? (
                              <ActionForm action={removePackagePart} className="contents">
                                <input type="hidden" name="partId" value={x.id} />
                                <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                                  {m.common.remove}
                                </SubmitButton>
                              </ActionForm>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    {canManage ? (
                      <details>
                        <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{fill(w.addPart, { name: p.name })}</summary>
                        <ActionForm action={addPackagePart} className="mt-2 grid items-end gap-3 sm:grid-cols-2">
                          <input type="hidden" name="packageId" value={p.id} />
                          <Field label={w.partService}>
                            <Select name="serviceId" defaultValue="">
                              <option value="">{w.partNone}</option>
                              {booked.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={w.partDay}>
                            <Select name="on_day" defaultValue="last">
                              {PACKAGE_DAYS.map((d) => (
                                <option key={d} value={d}>
                                  {m.packageDays[d]}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={w.partExtraLabel}>
                            <Select name="extraId" defaultValue="">
                              <option value="">{w.partNone}</option>
                              {extras.data.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label={w.partQuantity}>
                            <Input name="quantity" inputMode="numeric" defaultValue="1" />
                          </Field>
                          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                            {w.addPartButton}
                          </SubmitButton>
                        </ActionForm>
                      </details>
                    ) : null}
                  </div>
                  {canManage ? (
                    <ActionForm action={removePackage} className="contents">
                      <input type="hidden" name="packageId" value={p.id} />
                      <ConfirmStep label={m.common.remove} warning={w.packagesAbout} confirm={w.yesRemove} pending={m.common.removing} />
                    </ActionForm>
                  ) : null}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addPackage} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="font-bold sm:col-span-2">{w.addPackage}</p>
            <Field label={w.packageName}>
              <Input name="name" required maxLength={80} placeholder={w.packageNameExample} />
            </Field>
            <Field label={w.packageKind}>
              <Select name="kind" defaultValue="boarding">
                <option value="boarding">{m.labels.bookingKind.boarding}</option>
                <option value="daycare">{m.labels.bookingKind.daycare}</option>
              </Select>
            </Field>
            <Field label={w.packagePrice} hint={w.packagePriceHint}>
              <Input name="price" inputMode="decimal" />
            </Field>
            {taxed ? (
              <>
                <Field label={w.rate} hint={w.rateHint}>
                  <Input name="rate" inputMode="decimal" />
                </Field>
                <Field label={w.sac}>
                  <Input name="sac" inputMode="numeric" maxLength={8} />
                </Field>
              </>
            ) : null}
            <div className="sm:col-span-2">
              <Field label={w.about}>
                <Textarea name="about" maxLength={500} />
              </Field>
            </div>
            <SubmitButton pendingLabel={m.common.saving}>{w.addPackageButton}</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>
    </>
  );
}
