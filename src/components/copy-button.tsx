"use client";

import { useState } from "react";
import type { Messages } from "@/messages";
import { buttonStyles } from "./ui";

/**
 * Copies text (a link) to the clipboard and says so. Hidden text stays
 * selectable for phones without clipboard access. `words` is m.copy, and
 * `label` replaces its "Copy link" when the button copies something else.
 */
export function CopyButton({ text, words, label }: { text: string; words: Messages["copy"]; label?: string }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  return (
    <button
      type="button"
      className={buttonStyles.secondary}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied("yes");
        } catch {
          setCopied("no");
        }
      }}
    >
      <span aria-live="polite">{copied === "yes" ? words.copied : copied === "no" ? words.failed : (label ?? words.link)}</span>
    </button>
  );
}
