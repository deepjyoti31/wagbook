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

/** What the form that makes two-step sign-in recovery codes hands back: the codes, shown once (D43). */
export interface RecoveryCodesState extends FormState {
  codes?: string[];
}

/** What the spreadsheet import hands back between checking a file and bringing it in (M47). */
export interface ImportState extends FormState {
  /** The file as sent, to bring in once the preview is read. */
  csv?: string;
  /** Counts for the preview, already in words. */
  summary?: string[];
  /** How many lines can go in. */
  good?: number;
  /** "Line 3: phone: Write a phone number ..." for the first problems. */
  problems?: string[];
  /** A sentence saying how many more problems there are, when not all are listed. */
  moreProblems?: string;
  /** Things to know that are not errors: columns not read, lines not read. */
  notes?: string[];
  /** The lines with problems as a CSV, with a last column saying what is wrong. */
  badCsv?: string;
}
