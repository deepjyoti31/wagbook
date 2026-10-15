"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { Field, Input, Notice } from "@/components/ui";
import type { TwoStepSetup } from "@/lib/forms";
import type { Messages } from "@/messages";
import { confirmTwoStep, startTwoStep } from "./actions";

/**
 * Turning on two-step sign-in, in two steps on one screen: get a secret and
 * show it as a picture to scan, then check the first code from the app.
 */
export function TwoStepSetupForm({ words: w }: { words: Messages["twoStep"] }) {
  const [started, start] = useActionState(startTwoStep, {} as TwoStepSetup);
  const [confirmed, confirm] = useActionState(confirmTwoStep, {} as TwoStepSetup);

  if (confirmed.ok) return <Notice tone="ok">{confirmed.ok}</Notice>;

  if (!started.factorId) {
    return (
      <form action={start} className="space-y-3">
        {started.error ? <Notice tone="error">{started.error}</Notice> : null}
        <SubmitButton pendingLabel={w.starting}>{w.start}</SubmitButton>
      </form>
    );
  }

  return (
    <form action={confirm} className="space-y-4">
      {confirmed.error ? <Notice tone="error">{confirmed.error}</Notice> : null}
      <input type="hidden" name="factorId" value={started.factorId} />
      <ol className="list-decimal space-y-4 pl-5">
        <li>{w.step1}</li>
        <li>
          <p>{w.step2}</p>
          {/* An SVG data URL from Supabase Auth; next/image is not needed for it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={started.qr} alt={w.qrAlt} width={200} height={200} className="my-3 size-50 rounded-lg border border-rule bg-white p-2" />
          <p className="text-sm text-slate">{w.key}</p>
          <p className="break-all font-mono text-base select-all">{started.secret}</p>
        </li>
        <li>
          <p className="mb-2">{w.step3}</p>
          <Field label={w.code}>
            <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required />
          </Field>
        </li>
      </ol>
      <SubmitButton pendingLabel={w.confirming}>{w.confirm}</SubmitButton>
    </form>
  );
}
