"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/app", label: "Today" },
  { href: "/app/bookings", label: "Bookings" },
  { href: "/app/dogs", label: "Pets" },
  { href: "/app/more", label: "More" },
] as const;

/**
 * Main navigation: a bar along the bottom on phones (within thumb reach),
 * along the top on wider screens.
 */
export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));
  return (
    <nav aria-label="Main" className="flex justify-around gap-1 sm:justify-start">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(item.href) ? "page" : undefined}
          className={`flex min-h-12 flex-1 items-center justify-center rounded-lg px-3 text-base font-semibold sm:flex-none ${
            isActive(item.href) ? "bg-ink text-paper" : "text-ink hover:bg-ground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
