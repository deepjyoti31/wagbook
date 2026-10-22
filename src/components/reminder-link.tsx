"use client";

import { useState, useTransition } from "react";
import { markReminderSent } from "@/app/app/actions";
import { buttonStyles } from "@/components/ui";

/**
 * Send, for a reminder on Today: opens WhatsApp with the message typed (the
 * link does that by itself), then asks whether the message went (M44). Only
 * "Yes, it went" records it as sent, so it leaves the list; "Not yet" keeps
 * it, as does closing WhatsApp without sending.
 */
export function ReminderLink({
  href,
  kind,
  subjectId,
  label,
  title,
  words,
}: {
  href: string;
  kind: string;
  subjectId: string;
  label: string;
  title: string;
  words: { didItGo: string; itWent: string; notYet: string };
}) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  if (asking) {
    return (
      <span role="group" aria-label={words.didItGo} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <span className="font-semibold">{words.didItGo}</span>
        <button
          type="button"
          aria-busy={pending}
          disabled={pending}
          className={buttonStyles.secondary}
          onClick={() => start(() => markReminderSent(kind, subjectId).then(() => undefined))}
        >
          {words.itWent}
        </button>
        <button type="button" disabled={pending} className={buttonStyles.quiet} onClick={() => setAsking(false)}>
          {words.notYet}
        </button>
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" title={title} aria-label={title} className={buttonStyles.whatsapp} onClick={() => setAsking(true)}>
      {label}
    </a>
  );
}
