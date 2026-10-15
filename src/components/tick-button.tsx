"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { Messages } from "@/messages";
import type { FormState } from "@/lib/forms";
import { addTick, readQueue, writeQueue } from "@/lib/offline-ticks";
import { buttonStyles, Notice } from "./ui";

/**
 * The Done button on a care task. Online it calls the Server Action like any
 * form. Offline (or when the request cannot get through) the tick is saved on
 * this phone and sent when the connection is back (src/lib/offline-ticks.ts).
 * Without JavaScript it is a plain form post.
 */
export function TickButton({
  taskId,
  action,
  words,
  label,
  pendingLabel,
}: {
  taskId: string;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  words: Messages["offline"];
  label: string;
  pendingLabel: string;
}) {
  const [queued, setQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // For a phone without JavaScript: the form posts to the action as usual.
  const [, formAction] = useActionState(action, {});

  useEffect(() => {
    const check = () => setQueued(readQueue().some((q) => q.taskId === taskId));
    check();
    window.addEventListener("wb-ticks", check);
    return () => window.removeEventListener("wb-ticks", check);
  }, [taskId]);

  function saveOnPhone() {
    if (writeQueue(addTick(readQueue(), taskId, new Date().toISOString()))) setQueued(true);
  }

  if (queued) {
    return (
      <span role="status" className="inline-flex min-h-12 min-w-28 items-center rounded-lg bg-marigold-soft px-3 font-semibold" title={words.queued}>
        {words.doneNotSent}
      </span>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        if (!navigator.onLine) return saveOnPhone();
        const form = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const result = await action({}, form);
            if (result.error) setError(result.error);
          } catch {
            // The request did not get through: keep the tick for later.
            saveOnPhone();
          }
        });
      }}
      className="contents"
    >
      <input type="hidden" name="taskId" value={taskId} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <button type="submit" disabled={pending} className={`${buttonStyles.primary} min-w-28`}>
        {pending ? `${pendingLabel}…` : label}
      </button>
    </form>
  );
}
