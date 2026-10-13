"use client";

import { useState } from "react";
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
export function FamilyPicker({ pets, defaultPetId, defaultAlso = [] }: { pets: PickablePet[]; defaultPetId?: string; defaultAlso?: string[] }) {
  const [petId, setPetId] = useState(defaultPetId ?? "");
  const chosen = pets.find((p) => p.id === petId);
  const siblings = chosen ? pets.filter((p) => p.clientId === chosen.clientId && p.id !== chosen.id) : [];

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-semibold">Pet</span>
        <select name="petId" required value={petId} onChange={(e) => setPetId(e.target.value)} className={inputStyles}>
          <option value="" disabled>
            Choose a pet
          </option>
          {pets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.breed ? `, ${p.breed}` : ""}
              {p.parentName ? ` (${p.parentName})` : ""}
            </option>
          ))}
        </select>
      </label>
      {siblings.length > 0 ? (
        <fieldset className="rounded-lg border border-rule p-3">
          <legend className="px-1 font-semibold">Book with {chosen?.name}</legend>
          <p className="mb-2 text-slate">Other pets of {chosen?.parentName ?? "the same parent"}. Tick any staying too.</p>
          {siblings.map((p) => (
            <label key={p.id} className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name="alsoPetId" value={p.id} defaultChecked={defaultAlso.includes(p.id)} className="size-5" />
              <span>
                {p.name}
                {p.breed ? `, ${p.breed}` : ""}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}
