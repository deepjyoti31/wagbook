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
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-[10px] border border-transparent px-4 py-2 text-center text-[15px] font-[650] leading-snug transition-colors disabled:opacity-50 disabled:pointer-events-none sm:px-[18px]";

export const buttonStyles = {
  primary: `${BUTTON_BASE} bg-ink text-paper hover:bg-[#0b1427]`,
  secondary: `${BUTTON_BASE} border-rule-strong! bg-paper text-ink hover:bg-ground`,
  quiet: `${BUTTON_BASE} px-3! text-ink hover:bg-fog`,
  whatsapp: `${BUTTON_BASE} bg-leaf text-paper hover:bg-[#155c37]`,
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
    <header className="mb-(--wb-gap) flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="min-w-0 flex-[1_1_320px]">
        {eyebrow ? <p className="text-sm font-[650] text-slate sm:text-[14.5px]">{eyebrow}</p> : null}
        <h1 className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em] sm:text-[28px] lg:text-[32px]">{title}</h1>
      </div>
      {children ? <div className="flex flex-wrap gap-2.5">{children}</div> : null}
    </header>
  );
}

/** How many of something, in a small pill beside a heading. */
export function Count({ n }: { n: number }) {
  return (
    <span className="inline-flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-fog px-2 text-[13px] font-[750] text-steel tabular-nums">
      {n}
    </span>
  );
}

/**
 * A card with its heading inside. A `Ledger` put straight in it runs to the
 * card's edges (see `.wb-section` in globals.css). `meta` is a quiet line
 * beside the heading ("48 of 60 done"), and `action` sits at the right of the
 * heading, for a link like "See all".
 */
export function Section({ title, count, meta, action, children }: { title: string; count?: number; meta?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className={`${sectionStyles} mb-(--wb-gap)`}>
      <div className="mb-(--wb-head-gap) flex min-h-[26px] flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-[17px] font-[750] tracking-[-0.01em] sm:text-lg">{title}</h2>
        {count !== undefined ? <Count n={count} /> : null}
        {meta ? <span className="text-sm text-slate">{meta}</span> : null}
        {action ? <div className="-my-2 ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** The card a `Section` is, for a section that needs its own heading row. */
export const sectionStyles = "wb-section rounded-2xl border border-rule bg-paper px-(--wb-pad) pb-(--wb-pad) pt-(--wb-head)";

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
      // The track's colour is set by what the meter sits on (--wb-track on a tinted tile), or the usual grey.
      className="block h-1.5 overflow-hidden rounded-full bg-(--wb-track,var(--color-track)) sm:h-2"
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
  wide: "min-[1200px]:grid min-[1200px]:grid-cols-[minmax(0,1fr)_380px] min-[1200px]:items-start min-[1200px]:gap-[22px]",
  xl: "xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-[22px]",
  "2xl": "2xl:grid 2xl:grid-cols-[minmax(0,1fr)_380px] 2xl:items-start 2xl:gap-[22px]",
} as const;

/** `from` is the screen width the columns start at: later for a page whose main rows need the room. */
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
  return <ul className="wb-ledger divide-y divide-rule-soft overflow-hidden rounded-2xl border border-rule bg-paper">{children}</ul>;
}

export function LedgerRow({ children }: { children: ReactNode }) {
  return <li className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-(--wb-pad) py-3.5 sm:gap-x-4 sm:gap-y-3">{children}</li>;
}

/**
 * One figure on a report or on Today: a label, a big number, and a line under
 * it. `fit` sizes the number by the room its column has, for money that would
 * not fit two to a row on a phone at the usual size.
 */
export function Figure({ label, children, hint, tone, fit }: { label: ReactNode; children: ReactNode; hint?: ReactNode; tone?: "attention" | "alert"; fit?: boolean }) {
  const hintColour = tone === "attention" ? "font-semibold text-marigold-ink" : tone === "alert" ? "font-semibold text-alert-ink" : "text-slate";
  const size = fit ? "text-[clamp(1.125rem,5.5cqi,2.125rem)] leading-tight" : "text-[26px] leading-[1.1] sm:text-[28px] sm:leading-none lg:text-[34px]";
  return (
    // data-figure: a steady handle for the browser walk, which reads the label (first p) and the number (second p).
    <div data-figure className="flex min-w-0 flex-col gap-1 rounded-2xl border border-rule bg-paper px-3.5 py-3 sm:gap-1.5 sm:px-4 sm:py-3.5 lg:gap-2 lg:px-5 lg:py-[18px]">
      <p className="text-[13px] font-[650] text-slate sm:text-[13.5px] lg:text-[14.5px]">{label}</p>
      <p className={`font-extrabold tracking-[-0.02em] tabular-nums [overflow-wrap:anywhere] ${size}`}>{children}</p>
      {hint ? <div className={`text-[12.5px] sm:text-[13px] lg:text-sm ${hintColour}`}>{hint}</div> : null}
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
  neutral: "bg-fog text-steel",
  attention: "bg-marigold-soft text-marigold-ink",
  good: "bg-leaf-soft text-leaf-ink",
  alert: "bg-alert-soft text-alert-ink",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex min-h-6 items-center gap-[5px] rounded-full px-[9px] text-[12.5px] font-[650] leading-tight ${BADGE_TONES[tone]}`}>
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
    <p role={tone === "error" ? "alert" : "status"} className={`mb-(--wb-gap) rounded-[14px] px-4 py-3 font-semibold ${styles}`}>
      {children}
    </p>
  );
}
