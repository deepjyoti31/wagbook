"use client";

import { useState, type ReactNode } from "react";

/**
 * A ruled list that shows only its first few rows on a phone, with "See 2
 * more" under them; wider screens show every row. The rows are hidden by CSS
 * (`[data-fold]` in globals.css), so they are in the page either way.
 */
export function FoldList({ limit, count, more, children }: { limit: 2 | 3; count: number; more: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ul className="wb-ledger divide-y divide-rule-soft overflow-hidden rounded-2xl border border-rule bg-paper" data-fold={open ? undefined : limit}>
      {children}
      {count > limit && !open ? (
        <li className="wb-fold-more sm:hidden">
          <button type="button" onClick={() => setOpen(true)} className="flex min-h-[52px] w-full items-center justify-center text-[15px] font-[650]">
            {more}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
