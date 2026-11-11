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

/** Pages that draw their own dark header on a phone (Care's count, More's person), so the kennel's bar is left out. */
const OWN_PHONE_HEADER = ["/app/care", "/app/more"];

/**
 * Main navigation, in the shape that suits the screen (D58, D59):
 *   laptop (lg and up)  a dark sidebar down the left: search, the main links with what is waiting,
 *                       the day's work and the money (for managers) from More, and who is signed in
 *   tablet (sm to lg)   a white bar along the top with the kennel's name and a way to search
 *   phone               the kennel's name on a dark bar at the top, with search and New booking,
 *                       and a bar along the bottom, icons over words, within thumb reach
 * Only one of the navs is shown at a time, so a screen reader meets one.
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
  counts,
}: {
  words: Messages["nav"];
  lang: string;
  kennelName: string;
  calendar: string;
  /** The groups of More shown in the sidebar, each with its heading and links. */
  groups: { title: string; links: Item[] }[];
  /**
   * The bookings search at the top of the sidebar. Its label is one short word ("Search"): it sits in a search
   * landmark with the placeholder beside it, and a longer label would be found by other fields' names (a label
   * search for "Name" would find "pet name").
   */
  search: { label: string; placeholder: string };
  /** Who is signed in, and as what, at the foot of the sidebar. */
  person: { name: string; role: string };
  /** What is waiting behind a link (requests, care still to do, new forms), by its address. Nothing is shown for 0. */
  counts: Record<string, number>;
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
    const n = counts[item.href] ?? 0;
    return (
      <li key={item.href}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          className={`flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-[15px] font-semibold transition-colors ${
            active ? "bg-paper text-ink" : "text-[#c9d1e0] hover:bg-ink-soft hover:text-paper"
          }`}
        >
          {icon ? <Icon name={icon} /> : <span className="size-5 shrink-0" />}
          <span className="min-w-0 break-words leading-tight">{item.label}</span>
          {n > 0 ? <span className="ml-auto rounded-full bg-marigold px-2 py-px text-[12.5px] font-[750] text-ink">{n}</span> : null}
        </Link>
      </li>
    );
  };

  return (
    <>
      {/* Laptop: the sidebar. It stays put while the page scrolls. */}
      <div className="wb-dark no-print sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col gap-[22px] overflow-y-auto bg-ink px-3.5 pb-[18px] pt-[22px] text-paper lg:flex">
        <Link href="/app" className="flex items-center gap-2.5 px-2">
          <BrandMark />
          <span className="min-w-0">
            <span className="block text-[17px] font-extrabold leading-snug tracking-[-0.01em]">Wagbook</span>
            <span className="block break-words text-[13px] leading-snug text-haze">{kennelName}</span>
          </span>
        </Link>

        {/* The words wrap onto two lines, which a placeholder cannot: they sit over the field until something is typed. */}
        <form action="/app/bookings" role="search" className="relative flex min-h-11 items-center gap-2.5 rounded-[10px] bg-ink-soft px-3 py-1.5 text-[#c9d1e0] focus-within:outline-2 focus-within:outline-marigold">
          <label htmlFor="sidebar-search" className="sr-only">
            {search.label}
          </label>
          <Icon name="search" />
          <input
            id="sidebar-search"
            name="q"
            type="search"
            placeholder=" "
            className="peer absolute inset-0 rounded-[10px] bg-transparent pl-[42px] pr-3 text-[14.5px] text-paper focus:outline-none"
          />
          <span aria-hidden="true" className="pointer-events-none text-[14.5px] leading-snug peer-focus:invisible peer-[:not(:placeholder-shown)]:invisible">
            {search.placeholder}
          </span>
        </form>

        <nav aria-label={words.label} className="flex flex-col gap-5">
          <ul className="flex flex-col gap-0.5">{side.map(sideLink)}</ul>
          {groups.map((g) =>
            g.links.length === 0 ? null : (
              <div key={g.title}>
                <p className="px-3 pb-1.5 text-[13px] font-[650] text-haze">{g.title}</p>
                <ul className="flex flex-col gap-0.5">{g.links.map(sideLink)}</ul>
              </div>
            ),
          )}
        </nav>

        <Link href="/app/more" className="mt-auto flex items-center gap-2.5 rounded-xl bg-ink-soft p-3 hover:bg-ink-soft/80">
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#dfe6f3] font-extrabold text-ink">
            {person.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14.5px] font-bold">{person.name}</span>
            <span className="block text-[13px] text-haze">{person.role}</span>
          </span>
        </Link>
      </div>

      {/* Tablet: a white bar along the top. */}
      <header className="no-print sticky top-0 z-10 hidden items-center gap-3 border-b border-rule bg-paper px-6 py-2.5 sm:flex lg:hidden">
        <Link href="/app" className="flex min-w-0 items-center gap-3">
          <BrandMark className="size-[34px]" />
          <span className="mr-2 truncate text-base font-extrabold">{kennelName}</span>
        </Link>
        <nav aria-label={words.label} className="flex flex-1 gap-0.5">
          {main.map((item) => {
            const active = compactActive === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-[10px] px-3.5 text-[15px] font-[650] ${active ? "bg-ink text-paper" : "text-[#3d4863] hover:bg-ground"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/app/bookings"
          aria-label={search.label}
          className="inline-flex min-h-12 items-center justify-center rounded-[10px] border border-rule-strong bg-paper px-3 text-ink hover:bg-ground"
        >
          <Icon name="search" />
        </Link>
      </header>

      {/* Phone: the kennel's name at the top, and the main links along the bottom. */}
      {OWN_PHONE_HEADER.includes(pathname) ? null : (
        <header className="wb-dark no-print flex items-center gap-2.5 bg-ink px-4 py-2.5 text-paper sm:hidden">
          <BrandMark className="size-8 rounded-[9px]" />
          <p className="min-w-0 flex-1 truncate text-base font-extrabold">{kennelName}</p>
          <Link href="/app/bookings" aria-label={search.label} className="inline-flex size-12 items-center justify-center rounded-[10px] text-paper">
            <Icon name="search" />
          </Link>
          <Link href="/app/bookings/new" aria-label={words.newBooking} className="inline-flex size-12 items-center justify-center rounded-[10px] bg-paper text-ink">
            <Icon name="plus" />
          </Link>
        </header>
      )}
      <nav
        aria-label={words.label}
        className="no-print fixed inset-x-0 bottom-0 z-10 flex border-t border-rule bg-paper px-1 pb-[max(10px,env(safe-area-inset-bottom))] pt-1 sm:hidden"
      >
        {main.map((item) => {
          const active = compactActive === item.href;
          const n = counts[item.href] ?? 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-[3px] text-xs ${active ? "font-extrabold text-ink" : "font-[650] text-slate"}`}
            >
              <Icon name={ICONS[item.href]} />
              {item.label}
              {n > 0 ? (
                <span className="absolute left-[calc(50%+6px)] top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-marigold px-[5px] text-[11px] font-extrabold text-ink">
                  {n}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
