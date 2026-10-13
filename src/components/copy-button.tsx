"use client";

import { useState } from "react";
import { buttonStyles } from "./ui";

/** Copies text (a link) to the clipboard and says so. Hidden text stays selectable for phones without clipboard access. */
export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
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
      <span aria-live="polite">{copied === "yes" ? "Copied" : copied === "no" ? "Could not copy. Hold the link to copy it." : label}</span>
    </button>
  );
}
