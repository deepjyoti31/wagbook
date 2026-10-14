"use client";

import { buttonStyles } from "./ui";

/** Opens the browser's print menu, where "Save as PDF" makes a PDF of the bill. */
export function PrintButton({ label = "Print or save as PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={`${buttonStyles.secondary} no-print`}>
      {label}
    </button>
  );
}
