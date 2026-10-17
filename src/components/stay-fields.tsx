"use client";

import { useState } from "react";
import { freeKennels, stayFromForm, type KennelHold } from "@/lib/core/bookings";
import type { Messages } from "@/messages";
import { Field, Input, Select } from "./ui";

/**
 * The kind of stay, its dates and its kennel, on New booking. The kennel list
 * offers only kennels free for the dates typed, and follows them as they
 * change. Without JavaScript the list is the one for the dates the page opened
 * with. Either way the database has the last word when the booking is saved.
 */
export function StayFields({
  words,
  kennels,
  holds,
  defaultKind,
  defaultStart,
  defaultEnd,
  defaultKennelId,
}: {
  /** m.newBooking */
  words: Messages["newBooking"];
  kennels: { id: string; name: string }[];
  holds: KennelHold[];
  defaultKind: "boarding" | "daycare";
  defaultStart: string;
  defaultEnd: string;
  defaultKennelId: string;
}) {
  const [kind, setKind] = useState<string>(defaultKind);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [kennelId, setKennelId] = useState(defaultKennelId);
  const offered = freeKennels(kennels, holds, stayFromForm(kind, start, end));
  const hidden = offered.length < kennels.length;
  // A kennel chosen earlier that the new dates make taken is let go.
  const value = offered.some((k) => k.id === kennelId) ? kennelId : "";

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
      <Field label={words.kennel} hint={hidden ? `${words.kennelsTaken} ${words.kennelHint}` : words.kennelHint}>
        <Select name="kennelId" value={value} onChange={(e) => setKennelId(e.target.value)}>
          <option value="">{words.decideAtCheckIn}</option>
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
