import { assertMinor, type Minor } from "./money";

/**
 * Amount in words using the Indian numbering system (thousand, lakh, crore),
 * as tax invoices in India conventionally show. Example:
 *   12345600 -> "Rupees One Lakh Twenty Three Thousand Four Hundred Fifty Six Only"
 */

const ONES = [
  "Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.trunc(n / 10)];
  return n % 10 === 0 ? t : `${t} ${ONES[n % 10]}`;
}

function below1000(n: number): string {
  if (n < 100) return below100(n);
  const h = `${ONES[Math.trunc(n / 100)]} Hundred`;
  return n % 100 === 0 ? h : `${h} ${below100(n % 100)}`;
}

/** Whole number in Indian-system words. Supports up to 99,99,99,99,999. */
export function numberToIndianWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError("expected a non-negative integer");
  if (n === 0) return ONES[0];
  const parts: string[] = [];
  const crore = Math.trunc(n / 10_000_000);
  const lakh = Math.trunc((n % 10_000_000) / 100_000);
  const thousand = Math.trunc((n % 100_000) / 1000);
  const rest = n % 1000;
  // Crores can themselves run past 99, so recurse for that part.
  if (crore) parts.push(`${crore > 999 ? numberToIndianWords(crore) : below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** "Rupees One Thousand Two Hundred and Fifty Paise Only". */
export function amountInWords(minor: Minor, major = "Rupees", minorUnit = "Paise"): string {
  assertMinor(minor);
  if (minor < 0) throw new RangeError("amount in words needs a non-negative amount");
  const whole = Math.trunc(minor / 100);
  const frac = minor % 100;
  const head = `${major} ${numberToIndianWords(whole)}`;
  return frac === 0 ? `${head} Only` : `${head} and ${numberToIndianWords(frac)} ${minorUnit} Only`;
}
