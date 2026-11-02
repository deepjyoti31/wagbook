import type { ComponentProps, ReactNode } from "react";

/**
 * Small building blocks shared by every screen. Server-safe (no hooks).
 * Touch targets are at least 48px tall. See docs/03-architecture.md.
 *
 * Laptop first, and it works down to a phone: forms inside a page lay out by
 * the width of their container (`@lg:grid-cols-2`, not `sm:`), so the same
 * form fits the wide main column of a laptop and its narrow side column.
 */

const BUTTON_BASE =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[0.625rem] px-4 py-2 text-center text-[0.9375rem] font-semibold leading-snug transition-colors disabled:opacity-50 disabled:pointer-events-none";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-ink text-paper hover:bg-ink-soft`,
  secondary: `${BUTTON_BASE} border border-rule-strong bg-paper text-ink hover:bg-wash`,
  quiet: `${BUTTON_BASE} px-3 text-ink hover:bg-ground`,
  whatsapp: `${BUTTON_BASE} bg-leaf text-paper hover:bg-leaf-ink`,
  /** For what cannot be undone, such as erasing a parent's details. */
  danger: `${BUTTON_BASE} bg-alert text-paper hover:bg-alert-ink`,
} as const;

export const inputStyles =
  "block w-full min-h-12 rounded-[0.625rem] border border-rule-strong bg-paper px-3.5 py-2 text-base text-ink placeholder:text-slate/70 focus:border-ink focus:outline-2 focus:outline-offset-1 focus:outline-ink disabled:opacity-60 aria-invalid:border-2 aria-invalid:border-alert";

/**
 * The page's heading. `eyebrow` is a short line above it that says where you
 * are when the heading itself is a name or a date ("Today" over "Monday, 2 November").
 */
export function PageTitle({ title, eyebrow, children }: { title: string; eyebrow?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[0.9375rem] font-semibold text-slate">{eyebrow}</p> : null}
        <h1 className="text-[1.625rem] font-extrabold leading-tight tracking-tight lg:text-[2rem]">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </header>
  );
}

/** How many of something, in a small pill beside a heading. */
export function Count({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6.5 min-w-6.5 items-center justify-center rounded-full bg-ground px-2 text-[0.8125rem] font-bold text-slate tabular-nums">
      {n}
    </span>
  );
}

/**
 * A card with its heading inside. A `Ledger` put straight in it runs to the
 * card's edges (see `.wb-section` in globals.css). `action` sits at the right
 * of the heading, for a link like "See all".
 */
export function Section({ title, count, action, children }: { title: string; count?: number; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="wb-section mb-6 rounded-2xl border border-rule bg-paper p-4 sm:p-5">
      <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {count !== undefined ? <Count n={count} /> : null}
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Done out of total, as a bar. `tone` colours it: plain work in ink, medicines
 * in red, and all done in green whatever it is. With a `label` it is a meter a
 * screen reader announces; without one it only repeats the words beside it, so
 * it is hidden from screen readers.
 */
export function Meter({ value, total, tone = "ink", label }: { value: number; total: number; tone?: "ink" | "alert" | "leaf"; label?: string }) {
  const share = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  const fill = { ink: "bg-ink", alert: "bg-alert", leaf: "bg-leaf" }[value >= total && total > 0 ? "leaf" : tone];
  return (
    <span
      {...(label ? { role: "meter", "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": value, "aria-label": label } : { "aria-hidden": true })}
      className="block h-2 overflow-hidden rounded-full bg-black/8"
    >
      <span className={`block h-full rounded-full ${fill}`} style={{ width: `${share}%` }} />
    </span>
  );
}

/**
 * A page in two columns on a wide screen: the work in `main`, and what is
 * looked up or added now and then in `side`, beside it. On a tablet or a
 * phone the side follows the main, in the same order as before.
 */
const COLUMNS_FROM = {
  xl: "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:items-start xl:gap-8",
  "2xl": "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] 2xl:items-start 2xl:gap-8",
} as const;

/** `from` is the screen width the columns start at: later for a page whose main rows need the room (Today). */
export function Columns({ main, side, from = "xl" }: { main: ReactNode; side: ReactNode; from?: keyof typeof COLUMNS_FROM }) {
  return (
    <div className={COLUMNS_FROM[from]}>
      <div className="@container min-w-0">{main}</div>
      <div className="@container min-w-0">{side}</div>
    </div>
  );
}

/**
 * A form that is the whole page (a new booking, a new pet): one white card,
 * its buttons along the bottom under a rule (`formActionsStyles`).
 */
export const formCardStyles = "space-y-5 rounded-2xl border border-rule bg-paper p-5 lg:p-7";
export const formActionsStyles = "flex flex-wrap items-center gap-3 border-t border-rule pt-5";

/**
 * A page that is one form (a new booking, a password, the settings): kept to
 * a width that reads well on a laptop, instead of fields a screen wide.
 */
export function Narrow({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl">{children}</div>;
}

/** A ruled list, like lines in a register. */
export function Ledger({ children }: { children: ReactNode }) {
  return <ul className="wb-ledger divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-paper">{children}</ul>;
}

export function LedgerRow({ children }: { children: ReactNode }) {
  return <li className="flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-5">{children}</li>;
}

/** One figure on a report or on Today: a label, a big number, and a line under it. */
export function Figure({ label, children, hint, tone }: { label: string; children: ReactNode; hint?: ReactNode; tone?: "attention" | "alert" }) {
  const hintColour = tone === "attention" ? "font-semibold text-marigold-ink" : tone === "alert" ? "font-semibold text-alert-ink" : "text-slate";
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-2xl border border-rule bg-paper px-4 py-4 lg:px-5">
      <p className="text-sm font-semibold text-slate">{label}</p>
      {/* Sized by the room its column has (cqi), so money like ₹4,12,300 fits two to a row on a phone; never wider than its card. */}
      <div className="text-[clamp(1.125rem,5.5cqi,2rem)] font-extrabold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere]">{children}</div>
      {hint ? <div className={`text-sm ${hintColour}`}>{hint}</div> : null}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-rule-strong bg-wash px-4 py-5 text-slate">{children}</p>;
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
  neutral: "bg-ground text-slate",
  attention: "bg-marigold-soft text-marigold-ink",
  good: "bg-leaf-soft text-leaf-ink",
  alert: "bg-alert-soft text-alert-ink",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[0.8125rem] font-semibold leading-tight ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** A labelled form control. The label is always visible; placeholders are never the label. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.9375rem] font-semibold">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-sm text-slate">{hint}</span> : null}
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
  const styles = { error: "bg-alert-soft text-alert-ink", ok: "bg-leaf-soft text-leaf-ink", info: "bg-marigold-soft text-ink" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 font-semibold ${styles}`}>
      {children}
    </p>
  );
}
