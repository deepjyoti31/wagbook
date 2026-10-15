import { Fragment, type ReactNode } from "react";
import { splitMessage } from "@/lib/i18n";

/**
 * A message with parts of it drawn as elements, so a translation can move the
 * bold number or the link to wherever its grammar puts it:
 *   <Rich text={m.today.inHouse} parts={{ n: <strong>4</strong> }} />
 */
export function Rich({ text, parts }: { text: string; parts: Record<string, ReactNode> }) {
  return (
    <>
      {splitMessage(text).map((p, i) => (
        <Fragment key={i}>{typeof p === "string" ? p : (parts[p.key] ?? `{${p.key}}`)}</Fragment>
      ))}
    </>
  );
}
