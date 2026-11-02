"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { BrandMark, Icon, type IconName } from "@/components/icons";
import { activeHref } from "@/lib/menu";
import type { Messages } from "@/messages";

type Item = { href: string; label: string };

/** The icon beside each link. A link with none here is shown without one. */
const ICONS: Record<string, IconName> = {
  "/app": "today",
  "/app/bookings": "bookings",
  "/app/calendar": "calendar",
  "/app/care": "care",
  "/app/dogs": "paw",
  "/app/more": "more",
  "/app/bills": "bill",
  "/app/appointments": "calendarAppointments",
  "/app/more/intake": "form",
  "/app/more/house": "checklist",
  "/app/kitchen": "kitchen",
  "/app/food": "truck",
  "/app/shop": "bag",
  "/app/more/orders": "box",
  "/app/more/reports": "chart",
  "/app/more/expenses": "wallet",
  "/app/more/history": "clock",
};

/**
 * Main navigation, in the shape that suits the screen (D58, D59):
 *   laptop (lg and up)  a dark sidebar down the left: search, the main links, the day's work and
 *                       the money (for managers) from More, and who is signed in
 *   tablet (sm to lg)   a white bar along the top with the kennel's name
 *   phone               a bar along the bottom, icons over words, within thumb reach
 * Only one of the two navs is shown at a time, so a screen reader meets one.
 * The words come from the server, in the person's language.
 */
export function Nav({
  words,
  lang,
  kennelName,
  calendar,
  groups,
  search,
  person,
}: {
  words: Messages["nav"];
  lang: string;
  kennelName: string;
  calendar: string;
  /** The groups of More shown in the sidebar, each with its heading and links. */
  groups: { title: string; links: Item[] }[];
  /** The bookings search, offered at the top of the sidebar. */
  search: { label: string; placeholder: string };
  /** Who is signed in, and as what, at the foot of the sidebar. */
  person: { name: string; role: string };
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

  const sideLink = (item: Item) => {
    const active = sideActive === item.href;
    const icon = ICONS[item.href];
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-11 w-full items-center gap-3 rounded-[0.625rem] px-3 text-[0.9375rem] font-semibold transition-colors ${
            active ? "bg-paper text-ink" : "text-paper/80 hover:bg-ink-soft hover:text-paper"
          }`}
        >
          {icon ? <Icon name={icon} /> : <span className="size-5 shrink-0" />}
          <span className="min-w-0 break-words leading-tight">{item.label}</span>
        </Link>
      </li>
    );
  };

  return (
    <>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 lg:hidden">
        <Link href="/app" className="hidden min-w-0 items-center gap-2.5 sm:flex">
          <BrandMark className="size-8" />
          <span className="truncate text-lg font-extrabold tracking-tight">{kennelName}</span>
        </Link>
        <nav aria-label={words.label} className="flex flex-1 justify-around sm:ml-auto sm:flex-none sm:justify-start sm:gap-1">
          {main.map((item) => {
            const active = compactActive === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[0.625rem] px-1 text-xs font-semibold sm:min-h-11 sm:flex-none sm:flex-row sm:px-3.5 sm:text-[0.9375rem] ${
                  active ? "font-extrabold text-ink sm:bg-ink sm:font-semibold sm:text-paper" : "text-slate sm:text-ink sm:hover:bg-ground"
                }`}
              >
                <Icon name={ICONS[item.href]} className="size-6 sm:hidden" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="wb-dark hidden min-h-full flex-col gap-5 px-3.5 py-5 text-paper lg:flex">
        <Link href="/app" className="flex items-center gap-3 px-1.5">
          <BrandMark />
          <span className="min-w-0">
            <span className="block text-[1.0625rem] font-extrabold leading-tight tracking-tight">Wagbook</span>
            <span className="block break-words text-sm leading-tight text-haze">{kennelName}</span>
          </span>
        </Link>

        <form action="/app/bookings" role="search" className="relative">
          <label htmlFor="sidebar-search" className="sr-only">
            {search.label}
          </label>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-haze" />
          <input
            id="sidebar-search"
            name="q"
            type="search"
            placeholder={search.placeholder}
            className="block min-h-11 w-full rounded-[0.625rem] border border-transparent bg-ink-soft pl-10 pr-3 text-[0.9375rem] text-paper placeholder:text-haze focus:border-marigold focus:outline-none"
          />
        </form>

        <nav aria-label={words.label} className="flex flex-col gap-5">
          <ul className="space-y-0.5">{side.map(sideLink)}</ul>
          {groups.map((g) =>
            g.links.length === 0 ? null : (
              <div key={g.title}>
                <p className="mb-1 px-3 text-[0.8125rem] font-semibold text-haze">{g.title}</p>
                <ul className="space-y-0.5">{g.links.map(sideLink)}</ul>
              </div>
            ),
          )}
        </nav>

        <Link href="/app/more" className="mt-auto flex items-center gap-3 rounded-xl bg-ink-soft p-3 hover:bg-ink-soft/80">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-paper/90 font-extrabold text-ink">
            {person.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-bold">{person.name}</span>
            <span className="block text-[0.8125rem] text-haze">{person.role}</span>
          </span>
        </Link>
      </div>
    </>
  );
}
