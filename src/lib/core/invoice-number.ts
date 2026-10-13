/**
 * Invoice numbers.
 *
 * India's GST rules ask for a consecutive serial number, unique within a
 * financial year, at most 16 characters, made of letters, digits, hyphen and
 * slash. Wagbook uses PREFIX/FY/SEQ, for example "WB/27-28/0001". The same
 * shape works fine for kennels outside India.
 *
 * The sequence itself is handed out by the database (see the issue_invoice
 * function) so that two staff issuing invoices at the same moment can never
 * get the same number or leave a gap. This file only formats and validates.
 */

export const INVOICE_NUMBER_MAX_LENGTH = 16;
const ALLOWED = /^[A-Za-z0-9/-]+$/;
const PREFIX = /^[A-Z0-9]{1,4}$/;

/**
 * A prefix is 1 to 4 capital letters or digits, e.g. "WB" or "DC".
 * Four is the most that still leaves room for 99,999 invoices a year.
 */
export function isValidInvoicePrefix(prefix: string): boolean {
  return PREFIX.test(prefix);
}

/** "2027-28" -> "27-28". A calendar-year label such as "2027" is kept whole. */
export function shortFiscalYear(fiscalYear: string): string {
  const m = /^\d{2}(\d{2})-(\d{2})$/.exec(fiscalYear);
  return m ? `${m[1]}-${m[2]}` : fiscalYear;
}

/** Build the printed invoice number. Throws if it would break the rules above. */
export function formatInvoiceNumber(prefix: string, fiscalYear: string, seq: number): string {
  if (!isValidInvoicePrefix(prefix)) throw new RangeError(`Invoice prefix must be 1 to 4 capital letters or digits: ${prefix}`);
  if (!Number.isInteger(seq) || seq < 1) throw new RangeError("Invoice sequence must be a positive integer");
  const number = `${prefix}/${shortFiscalYear(fiscalYear)}/${String(seq).padStart(4, "0")}`;
  if (number.length > INVOICE_NUMBER_MAX_LENGTH || !ALLOWED.test(number)) {
    throw new RangeError(`Invoice number "${number}" is longer than ${INVOICE_NUMBER_MAX_LENGTH} characters or has a character that is not allowed`);
  }
  return number;
}
