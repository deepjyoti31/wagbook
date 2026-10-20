"use client";

import { useState } from "react";
import { freeKennels, stayFromForm, type KennelHold } from "@/lib/core/bookings";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { Field, Input, Select } from "./ui";

/**
 * The kind of stay, its dates and its kennel, on New booking. The kennel list
 * offers only kennels free for the dates typed, and follows them as they
 * change. Two pets of one parent may share a kennel: then only kennels with
 * room for both are offered, and one must be chosen. Without JavaScript the
 * list is the one for the dates the page opened with. Either way the database
 * has the last word when the booking is saved.
 */
export function StayFields({
  words,
  kennels,
  holds,
  defaultKind,
  defaultStart,
  defaultEnd,
  defaultKennelId,
  clientId,
  pets,
  sharedPrice,
}: {
  /** m.newBooking */
  words: Messages["newBooking"];
  kennels: { id: string; name: string }[];
  holds: KennelHold[];
  defaultKind: "boarding" | "daycare";
  defaultStart: string;
  defaultEnd: string;
  defaultKennelId: string;
  /** The parent of the pets chosen, so a sibling's kennel can be offered. */
  clientId: string | null;
  /** How many pets are chosen. */
  pets: number;
  /** The shared kennel price for each kind of stay, written out, when the price list has one. */
  sharedPrice: { boarding: string | null; daycare: string | null };
}) {
  const [kind, setKind] = useState<string>(defaultKind);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [kennelId, setKennelId] = useState(defaultKennelId);
  const [sharing, setSharing] = useState<"each" | "together">("each");
  const together = pets === 2 && sharing === "together";
  const offered = freeKennels(kennels, holds, stayFromForm(kind, start, end), { clientId, pets: together ? 2 : 1 });
  const hidden = offered.length < kennels.length;
  // A kennel chosen earlier that the new dates make taken is let go.
  const value = offered.some((k) => k.id === kennelId) ? kennelId : "";
  const price = kind === "daycare" ? sharedPrice.daycare : sharedPrice.boarding;
  const hint = together
    ? [words.shareHint, price ? fill(words.sharedPriceNote, { price }) : null, hidden ? words.kennelsTaken : null].filter(Boolean).join(" ")
    : hidden
      ? `${words.kennelsTaken} ${words.kennelHint}`
      : words.kennelHint;

  return (
    <>
      <Field label={words.stay}>
        <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="boarding">{words.boarding}</option>
          <option value="daycare">{words.daycare}</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={words.checkInDate}>
          <Input name="startDate" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label={words.checkOutDate} hint={words.checkOutHint}>
          <Input name="endDate" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>
      {pets === 2 ? (
        <fieldset className="rounded-lg border border-rule p-3">
          <legend className="px-1 font-semibold">{words.kennels}</legend>
          {(["each", "together"] as const).map((choice) => (
            <label key={choice} className="flex min-h-12 items-center gap-3">
              <input type="radio" name="sharing" value={choice} checked={sharing === choice} onChange={() => setSharing(choice)} className="size-5" />
              <span>{choice === "each" ? words.kennelEach : words.kennelTogether}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <Field label={words.kennel} hint={hint}>
        <Select name="kennelId" value={value} onChange={(e) => setKennelId(e.target.value)} required={together}>
          <option value="">{together ? words.chooseKennel : words.decideAtCheckIn}</option>
          {offered.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
