"use client";

import { useState, type ComponentProps } from "react";
import { FamilyPicker, type PickablePet } from "./family-picker";
import { StayFields } from "./stay-fields";

/**
 * The pets and the stay on New booking, together, so the kennel list knows
 * whose pets are chosen and how many (a sibling's kennel, or one kennel for
 * two).
 */
export function NewBookingFields({
  pets,
  pickerWords,
  defaultPetId,
  stay,
  search,
}: {
  pets: PickablePet[];
  search?: (query: string) => Promise<PickablePet[]>;
  pickerWords: ComponentProps<typeof FamilyPicker>["words"];
  defaultPetId?: string;
  stay: Omit<ComponentProps<typeof StayFields>, "clientId" | "pets">;
}) {
  const [family, setFamily] = useState({ clientId: pets.find((p) => p.id === defaultPetId)?.clientId ?? null, pets: 1 });
  return (
    <>
      <FamilyPicker words={pickerWords} pets={pets} defaultPetId={defaultPetId} onFamilyChange={setFamily} search={search} />
      <StayFields {...stay} clientId={family.clientId} pets={family.pets} />
    </>
  );
}
