"use client";

import { useTransition } from "react";
import { markReminderSent } from "@/app/app/actions";
import { buttonStyles } from "@/components/ui";

/**
 * Send, for a reminder on Today: opens WhatsApp with the message typed (the
 * link does that by itself) and, at the same time, records it as sent so it
 * leaves the list.
 */
export function ReminderLink({ href, kind, subjectId, label, title }: { href: string; kind: string; subjectId: string; label: string; title: string }) {
  const [pending, start] = useTransition();
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      aria-label={title}
      aria-busy={pending}
      className={buttonStyles.whatsapp}
      onClick={() => start(() => markReminderSent(kind, subjectId).then(() => undefined))}
    >
      {label}
    </a>
  );
}
