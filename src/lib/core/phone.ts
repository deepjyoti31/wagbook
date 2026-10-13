/**
 * Phone numbers.
 *
 * Phones are stored in E.164 form ("+919876543210"). In India a pet parent's
 * mobile number is also their WhatsApp address and effectively their identity
 * at the kennel, so we normalise hard at the edge and compare exact strings
 * everywhere else.
 */

/**
 * Normalise a typed phone number to E.164, or return null if it cannot be one.
 * `defaultCountry` decides what a bare national number means. Only "IN" has
 * national-number rules today; other countries must type the + form.
 */
export function normalizePhone(input: string, defaultCountry: "IN" | null = "IN"): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+");
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (hasPlus) {
    if (digits.startsWith("91")) return indianMobile(digits.slice(2));
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  }
  if (digits.startsWith("00")) return normalizePhone(`+${digits.slice(2)}`, defaultCountry);
  if (defaultCountry !== "IN") return null;

  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  else if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  return indianMobile(digits);
}

/** Indian mobiles are ten digits and start with 6, 7, 8 or 9. */
function indianMobile(national: string): string | null {
  return /^[6-9]\d{9}$/.test(national) ? `+91${national}` : null;
}

/** "+919876543210" -> "98765 43210" for Indian numbers, unchanged otherwise. */
export function formatPhone(e164: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `${m[1]} ${m[2]}` : e164;
}
