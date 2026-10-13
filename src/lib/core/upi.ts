import { assertMinor, toDecimalString, type Minor } from "./money";

/**
 * UPI payment links.
 *
 * A `upi://pay` link opens the payer's UPI app (GPay, PhonePe, Paytm, BHIM)
 * with the kennel's UPI ID and the amount already filled in. The money moves
 * bank to bank. Wagbook never touches it and charges nothing, and no payment
 * gateway account is needed. The trade-off is that Wagbook is not told when
 * the payment succeeds, so staff confirm the payment and record it by hand.
 * See docs/07-whatsapp-and-upi.md.
 */

/** A UPI ID (VPA) looks like "name@bank". */
export function isValidVpa(vpa: string): boolean {
  return /^[a-zA-Z0-9._-]{2,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(vpa.trim());
}

export interface UpiLinkInput {
  /** The kennel's UPI ID, e.g. "happytails@okhdfcbank". */
  vpa: string;
  /** Name shown to the payer. */
  payeeName: string;
  /** Amount in paise. Omit to let the payer type it. */
  amountMinor?: Minor;
  /** Short note shown in the payer's app, e.g. the invoice number. */
  note?: string;
  /** Your own reference, e.g. the invoice number. Letters and digits only. */
  reference?: string;
}

/** Build a upi://pay link. The same string can be drawn as a QR code. */
export function upiLink(input: UpiLinkInput): string {
  const vpa = input.vpa.trim();
  if (!isValidVpa(vpa)) throw new RangeError(`Not a valid UPI ID: ${input.vpa}`);
  const params: [string, string][] = [
    ["pa", vpa],
    ["pn", input.payeeName.trim().slice(0, 50)],
  ];
  if (input.amountMinor !== undefined) {
    assertMinor(input.amountMinor);
    if (input.amountMinor <= 0) throw new RangeError("UPI amount must be positive");
    params.push(["am", toDecimalString(input.amountMinor)]);
  }
  params.push(["cu", "INR"]);
  if (input.note) params.push(["tn", input.note.trim().slice(0, 80)]);
  if (input.reference) {
    const ref = input.reference.replace(/[^a-zA-Z0-9]/g, "").slice(0, 35);
    if (ref) params.push(["tr", ref]);
  }
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
}
