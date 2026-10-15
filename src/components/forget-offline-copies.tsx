"use client";

import { useEffect } from "react";
import { QUEUE_KEY } from "@/lib/offline-ticks";

/**
 * On the sign-in page: whoever used this phone before has signed out (or was
 * never signed in), so the copies of Today and Care kept for offline use, and
 * any ticks not yet sent, must not stay for the next person.
 */
export function ForgetOfflineCopies() {
  useEffect(() => {
    navigator.serviceWorker?.controller?.postMessage("forget-pages");
    try {
      window.localStorage.removeItem(QUEUE_KEY);
    } catch {
      // Storage switched off: nothing was kept.
    }
  }, []);
  return null;
}
