"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { activeHref } from "@/lib/menu";
import type { Messages } from "@/messages";

type Item = { href: string; label: string };

/**
 * Main navigation, in the shape that suits the screen:
 *   laptop (lg and up)  a sidebar down the left, with the day's work (and the money, for managers) from More one click away
 *   tablet (sm to lg)   a bar along the top
 *   phone               a bar along the bottom, within thumb reach
 * Only one of the two navs is shown at a time, so a screen reader meets one.
 * The words come from the server, in the person's language.
 */
export function Nav({
  words,
  lang,
  kennelName,
  calendar,
  groups,
}: {
  words: Messages["nav"];
  lang: string;
  kennelName: string;
  calendar: string;
  /** The groups of More shown in the sidebar, each with its heading and links. */
  groups: { title: string; links: Item[] }[];
}) {
  const pathname = usePathname();
  // The root layout is drawn before the language is known; say it here.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Play is part of the care round and parents sit with their pets, on every screen.
  const path = pathname.startsWith("/app/play") ? "/app/care" : pathname.startsWith("/app/clients") ? "/app/dogs" : pathname;

  const main: Item[] = [
    { href: "/app", label: words.today },
    { href: "/app/bookings", label: words.bookings },
    { href: "/app/care", label: words.care },
    { href: "/app/dogs", label: words.pets },
    { href: "/app/more", label: words.more },
  ];
  // On the small bars the calendar is part of bookings, and anything else (bills, the kitchen, the shop) lives under More.
  const compactPath = path.startsWith("/app/calendar") ? "/app/bookings" : path;
  const compactActive = activeHref(compactPath, main.map((i) => i.href)) ?? "/app/more";

  // More stays in the first block, so it is in view without scrolling the sidebar.
  const side: Item[] = [main[0], main[1], { href: "/app/calendar", label: calendar }, main[2], main[3], main[4]];
  const sideAll = [...side, ...groups.flatMap((g) => g.links)];
  const sideActive = activeHref(path, sideAll.map((i) => i.href)) ?? "/app/more";

  const link = (item: Item, active: boolean, wide: boolean) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-12 items-center rounded-lg px-3 text-base font-semibold ${
        wide ? "w-full" : "flex-1 justify-center px-2 sm:flex-none sm:px-3"
      } ${active ? "bg-ink text-paper" : "text-ink hover:bg-ground"}`}
    >
      {item.label}
    </Link>
  );

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 lg:hidden">
        <Link href="/app" className="hidden min-w-0 truncate text-lg font-extrabold tracking-tight sm:block">
          {kennelName}
        </Link>
        <nav aria-label={words.label} className="flex flex-1 justify-around gap-1 sm:flex-none sm:justify-start">
          {main.map((item) => link(item, compactActive === item.href, false))}
        </nav>
      </div>

      <div className="hidden lg:flex lg:flex-col lg:gap-5">
        <Link href="/app" className="block break-words px-3 pt-2 text-xl font-extrabold leading-tight tracking-tight">
          {kennelName}
        </Link>
        <nav aria-label={words.label} className="flex flex-col gap-5 pb-4">
          <ul className="space-y-1">
            {side.map((item) => (
              <li key={item.href}>{link(item, sideActive === item.href, true)}</li>
            ))}
          </ul>
          {groups.map((g) =>
            g.links.length === 0 ? null : (
              <div key={g.title}>
                <p className="mb-1 px-3 text-sm font-semibold text-slate">{g.title}</p>
                <ul className="space-y-1">
                  {g.links.map((item) => (
                    <li key={item.href}>{link(item, sideActive === item.href, true)}</li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </nav>
      </div>
    </>
  );
}
