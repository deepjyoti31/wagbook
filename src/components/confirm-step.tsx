import { SubmitButton } from "./action-form";
import { buttonStyles } from "./ui";

/**
 * A deletion in two taps, inside an ActionForm: the first opens a warning,
 * the second deletes. Plain HTML (details and summary), so it works without
 * JavaScript too. Only owners are shown it (D29).
 */
export function ConfirmStep({ label, warning, confirm, pending }: { label: string; warning: string; confirm: string; pending: string }) {
  return (
    <details className="w-full">
      <summary className={`${buttonStyles.quiet} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{label}</summary>
      <div className="mt-2 space-y-3 rounded-lg bg-alert-soft p-3">
        <p className="font-semibold">{warning}</p>
        <SubmitButton variant="danger" pendingLabel={pending}>
          {confirm}
        </SubmitButton>
      </div>
    </details>
  );
}
