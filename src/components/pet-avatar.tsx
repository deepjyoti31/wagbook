/**
 * A pet's photo, small and rounded, so staff recognise the dog on every row.
 * Without a photo it shows the first letter of the name on a soft colour that
 * stays the same for that name (the colours are `.pet-avatar` in globals.css),
 * so a long list is easier to scan. Server-safe.
 */
export function PetAvatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-[76px] rounded-[20px] text-[30px]" : "size-11 rounded-[13px] text-base sm:size-[46px] sm:rounded-[14px] sm:text-[17px]";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file; next/image would re-host it
    return <img src={url} alt="" className={`${box} shrink-0 bg-ground object-cover`} loading="lazy" />;
  }
  return (
    <span aria-hidden="true" data-tone={avatarTone(name)} className={`pet-avatar ${box} inline-flex shrink-0 items-center justify-center font-extrabold`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

/** One of seven soft colours, picked from the name so the same pet always gets the same one. */
export function avatarTone(name: string): number {
  let sum = 0;
  for (const ch of name.trim().toLowerCase()) sum = (sum * 31 + (ch.codePointAt(0) ?? 0)) % 9973;
  return sum % 7;
}
