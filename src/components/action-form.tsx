"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { buttonStyles, Notice } from "./ui";

/**
 * A form wired to a Server Action that returns a FormState.
 * Shows the action's error or success message above the fields and keeps
 * working without JavaScript (the form still posts).
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
  return (
    <form action={formAction} className={className}>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.ok ? <Notice tone="ok">{state.ok}</Notice> : null}
      {children}
    </form>
  );
}

/** A submit button that disables itself and changes its label while the action runs. */
export function SubmitButton({
  children,
  pendingLabel = "Saving",
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: keyof typeof buttonStyles;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${buttonStyles[variant]} ${className}`}>
      {pending ? `${pendingLabel}…` : children}
    </button>
  );
}
