"use client";

import { useEffect, useState, useTransition } from "react";
import { removePhone, savePhone } from "@/app/app/more/alerts/actions";
import { buttonStyles } from "@/components/ui";
import type { Messages } from "@/messages";

type State = "checking" | "unsupported" | "blocked" | "off" | "on";

/** The service worker's own store, where it reads the words to show when it cannot reach Wagbook (public/sw.js). */
const ALERTS_SEEN = "wb-alerts-seen";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const raw = atob(base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Alerts on this phone (M61): allow them (the browser asks), or stop them.
 * The phone's push address is kept for the signed-in person at this kennel;
 * pushes carry nothing, and the service worker asks Wagbook what happened.
 */
export function AlertsPhone({ publicKey, words }: { publicKey: string; words: Messages["alerts"] }) {
  const [state, setState] = useState<State>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported" as const;
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) return "unsupported" as const;
      if (Notification.permission === "denied") return "blocked" as const;
      // The words the service worker shows when it cannot reach Wagbook, in this person's language.
      await caches
        .open(ALERTS_SEEN)
        .then((c) => c.put("/words", new Response(JSON.stringify({ title: "Wagbook", body: words.fallback }))))
        .catch(() => undefined);
      return (await registration.pushManager.getSubscription()) ? ("on" as const) : ("off" as const);
    })()
      .catch(() => "unsupported" as const)
      .then((s) => {
        if (live) setState(s);
      });
    return () => {
      live = false;
    };
  }, [words.fallback]);

  function allow() {
    start(async () => {
      setMessage(null);
      try {
        if ((await Notification.requestPermission()) !== "granted") {
          setState(Notification.permission === "denied" ? "blocked" : "off");
          setMessage(words.failed);
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
        const result = await savePhone(subscription.endpoint);
        if (result.error) {
          setMessage(result.error);
          return;
        }
        setState("on");
        setMessage(result.ok ?? null);
      } catch {
        setMessage(words.failed);
      }
    });
  }

  function stop() {
    start(async () => {
      setMessage(null);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await removePhone(subscription.endpoint);
          await subscription.unsubscribe();
        }
        setState("off");
        setMessage(words.off);
      } catch {
        setMessage(words.failed);
      }
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-rule bg-paper p-4" aria-live="polite">
      {state === "checking" ? <p className="text-slate">{words.checking}</p> : null}
      {state === "unsupported" ? <p>{words.unsupported}</p> : null}
      {state === "blocked" ? <p>{words.blocked}</p> : null}
      {state === "on" ? <p className="font-semibold text-leaf">{words.on}</p> : null}
      {state === "off" ? <p>{words.off}</p> : null}
      {state === "off" || state === "blocked" ? (
        <button type="button" onClick={allow} disabled={pending} className={buttonStyles.primary}>
          {pending ? words.allowing : words.allow}
        </button>
      ) : null}
      {state === "on" ? (
        <button type="button" onClick={stop} disabled={pending} className={buttonStyles.secondary}>
          {words.stop}
        </button>
      ) : null}
      {message && message !== words.on && message !== words.off ? <p>{message}</p> : null}
    </div>
  );
}
