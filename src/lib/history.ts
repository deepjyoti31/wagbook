import type { Messages } from "@/messages";
import { fill } from "./i18n";

/**
 * The audit log, in words a manager can read: who added, changed or removed
 * what, and for a change, each field as it was and as it is now.
 * Pure, so it is unit tested (history.test.ts). The words come in with the
 * format (m.history.log), in the reader's language, field names included
 * (m.history.log.fields); a column with no name there is named from itself.
 */

/** The words inside each change: m.history.log. */
export type HistoryWords = Messages["history"]["log"];

/** The tables a manager can filter the history by, in the order offered. Their names are in m.history.log.tables. */
export const HISTORY_TABLES = [
  "bookings",
  "booking_items",
  "invoices",
  "payments",
  "expenses",
  "services",
  "incidents",
  "organizations",
  "memberships",
] as const satisfies readonly (keyof HistoryWords["tables"])[];
export type HistoryTable = (typeof HISTORY_TABLES)[number];

export function isHistoryTable(value: unknown): value is HistoryTable {
  return typeof value === "string" && (HISTORY_TABLES as readonly string[]).includes(value);
}

const ACTION = { insert: "added", update: "changed", delete: "removed" } as const;

/** Bookkeeping columns that say nothing a person needs. */
const HIDDEN = new Set(["id", "org_id", "created_at", "updated_at", "created_by", "recorded_by", "public_token", "seq", "seller", "buyer"]);

export interface HistoryEntry {
  action: string;
  table_name: string;
  row_id: string | null;
  old_data: unknown;
  new_data: unknown;
}

export interface HistoryField {
  label: string;
  was: string | null;
  now: string | null;
}

/**
 * A field's name in the reader's language: "end_date" is "Check-out date". A
 * column with no name in the messages is named from itself: "tax_rate_bp"
 * becomes "Tax rate".
 */
export function fieldLabel(key: string, words?: Pick<HistoryWords, "fields">): string {
  const named = words ? (words.fields as Record<string, string>)[key] : undefined;
  if (named) return named;
  const plain = key.replace(/_(minor|bp)$/, "").replace(/_id$/, "").replace(/_/g, " ");
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** How to show money, moments and the records an id points at, and the words to use. */
export interface HistoryFormat {
  /** m.history.log */
  words: HistoryWords;
  /** Amounts in minor units. */
  money: (minor: number) => string;
  /** A moment, on the kennel's clock. */
  time: (iso: string) => string;
  /** The name of a person, pet, parent, kennel or price list row, when known. */
  name: (id: string) => string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A stored value as a person reads it. */
export function valueText(key: string, value: unknown, fmt: HistoryFormat): string {
  const w = fmt.words;
  if (value === null || value === undefined || value === "") return w.empty;
  if (typeof value === "boolean") return value ? w.yes : w.no;
  if (typeof value === "number" && key.endsWith("_minor")) return fmt.money(value);
  if (typeof value === "string" && UUID.test(value)) return fmt.name(value) ?? w.gone;
  if (typeof value === "string" && MOMENT.test(value)) return fmt.time(value);
  if (typeof value === "number" && key.endsWith("_bp")) return `${value / 100}%`;
  if (Array.isArray(value)) return value.length === 0 ? w.empty : value.map((v) => (typeof v === "string" ? v.replace(/_/g, " ") : JSON.stringify(v))).join(", ");
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** "Booking changed", with the fields that matter. */
export function describeEntry(entry: HistoryEntry, fmt: HistoryFormat): { title: string; fields: HistoryField[] } {
  const w = fmt.words;
  const table = isHistoryTable(entry.table_name) ? w.tables[entry.table_name] : fieldLabel(entry.table_name);
  const action = ACTION[entry.action as keyof typeof ACTION] as (typeof ACTION)[keyof typeof ACTION] | undefined;
  const was = record(entry.old_data);
  const now = record(entry.new_data);
  const keys = [...new Set([...Object.keys(entry.action === "delete" ? was : now), ...Object.keys(was)])].filter((k) => !HIDDEN.has(k));
  const fields = keys
    .map((key) => ({
      label: fieldLabel(key, w),
      was: entry.action === "insert" ? null : valueText(key, was[key], fmt),
      now: entry.action === "delete" ? null : valueText(key, now[key], fmt),
    }))
    // An added or removed row lists only what it had in it.
    .filter((f) => entry.action === "update" || (f.was ?? f.now) !== w.empty);
  // The log only holds insert, update and delete; anything else is shown as stored.
  return { title: action ? fill(w[action], { what: table }) : `${table} ${entry.action}`, fields };
}

/** Every id an entry mentions, to look up names for. */
export function idsIn(entry: HistoryEntry): string[] {
  const values = [...Object.values(record(entry.old_data)), ...Object.values(record(entry.new_data))];
  return values.filter((v): v is string => typeof v === "string" && UUID.test(v));
}

/** Where to see the row today, when there is a page for it. */
export function historyLink(entry: HistoryEntry): string | null {
  const data = { ...record(entry.old_data), ...record(entry.new_data) };
  const id = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
  switch (entry.table_name) {
    case "bookings":
      return entry.action === "delete" || !id(entry.row_id) ? null : `/app/bookings/${entry.row_id}`;
    case "booking_items":
      return id(data.booking_id) ? `/app/bookings/${data.booking_id}` : null;
    case "invoices":
      return entry.action === "delete" || !id(entry.row_id) ? null : `/app/bills/${entry.row_id}`;
    case "payments":
      return id(data.invoice_id) ? `/app/bills/${data.invoice_id}` : id(data.booking_id) ? `/app/bookings/${data.booking_id}` : null;
    case "incidents":
      return id(data.pet_id) ? `/app/dogs/${data.pet_id}` : null;
    default:
      return null;
  }
}
