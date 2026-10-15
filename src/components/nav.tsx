"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { Messages } from "@/messages";

/**
 * Main navigation: a bar along the bottom on phones (within thumb reach),
 * along the top on wider screens. The words come from the server, in the
 * person's language.
 */
export function Nav({ words, lang }: { words: Messages["nav"]; lang: string }) {
  const pathname = usePathname();
  // The root layout is drawn before the language is known; say it here.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const items = [
    { href: "/app", label: words.today },
    { href: "/app/bookings", label: words.bookings },
    { href: "/app/care", label: words.care },
    { href: "/app/dogs", label: words.pets },
    { href: "/app/more", label: words.more },
  ];
  // The calendar is part of bookings, play is part of the care round, bills live under More, and parents sit with their pets.
  const section = pathname.startsWith("/app/calendar")
    ? "/app/bookings"
    : pathname.startsWith("/app/play")
      ? "/app/care"
      : pathname.startsWith("/app/bills")
        ? "/app/more"
        : pathname.startsWith("/app/clients")
          ? "/app/dogs"
          : pathname;
  const isActive = (href: string) => (href === "/app" ? section === "/app" : section.startsWith(href));
  return (
    <nav aria-label={words.label} className="flex justify-around gap-1 sm:justify-start">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`flex min-h-12 flex-1 items-center justify-center rounded-lg px-2 text-base font-semibold sm:px-3 sm:flex-none ${
            isActive(item.href) ? "bg-ink text-paper" : "text-ink hover:bg-ground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
