"use client";

import { useState } from "react";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { inputStyles } from "./ui";

export interface PickablePet {
  id: string;
  name: string;
  breed: string | null;
  clientId: string;
  parentName: string | null;
}

/**
 * Choose a pet, then tick any other pets of the same parent to book them
 * together. Without JavaScript the first choice still works on its own.
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
  const chosen = pets.find((p) => p.id === petId);
  const siblings = chosen ? pets.filter((p) => p.clientId === chosen.clientId && p.id !== chosen.id) : [];
  const withBreed = (p: PickablePet) => (p.breed ? fill(words.withBreed, { name: p.name, breed: p.breed }) : p.name);

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-semibold">{words.pet}</span>
        <select name="petId" required value={petId} onChange={(e) => setPetId(e.target.value)} className={inputStyles}>
          <option value="" disabled>
            {words.choose}
          </option>
          {pets.map((p) => (
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
