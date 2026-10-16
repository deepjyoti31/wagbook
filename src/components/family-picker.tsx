"use client";

import { useState } from "react";
import { petMatches } from "@/lib/core/bookings";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { inputStyles } from "./ui";

export interface PickablePet {
  id: string;
  name: string;
  breed: string | null;
  clientId: string;
  parentName: string | null;
  parentPhone: string | null;
}

/**
 * Choose a pet, then tick any other pets of the same parent to book them
 * together. A search box above the list narrows it by name, breed, parent or
 * phone. Without JavaScript the list and the first choice still work on their
 * own.
 */
export function FamilyPicker({
  pets,
  words,
  defaultPetId,
  defaultAlso = [],
}: {
  pets: PickablePet[];
  /** m.newBooking.picker */
  words: Messages["newBooking"]["picker"];
  defaultPetId?: string;
  defaultAlso?: string[];
}) {
  const [petId, setPetId] = useState(defaultPetId ?? "");
  const [query, setQuery] = useState("");
  const chosen = pets.find((p) => p.id === petId);
  // The chosen pet stays in the list whatever is typed, so the choice never vanishes.
  const shown = pets.filter((p) => p.id === petId || petMatches(p, query));
  const find = (q: string) => {
    setQuery(q);
    const matches = pets.filter((p) => petMatches(p, q));
    if (q.trim() !== "" && matches.length === 1) setPetId(matches[0].id);
  };
  const siblings = chosen ? pets.filter((p) => p.clientId === chosen.clientId && p.id !== chosen.id) : [];
  const withBreed = (p: PickablePet) => (p.breed ? fill(words.withBreed, { name: p.name, breed: p.breed }) : p.name);

  return (
    <div className="space-y-3">
      {pets.length > 1 ? (
        <label className="block">
          <span className="mb-1 block font-semibold">{words.find}</span>
          <input type="search" value={query} onChange={(e) => find(e.target.value)} placeholder={words.findHint} autoComplete="off" className={inputStyles} />
          {shown.length === 0 ? <span className="mt-1 block text-sm text-slate">{words.noMatch}</span> : null}
        </label>
      ) : null}
      <label className="block">
        <span className="mb-1 block font-semibold">{words.pet}</span>
        <select name="petId" required value={petId} onChange={(e) => setPetId(e.target.value)} className={inputStyles}>
          <option value="" disabled>
            {words.choose}
          </option>
          {shown.map((p) => (
            <option key={p.id} value={p.id}>
              {p.parentName ? fill(words.withParent, { name: withBreed(p), parent: p.parentName }) : withBreed(p)}
            </option>
          ))}
        </select>
      </label>
      {chosen && siblings.length > 0 ? (
        <fieldset className="rounded-lg border border-rule p-3">
          <legend className="px-1 font-semibold">{fill(words.bookWith, { pet: chosen.name })}</legend>
          <p className="mb-2 text-slate">{chosen.parentName ? fill(words.otherPets, { parent: chosen.parentName }) : words.otherPetsNoName}</p>
          {siblings.map((p) => (
            <label key={p.id} className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name="alsoPetId" value={p.id} defaultChecked={defaultAlso.includes(p.id)} className="size-5" />
              <span>{withBreed(p)}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
