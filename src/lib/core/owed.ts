/**
 * What a parent owes as their pet goes home (M67), for Today's "Going home
 * today": from the stay's bill when it has one, or else from what the stay
 * comes to now, as Make bill would write it, less what was paid ahead. A day
 * of a repeating series is billed with its month (D41), so it owes nothing
 * on its own.
 */
export type OwedAtCheckOut =
  | { kind: "monthly" }
  | { kind: "due"; amountMinor: number; number: string }
  | { kind: "paid"; number: string }
  | { kind: "draft" | "estimate"; amountMinor: number; advanceMinor: number }
  | { kind: "covered"; advanceMinor: number };

export interface OwedInput {
  /** A day of a repeating series. */
  series: boolean;
  /** The stay's live bill (not cancelled), if it has one. `dueMinor` is what is left after payments and credit notes. */
  bill: { status: "draft" | "issued"; number: string | null; totalMinor: number; dueMinor: number } | null;
  /** What the stay comes to now. Null when it cannot be worked out, such as an appointment still on quote. */
  estimateMinor: number | null;
  /** Paid ahead for the stay and not yet taken in by a bill, less any refund of it. */
  advanceMinor: number;
}

/** Null when there is nothing to say: no price yet, or a stay that comes to nothing with nothing paid. */
export function owedAtCheckOut(x: OwedInput): OwedAtCheckOut | null {
  if (x.series) return { kind: "monthly" };
  if (x.bill?.status === "issued") {
    const number = x.bill.number ?? "";
    return x.bill.dueMinor > 0 ? { kind: "due", amountMinor: x.bill.dueMinor, number } : { kind: "paid", number };
  }
  // A draft is what will be issued (a manager may have changed its lines); without one, the stay as it is now.
  const total = x.bill ? x.bill.totalMinor : x.estimateMinor;
  if (total === null) return null;
  const left = total - x.advanceMinor;
  if (left <= 0) return x.advanceMinor > 0 ? { kind: "covered", advanceMinor: x.advanceMinor } : null;
  return { kind: x.bill ? "draft" : "estimate", amountMinor: left, advanceMinor: x.advanceMinor };
}
