/**
 * A pet's photo, small and round, so staff recognise the dog on every row.
 * Falls back to the first letter of its name. Server-safe.
 */
export function PetAvatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "md" | "lg" }) {
  const box = size === "lg" ? "size-24 text-3xl" : "size-11 text-lg";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file; next/image would re-host it
    return <img src={url} alt="" className={`${box} shrink-0 rounded-full bg-ground object-cover`} loading="lazy" />;
  }
  return (
    <span aria-hidden="true" className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-ground font-bold text-slate`}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}
