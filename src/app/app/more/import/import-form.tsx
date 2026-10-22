"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Input, Notice } from "@/components/ui";
import { EMPTY_FORM_STATE, type ImportState } from "@/lib/forms";
import { plural, type Language } from "@/lib/i18n";
import type { Messages } from "@/messages";
import { previewImport, runImport } from "./actions";

/**
 * Check a spreadsheet, see what would go in, then bring it in (M47). The file
 * is read on the server both times; nothing is saved until the second button.
 */
export function ImportForm({ words, language }: { words: Messages["importing"]; language: Language }) {
  const [preview, check] = useActionState(previewImport, EMPTY_FORM_STATE as ImportState);
  const [result, run] = useActionState(runImport, EMPTY_FORM_STATE as ImportState);
  const w = words;
  return (
    <div className="space-y-6">
      <form action={check} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        {preview.error ? <Notice tone="error">{preview.error}</Notice> : null}
        <Field label={w.file}>
          <Input name="file" type="file" accept=".csv,text/csv" required />
        </Field>
        <SubmitButton variant="secondary" pendingLabel={w.checking}>
          {w.check}
        </SubmitButton>
      </form>

      {preview.summary && !result.ok ? (
        <section className="space-y-3 rounded-xl border border-rule bg-paper p-4" aria-labelledby="import-preview">
          <h2 id="import-preview" className="text-xl font-bold">
            {w.preview.title}
          </h2>
          <ul className="list-disc space-y-1 pl-6">
            {preview.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {preview.notes?.map((note) => (
            <Notice key={note} tone="info">
              {note}
            </Notice>
          ))}
          {preview.problems && preview.problems.length > 0 ? (
            <div className="rounded-lg bg-alert-soft p-3">
              <ul className="space-y-1 text-alert">
                {preview.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              {preview.moreProblems ? <p className="mt-1 font-semibold text-alert">{preview.moreProblems}</p> : null}
              {preview.badCsv ? (
                <p className="mt-3">
                  <a
                    href={`data:text/csv;charset=utf-8,${encodeURIComponent(preview.badCsv)}`}
                    download="wagbook-lines-to-fix.csv"
                    className={buttonStyles.secondary}
                  >
                    {w.preview.downloadBad}
                  </a>
                  <span className="mt-1 block text-sm text-slate">{w.preview.downloadBadHint}</span>
                </p>
              ) : null}
            </div>
          ) : null}
          {(preview.good ?? 0) > 0 ? (
            <form action={run}>
              {result.error ? <Notice tone="error">{result.error}</Notice> : null}
              <input type="hidden" name="csv" value={preview.csv ?? ""} />
              <SubmitButton pendingLabel={w.going}>{plural(language, preview.good ?? 0, w.go)}</SubmitButton>
            </form>
          ) : (
            <Notice tone="info">{w.nothingToGo}</Notice>
          )}
        </section>
      ) : null}
      {result.ok ? <Notice tone="ok">{result.ok}</Notice> : null}
    </div>
  );
}
