"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { buttonStyles, Notice } from "./ui";

/**
 * A form wired to a Server Action that returns a FormState.
 * Shows the action's error or success message above the fields and keeps
 * working without JavaScript (the form still posts).
 *
 * React resets a form after its action runs. When the action refuses, that
 * would throw away what the person typed, so the fields are put back from
 * what was submitted.
 */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef<FormData | null>(null);

  useEffect(() => {
    const form = formRef.current;
    const values = submitted.current;
    if (!state.error || !form || !values) return;
    restoreFields(form, values);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={(e) => {
        submitted.current = new FormData(e.currentTarget);
      }}
      className={className}
    >
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
      {children}
    </form>
  );
}

function restoreFields(form: HTMLFormElement, values: FormData) {
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name) continue;
    if (el instanceof HTMLInputElement) {
      if (el.type === "hidden" || el.type === "file" || el.type === "submit") continue;
      if (el.type === "checkbox" || el.type === "radio") {
        el.checked = values.getAll(el.name).includes(el.value);
        continue;
      }
    }
    const value = values.get(el.name);
    if (typeof value === "string") el.value = value;
  }
}

/** A submit button that disables itself and changes its label while the action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  /** What the button says while the action runs, like "Saving". */
  pendingLabel: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
  /** Sent with the form when this button is the one pressed, to tell two buttons apart. */
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={`${buttonStyles[variant]} ${className}`}>
      {pending ? `${pendingLabel}…` : children}
    </button>
  );
}
