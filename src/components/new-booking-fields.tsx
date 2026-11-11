"use client";

import { useRef, useState, type ReactNode } from "react";
import { freeKennels, petMatches, stayFromForm, type KennelHold } from "@/lib/core/bookings";
import { formatDay } from "@/lib/core/dates";
import { formatPhone } from "@/lib/core/phone";
import { nightsBetween } from "@/lib/core/stay";
import { fill, plural, type Language } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { Icon } from "./icons";
import { PetAvatar } from "./pet-avatar";
import { Badge, buttonStyles, Field, Input, inputStyles, Select } from "./ui";

export interface PickablePet {
  id: string;
  name: string;
  breed: string | null;
  clientId: string;
  parentName: string | null;
  parentPhone: string | null;
}

/** How many pets the search lists before asking for more letters. */
const SHOWN = 8;

/**
 * New booking, as one form in two columns (D61): the pet, the stay, the kennel
 * and the price on the left; beside them what is being booked, and the kennels
 * free for the dates typed.
 *
 * A pet is found by typing (name, breed, parent or phone) and chosen from the
 * matches; other pets of the same parent can be ticked to stay too. The list
 * starts with the pets the page sent (recent ones), and typing also asks the
 * server, so a kennel with thousands of pets never sends them all to the
 * phone. The kennel list offers only kennels free for the dates typed. Two
 * pets of one parent may share a kennel: then only kennels with room for both
 * are offered, and one must be chosen. The database has the last word when the
 * booking is saved.
 */
export function NewBookingFields({
  pets: initialPets,
  search,
  defaultPetId,
  words,
  language,
  locale,
  kennels,
  holds,
  defaultKind,
  defaultStart,
  defaultEnd,
  defaultKennelId,
  sharedPrice,
  usualPrice,
  price,
  notesLabel,
  footer,
}: {
  pets: PickablePet[];
  search?: (query: string) => Promise<PickablePet[]>;
  defaultPetId?: string;
  /** m.newBooking */
  words: Messages["newBooking"];
  language: Language;
  /** The reader's locale, for dates and the names of the days of the week. */
  locale: string;
  kennels: { id: string; name: string }[];
  holds: KennelHold[];
  defaultKind: "boarding" | "daycare";
  defaultStart: string;
  defaultEnd: string;
  defaultKennelId: string;
  /** The shared kennel price for each kind of stay, written out, when the price list has one. */
  sharedPrice: { boarding: string | null; daycare: string | null };
  /** The usual price of each kind of stay, written out ("₹950"), when it is set. */
  usualPrice: { boarding: string | null; daycare: string | null };
  /** The price box for those who may set a price (its hint), or the sentence others read instead. */
  price: { canSet: true; hint: string; symbol: string } | { canSet: false; text: string };
  notesLabel: string;
  /** The buttons at the foot of the form. */
  footer: ReactNode;
}) {
  const w = words;
  const [pets, setPets] = useState(initialPets);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const asked = useRef(0);
  const [petId, setPetId] = useState(defaultPetId && initialPets.some((p) => p.id === defaultPetId) ? defaultPetId : "");
  const [also, setAlso] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const chosen = pets.find((p) => p.id === petId);
  const matches = pets.filter((p) => petMatches(p, query));
  const choose = (id: string) => {
    setPetId(id);
    // Another pet may have another parent, so the ticks start again.
    setAlso([]);
  };
  // One match is chosen for the person.
  const pickOnly = (q: string, from: PickablePet[]) => {
    const found = from.filter((p) => petMatches(p, q));
    if (q.trim() !== "" && found.length === 1) choose(found[0].id);
  };
  const find = (q: string) => {
    setQuery(q);
    pickOnly(q, pets);
    if (!search || q.trim() === "") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const mine = ++asked.current;
      const found = await search(q);
      // An answer to an older question is thrown away.
      if (mine !== asked.current || found.length === 0) return;
      const known = new Set(pets.map((p) => p.id));
      const merged = [...pets, ...found.filter((p) => !known.has(p.id))].sort((a, b) => a.name.localeCompare(b.name));
      setPets(merged);
      pickOnly(q, merged);
    }, 250);
  };
  const siblings = chosen ? pets.filter((p) => p.clientId === chosen.clientId && p.id !== chosen.id) : [];
  const withBreed = (p: PickablePet) => (p.breed ? fill(w.picker.withBreed, { name: p.name, breed: p.breed }) : p.name);
  const fullName = (p: PickablePet) => (p.parentName ? fill(w.picker.withParent, { name: withBreed(p), parent: p.parentName }) : withBreed(p));

  const [kind, setKind] = useState<"boarding" | "daycare">(defaultKind);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [kennelId, setKennelId] = useState(defaultKennelId);
  const [sharing, setSharing] = useState<"each" | "together">("each");
  const [rate, setRate] = useState("");
  const count = 1 + also.length;
  const together = count === 2 && sharing === "together";
  const stay = stayFromForm(kind, start, end);
  const offered = freeKennels(kennels, holds, stay, { clientId: chosen?.clientId ?? null, pets: together ? 2 : 1 });
  const hidden = offered.length < kennels.length;
  // A kennel chosen earlier that the new dates make taken is let go.
  const kennelValue = offered.some((k) => k.id === kennelId) ? kennelId : "";
  const shared = kind === "daycare" ? sharedPrice.daycare : sharedPrice.boarding;
  const kennelHint = together
    ? [w.shareHint, shared ? fill(w.sharedPriceNote, { price: shared }) : null, hidden ? w.kennelsTaken : null].filter(Boolean).join(" ")
    : hidden
      ? `${w.kennelsTaken} ${w.kennelHint}`
      : w.kennelHint;
  // A boarding stay ends after it begins; the form says so as the dates are typed.
  const endTooEarly = kind === "boarding" && end !== "" && start !== "" && end <= start;
  const datesRight = stay !== null && !endTooEarly && (kind === "daycare" || end !== "");
  const units = datesRight && stay ? (kind === "boarding" ? nightsBetween(stay.startDate, stay.endDate) : nightsBetween(stay.startDate, stay.endDate) + 1) : null;
  const usual = kind === "boarding" ? usualPrice.boarding : usualPrice.daycare;
  const typed = price.canSet && rate.trim() !== "" ? `${price.symbol}${rate.trim()}` : null;
  const shownPrice = typed ?? usual;
  const heading = "text-lg font-[750] tracking-[-0.01em]";
  const card = (on: boolean) => `flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border bg-paper px-4 py-3.5 ${on ? "border-2 border-ink bg-wash" : "border-rule-strong"}`;

  return (
    <div className="grid items-start gap-(--wb-gap) min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
      <div className="@container overflow-hidden rounded-2xl border border-rule bg-paper">
        <div className="flex flex-col gap-6 p-5 lg:p-6">
          <section aria-labelledby="nb-pet" className="flex flex-col gap-3.5">
            <h2 id="nb-pet" className={heading}>
              {w.sections.pet}
            </h2>
            {chosen ? (
              <>
                <input type="hidden" name="petId" value={chosen.id} />
                <div className="flex flex-wrap items-center gap-3.5 rounded-xl border-2 border-ink bg-wash px-4 py-3.5">
                  <PetAvatar name={chosen.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[16.5px] font-bold">{fill(w.picker.bookWith, { pet: chosen.name })}</p>
                    <p className="text-sm text-slate">{[chosen.breed, chosen.parentName, chosen.parentPhone ? formatPhone(chosen.parentPhone) : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" className={buttonStyles.quiet} onClick={() => choose("")}>
                    {w.change}
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="block">
                  <span className="mb-1.5 block text-[15px] font-[650]">{w.picker.find}</span>
                  <span className="relative block">
                    <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate" />
                    <input type="search" value={query} onChange={(e) => find(e.target.value)} autoComplete="off" className={`${inputStyles} pl-[42px]!`} />
                  </span>
                </label>
                <p className="-mt-2 text-sm text-slate">{matches.length === 0 ? w.picker.noMatch : w.picker.findHint}</p>
                {/* The matches, as a choice of one: it works as a plain form without JavaScript too. */}
                <ul className="flex flex-col gap-2" role="radiogroup" aria-label={w.picker.choose}>
                  {matches.slice(0, SHOWN).map((p) => (
                    <li key={p.id}>
                      <label className={`${card(false)} items-center! hover:bg-wash`}>
                        <input type="radio" name="petId" value={p.id} required aria-label={fullName(p)} onChange={() => choose(p.id)} className="size-5 shrink-0" />
                        <span className="min-w-0">
                          <span className="font-bold">{p.name}</span> <span className="text-sm text-slate">{[p.breed, p.parentName].filter(Boolean).join(" · ")}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {matches.length > SHOWN ? <p className="text-sm text-slate">{fill(w.free.more, { n: matches.length - SHOWN })}</p> : null}
              </>
            )}
            {chosen && siblings.length > 0 ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-[15px] font-[650]">{chosen.parentName ? fill(w.picker.otherPets, { parent: chosen.parentName }) : w.picker.otherPetsNoName}</legend>
                <div className="grid gap-2 @lg:grid-cols-2">
                  {siblings.map((p) => (
                    <label key={p.id} className={`${card(also.includes(p.id))} items-center!`}>
                      <input
                        type="checkbox"
                        name="alsoPetId"
                        value={p.id}
                        checked={also.includes(p.id)}
                        aria-label={withBreed(p)}
                        onChange={(e) => setAlso(e.target.checked ? [...also, p.id] : also.filter((x) => x !== p.id))}
                        className="size-5 shrink-0"
                      />
                      <span>
                        <span className="font-bold">{p.name}</span> {p.breed ? <span className="text-sm text-slate">{p.breed}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </section>

          <section aria-labelledby="nb-stay" className="flex flex-col gap-3.5">
            <h2 id="nb-stay" className={heading}>
              {w.sections.stay}
            </h2>
            <div className="grid gap-4 @lg:grid-cols-2" role="radiogroup" aria-labelledby="nb-stay">
              {(["boarding", "daycare"] as const).map((k) => (
                <label key={k} className={card(kind === k)}>
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="mt-0.5 size-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-bold">{k === "boarding" ? w.boarding : w.daycare}</span>
                    <span className="mt-0.5 block text-sm text-slate">
                      {k === "boarding"
                        ? usualPrice.boarding
                          ? fill(w.usualNight, { price: usualPrice.boarding })
                          : ""
                        : usualPrice.daycare
                          ? fill(w.usualDay, { price: usualPrice.daycare })
                          : w.dayRepeats}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-4 @lg:grid-cols-2">
              <Field label={w.checkInDate}>
                <Input name="startDate" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
              </Field>
              <div>
                <Field label={w.checkOutDate} hint={endTooEarly || kind === "boarding" ? undefined : w.checkOutHint}>
                  <Input name="endDate" type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-invalid={endTooEarly || undefined} aria-describedby={endTooEarly ? "nb-end-error" : undefined} />
                </Field>
                {endTooEarly ? (
                  <p id="nb-end-error" role="alert" className="mt-2 flex items-start gap-2 text-sm font-bold text-alert-ink">
                    <Icon name="warning" className="mt-px size-[18px]" />
                    {w.endAfterStart}
                  </p>
                ) : null}
              </div>
            </div>
            {count === 2 ? (
              <fieldset className="rounded-xl border border-rule p-3.5">
                <legend className="px-1 font-semibold">{w.kennels}</legend>
                {(["each", "together"] as const).map((choice) => (
                  <label key={choice} className="flex min-h-12 items-center gap-3">
                    <input type="radio" name="sharing" value={choice} checked={sharing === choice} onChange={() => setSharing(choice)} className="size-5" />
                    <span>{choice === "each" ? w.kennelEach : w.kennelTogether}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {kind === "daycare" ? (
              <div className="space-y-3 rounded-xl border border-rule p-3.5">
                <label className="flex min-h-12 items-start gap-3">
                  <input type="checkbox" name="use_pack" defaultChecked className="mt-1 size-5" />
                  <span>{w.usePack}</span>
                </label>
                {count <= 1 ? (
                  <details>
                    <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold">{w.repeat}</summary>
                    <p className="mb-2 text-sm text-slate">{w.repeatHint}</p>
                    <fieldset className="flex flex-wrap gap-x-4">
                      <legend className="mb-1 font-semibold">{w.repeatOn}</legend>
                      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                        <label key={d} className="flex min-h-12 items-center gap-2">
                          <input type="checkbox" name="repeat_day" value={d} className="size-5" />
                          {/* 4 January 1970 was a Sunday. */}
                          <span>{new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(1970, 0, 4 + d)))}</span>
                        </label>
                      ))}
                    </fieldset>
                    <Field label={w.repeatUntil}>
                      <Input name="repeat_until" type="date" min={start} />
                    </Field>
                  </details>
                ) : null}
              </div>
            ) : null}
          </section>

          <section aria-labelledby="nb-kennel" className="flex flex-col gap-3.5">
            <h2 id="nb-kennel" className={heading}>
              {w.sections.kennelPrice}
            </h2>
            <div className="grid gap-4 @lg:grid-cols-2">
              <Field label={w.kennel} hint={kennelHint}>
                <Select name="kennelId" value={kennelValue} onChange={(e) => setKennelId(e.target.value)} required={together}>
                  <option value="">{together ? w.chooseKennel : w.decideAtCheckIn}</option>
                  {offered.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {price.canSet ? (
                <Field label={w.price} hint={price.hint}>
                  <span className="relative block">
                    <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate">
                      {price.symbol}
                    </span>
                    <Input name="rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} className="pl-8!" />
                  </span>
                </Field>
              ) : (
                <p className="self-center text-slate">{price.text}</p>
              )}
            </div>
            <Field label={notesLabel}>
              <textarea name="notes" rows={3} maxLength={2000} className={inputStyles} />
            </Field>
          </section>
        </div>
        <div className="border-t border-rule bg-wash px-5 py-4 lg:px-6">{footer}</div>
      </div>

      <aside className="flex flex-col">
        <section aria-labelledby="nb-summary" className="mb-(--wb-gap) rounded-2xl border border-rule bg-paper p-5">
          <h2 id="nb-summary" className={heading}>
            {w.summary.title}
          </h2>
          {chosen ? (
            <div className="mt-3 flex items-center gap-3">
              <PetAvatar name={chosen.name} />
              <div className="min-w-0">
                <p className="font-bold">{also.length > 0 ? fill(w.summary.andMore, { pet: chosen.name, n: also.length }) : chosen.name}</p>
                <p className="text-sm text-slate">
                  {(kind === "boarding" ? w.boarding : w.daycare).replace(/\s*\(.*\)$/, "")} ·{" "}
                  {datesRight && stay ? (stay.startDate === stay.endDate ? formatDay(stay.startDate, locale) : fill(w.picker.range, { start: formatDay(stay.startDate, locale), end: formatDay(stay.endDate, locale) })) : w.summary.datesToFix}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-slate">{w.summary.noPet}</p>
          )}
          <dl className="mt-4 flex flex-col gap-3 border-t border-rule pt-4 text-[15px]">
            <div className="flex justify-between gap-3">
              <dt>{w.summary.price}</dt>
              <dd className="font-bold">{shownPrice ? fill(kind === "boarding" ? w.summary.aNight : w.summary.aDay, { price: shownPrice }) : w.summary.usualPrice}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>{kind === "boarding" ? w.summary.nights : w.summary.days}</dt>
              <dd className={units === null ? "text-sm text-slate" : "font-bold"}>{units === null ? w.summary.afterDates : units}</dd>
            </div>
          </dl>
        </section>

        {stay && kennels.length > 0 ? (
          <section aria-labelledby="nb-free" className="mb-(--wb-gap) rounded-2xl border border-rule bg-paper p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="nb-free" className={heading}>
                {fill(w.free.from, { date: formatDay(stay.startDate, locale) })}
              </h2>
              <Badge tone={offered.length > 0 ? "good" : "alert"}>{plural(language, offered.length, w.free.count)}</Badge>
            </div>
            {offered.length === 0 ? (
              <p className="mt-3 text-slate">{w.free.none}</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {offered.slice(0, 18).map((k) => (
                  <li key={k.id}>
                    <button type="button" onClick={() => setKennelId(k.id)} aria-pressed={kennelValue === k.id} className={`door-tag ${kennelValue === k.id ? "outline-2 outline-offset-2 outline-ink" : ""}`}>
                      {k.name}
                    </button>
                  </li>
                ))}
                {offered.length > 18 ? <li className="self-center text-sm text-slate">{fill(w.free.more, { n: offered.length - 18 })}</li> : null}
              </ul>
            )}
          </section>
        ) : null}
      </aside>
    </div>
  );
}
