"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Notice } from "@/components/ui";
import type { RecoveryCodesState } from "@/lib/forms";
import type { Messages } from "@/messages";
import { makeRecoveryCodes } from "./actions";

/**
 * Two-step sign-in recovery codes (D43): how many are left, and a button that
 * makes ten new ones and shows them, once. `left` is the sentence saying how
 * many are left, worked out on the server in the reader's language.
 */
export function RecoveryCodes({ words: w, copy, left, any }: { words: Messages["twoStep"]["recovery"]; copy: Messages["copy"]; left: string; any: boolean }) {
  const [state, make] = useActionState(makeRecoveryCodes, {} as RecoveryCodesState);

  if (state.codes && state.codes.length > 0) {
    return (
      <div className="space-y-3">
        <Notice tone="info">{w.shown}</Notice>
        <ol className="grid grid-cols-2 gap-2 font-mono text-base select-all">
          {state.codes.map((code) => (
            <li key={code} className="rounded-lg border border-rule bg-ground px-3 py-2 text-center">
              {code}
            </li>
          ))}
        </ol>
        <CopyButton text={state.codes.join("\n")} words={copy} label={w.copy} />
      </div>
    );
  }

  return (
    <form action={make} className="space-y-3">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <p className={any ? "" : "font-semibold"}>{left}</p>
      {any ? <p className="text-sm text-slate">{w.replaces}</p> : null}
      <SubmitButton variant={any ? "secondary" : "primary"} pendingLabel={w.making}>
        {any ? w.makeNew : w.make}
      </SubmitButton>
    </form>
  );
}
