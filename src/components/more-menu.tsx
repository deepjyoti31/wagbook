"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { fill } from "@/lib/i18n";

export type MoreLink = { href: string; title: string; about: string; value?: string; count?: number };
export type MoreGroup = { key: string; title: string; links: MoreLink[]; /** Say what each page is for under its name. */ describe: boolean; /** Show this many, and fold the rest under one row. */ fold?: number };

/**
 * The pages under More, in their groups, with a box to find one by typing
 * (its name, or what it is for). A long group shows its first pages and folds
 * the rest under one row that names them.
 */
export function MoreMenu({ groups, words }: { groups: MoreGroup[]; words: { findPage: string; noPage: string; andMore: string } }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLocaleLowerCase();
  const matches = (l: MoreLink) => q === "" || `${l.title} ${l.about}`.toLocaleLowerCase().includes(q);
  const shown = groups.map((g) => ({ ...g, links: g.links.filter(matches) })).filter((g) => g.links.length > 0);
  const row = (l: MoreLink, describe: boolean) => (
    <li key={l.href}>
      <Link href={l.href} className="flex min-h-12 items-center gap-3 px-3.5 py-3 hover:bg-wash sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 font-bold">
            {l.title}
            {l.count ? <span className="rounded-full bg-marigold px-2 py-px text-[12.5px] font-[750] text-ink">{l.count}</span> : null}
          </span>
          {describe ? <span className="block text-sm text-slate">{l.about}</span> : null}
        </span>
        {l.value ? <span className="text-sm text-slate">{l.value}</span> : null}
        <Icon name="forward" className="size-[18px] text-slate" />
      </Link>
    </li>
  );
  return (
    <>
      <label className="relative mb-(--wb-gap) block">
        <span className="sr-only">{words.findPage}</span>
        <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={words.findPage}
          autoComplete="off"
          className="block min-h-12 w-full rounded-[10px] border border-rule-strong bg-paper pl-[42px] pr-3.5 text-base text-ink placeholder:text-slate focus:border-ink focus:outline-2 focus:outline-offset-1 focus:outline-ink"
        />
      </label>
      {shown.length === 0 ? <p className="mb-(--wb-gap) text-slate">{words.noPage}</p> : null}
      {/* Side by side on a laptop, one under another on a phone. */}
      <div className="gap-6 @4xl:columns-2 [&>section]:break-inside-avoid">
        {shown.map((g) => {
          // A search shows every match; otherwise a long group folds its last pages away.
          const fold = q === "" && g.fold && g.links.length > g.fold + 1 ? g.fold : g.links.length;
          const rest = g.links.slice(fold);
          return (
            <section key={g.key} aria-labelledby={`more-${g.key}`} className="mb-(--wb-gap)">
              <h2 id={`more-${g.key}`} className="px-1 pb-2 text-sm font-[650] text-slate">
                {g.title}
              </h2>
              <ul className="divide-y divide-rule-soft overflow-hidden rounded-2xl border border-rule bg-paper">
                {g.links.slice(0, fold).map((l) => row(l, g.describe))}
                {rest.length > 0 ? (
                  <li>
                    <details className="group">
                      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-3.5 py-3 font-bold hover:bg-wash sm:px-5 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0 flex-1">
                          {rest.length > 3
                            ? fill(words.andMore, { list: rest.slice(0, 3).map((l) => l.title).join(", "), n: rest.length - 3 })
                            : rest.map((l) => l.title).join(", ")}
                        </span>
                        <Icon name="forward" className="size-[18px] rotate-90 text-slate group-open:-rotate-90" />
                      </summary>
                      <ul className="divide-y divide-rule-soft border-t border-rule-soft">{rest.map((l) => row(l, g.describe))}</ul>
                    </details>
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
