import type { ComponentProps, ReactNode } from "react";

/**
 * Small building blocks shared by every screen. Server-safe (no hooks).
 * Touch targets are at least 48px tall. See docs/03-architecture.md.
 */

const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-4 text-base font-semibold disabled:opacity-50 disabled:pointer-events-none";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-ink text-paper hover:bg-ink/90`,
  secondary: `${BUTTON_BASE} border-2 border-ink bg-paper text-ink hover:bg-ground`,
  quiet: `${BUTTON_BASE} text-ink underline underline-offset-4 hover:bg-ground`,
  whatsapp: `${BUTTON_BASE} bg-leaf text-paper hover:bg-leaf/90`,
  /** For what cannot be undone, such as erasing a parent's details. */
  danger: `${BUTTON_BASE} bg-alert text-paper hover:bg-alert/90`,
} as const;

export const inputStyles =
  "block w-full min-h-12 rounded-lg border-2 border-rule bg-paper px-3 py-2 text-base text-ink placeholder:text-slate/70 focus:border-ink focus:outline-none disabled:opacity-60";

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </header>
  );
}

export function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 flex items-baseline gap-2 text-lg font-bold">
        {title}
        {count !== undefined ? <span className="text-base font-semibold text-slate">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/** A ruled list, like lines in a register. */
export function Ledger({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">{children}</ul>;
}

export function LedgerRow({ children }: { children: ReactNode }) {
  return <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">{children}</li>;
}

/** One figure on a report: a label, a number, and a line under it. */
export function Figure({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-rule bg-paper p-3">
      <p className="text-sm text-slate">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{children}</p>
      {hint ? <p className="text-sm text-slate">{hint}</p> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-rule bg-paper px-4 py-6 text-slate">{children}</p>;
}

/** The kennel door tag. With no name it shows `empty` (the words for "No kennel"). */
export function DoorTag({ name, empty }: { name?: string | null; empty: string }) {
  return (
    <span className="door-tag" data-empty={name ? undefined : "true"}>
      {name ?? empty}
    </span>
  );
}

const BADGE_TONES = {
  neutral: "bg-ground text-ink",
  attention: "bg-marigold-soft text-ink",
  good: "bg-leaf-soft text-leaf",
  alert: "bg-alert-soft text-alert",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return <span className={`inline-block rounded-md px-2 py-0.5 text-sm font-semibold ${BADGE_TONES[tone]}`}>{children}</span>;
}

/** A labelled form control. The label is always visible; placeholders are never the label. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-sm text-slate">{hint}</span> : null}
    </label>
  );
}

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={`${inputStyles} ${props.className ?? ""}`} />;
}

export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea rows={3} {...props} className={`${inputStyles} ${props.className ?? ""}`} />;
}

export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={`${inputStyles} ${props.className ?? ""}`} />;
}

/**
 * Shown while a page loads. It is part of the static shell, drawn before
 * anyone knows which language the reader uses, so it has no words: three dots
 * that pulse, and aria-busy for screen readers.
 */
export function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex gap-2 py-8" data-loading>
      <span className="size-2 animate-pulse rounded-full bg-slate" />
      <span className="size-2 animate-pulse rounded-full bg-slate [animation-delay:150ms]" />
      <span className="size-2 animate-pulse rounded-full bg-slate [animation-delay:300ms]" />
    </div>
  );
}

export function Notice({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  const styles = { error: "bg-alert-soft text-alert", ok: "bg-leaf-soft text-leaf", info: "bg-marigold-soft text-ink" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-lg px-4 py-3 font-semibold ${styles}`}>
      {children}
    </p>
  );
}
