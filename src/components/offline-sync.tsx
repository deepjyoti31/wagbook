"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Messages } from "@/messages";
import { readQueue, sendQueued } from "@/lib/offline-ticks";

/**
 * In the signed-in layout. Registers the service worker (production only),
 * sends ticks made offline whenever the connection is there, and says what
 * is waiting. Words come from the server in the person's language.
 */
export function OfflineSync({ words, language }: { words: Messages["offline"]; language: string }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(0);
  const [sent, setSent] = useState(0);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    let busy = false;
    const count = () => setWaiting(readQueue().length);
    const sync = async () => {
      setOffline(!navigator.onLine);
      count();
      if (busy || !navigator.onLine || readQueue().length === 0) return;
      busy = true;
      const n = await sendQueued();
      busy = false;
      count();
      if (n) {
        setSent(n);
        router.refresh();
      }
    };
    sync();
    const goneOffline = () => setOffline(true);
    window.addEventListener("online", sync);
    window.addEventListener("offline", goneOffline);
    window.addEventListener("wb-ticks", count);
    const timer = window.setInterval(sync, 30_000);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", goneOffline);
      window.removeEventListener("wb-ticks", count);
      window.clearInterval(timer);
    };
  }, [router]);

  const plural = (n: number, forms: { one: string; other: string }) =>
    (new Intl.PluralRules(language).select(n) === "one" ? forms.one : forms.other).replace("{n}", String(n));

  if (!offline && waiting === 0 && sent === 0) return null;
  return (
    <div role="status" className="mb-4 space-y-1 rounded-lg bg-marigold-soft px-4 py-3 font-semibold">
      {offline ? <p>{words.youAreOffline}</p> : null}
      {waiting > 0 ? <p>{plural(waiting, words.waiting)}</p> : null}
      {sent > 0 && waiting === 0 ? <p>{plural(sent, words.sent)}</p> : null}
    </div>
  );
}
