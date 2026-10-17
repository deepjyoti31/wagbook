import type { FormState } from "@/lib/forms";
import { ActionForm, SubmitButton } from "./action-form";
import { Section } from "./ui";

/**
 * On a pet's or parent's page. While shown: a section at the end to hide them
 * from lists. While hidden: a notice at the top, with a button to show them
 * again unless `blocked` says why that cannot be done from here.
 */
export function HidePanel({
  action,
  field,
  id,
  hidden,
  canManage,
  words,
  blocked,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  /** The form field the action reads the id from. */
  field: string;
  id: string;
  hidden: boolean;
  canManage: boolean;
  words: { title: string; about: string; hide: string; hidden: string; show: string; saving: string };
  blocked?: string | null;
}) {
  if (hidden) {
    return (
      // Styled as an info Notice, which is a paragraph and so cannot hold the form.
      <div role="status" className="mb-4 rounded-lg bg-marigold-soft px-4 py-3 font-semibold text-ink">
        <p>{words.hidden}</p>
        {blocked ? <p className="mt-1">{blocked}</p> : null}
        {canManage && !blocked ? (
          <ActionForm action={action} className="mt-2">
            <input type="hidden" name={field} value={id} />
            <input type="hidden" name="hide" value="0" />
            <SubmitButton variant="secondary" pendingLabel={words.saving}>
              {words.show}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    );
  }
  if (!canManage) return null;
  return (
    <Section title={words.title}>
      <ActionForm action={action} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
        <input type="hidden" name={field} value={id} />
        <input type="hidden" name="hide" value="1" />
        <p className="text-slate">{words.about}</p>
        <SubmitButton variant="secondary" pendingLabel={words.saving}>
          {words.hide}
        </SubmitButton>
      </ActionForm>
    </Section>
  );
}
