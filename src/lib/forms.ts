/** What a Server Action hands back to the form that called it. */
export interface FormState {
  /** A sentence to show in red above the form. */
  error?: string;
  /** A sentence to show in green above the form. */
  ok?: string;
}

export const EMPTY_FORM_STATE: FormState = {};

/** A trimmed text field, or null when it is empty or missing. */
export function text(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** True when a checkbox was ticked. */
export function checked(form: FormData, name: string): boolean {
  const value = form.get(name);
  return value === "on" || value === "true";
}

/** What the form that turns on two-step sign-in holds between its two steps. */
export interface TwoStepSetup extends FormState {
  factorId?: string;
  /** The picture to scan, as Supabase Auth returns it (an SVG data URL). */
  qr?: string;
  /** The same secret as text, for typing in by hand. */
  secret?: string;
}
