/**
 * CSV files for spreadsheets (RFC 4180), safe to open in Excel, Google Sheets
 * and LibreOffice.
 *
 * - Every value is quoted when it holds a comma, quote or line break.
 * - Lines end in CRLF, and the file starts with a byte order mark so Excel
 *   reads names in Hindi or Kannada and the rupee sign correctly.
 * - Text that a spreadsheet would run as a formula (starting with =, +, -, @,
 *   a tab or a carriage return) gets a leading apostrophe. A parent's name
 *   typed on the public intake form ends up here, so this matters. Plain
 *   numbers such as -12.50 are left alone.
 */

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "boolean" ? (value ? "yes" : "no") : String(value);
  if (typeof value === "string" && FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
