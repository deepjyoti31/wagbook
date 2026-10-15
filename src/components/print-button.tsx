"use client";

import { buttonStyles } from "./ui";

/** Opens the browser's print menu, where "Save as PDF" makes a PDF of the bill. `label` is the button's words (m.common.print). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonStyles.secondary} no-print`}>
      {label}
    </button>
  );
}
