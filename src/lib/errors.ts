/**
 * Turns a database error into a sentence a kennel worker can act on.
 *
 * The database raises its own errors with a code like "WB020: no space on
 * 2027-04-14". Those messages are already written for people, so we show
 * them with the code removed. Constraint violations are mapped by name.
 * Anything unrecognised becomes a generic message, and the real error is
 * logged on the server, never shown, because it can contain internals.
 *
 * The full list of WB codes lives in docs/reference/error-codes.md.
 */

export interface DbError {
  code?: string | null;
  message: string;
  details?: string | null;
}

const BY_CONSTRAINT: [needle: string, message: string][] = [
  ["bookings_no_kennel_overlap", "That kennel is already taken for some of those dates. Pick another kennel or change the dates."],
  ["bookings_no_pet_overlap", "This pet already has a booking that overlaps those dates."],
  ["bookings_boarding_has_a_night", "A boarding stay needs at least one night. For a day visit, choose day boarding."],
  ["bookings_dates_in_order", "Check-out cannot be before check-in."],
  ["play_sessions_one_pet_per_yard", "That yard is already in use at that time."],
  ["play_sessions_one_yard_per_pet", "This pet already has a play session at that time."],
  ["clients_org_phone_key", "A parent with this phone number is already on your list."],
  ["organizations_slug_key", "That link name is already taken. Try another."],
  ["organizations_slug_check", "The link name can use lower case letters, numbers and hyphens, and must be 3 to 40 characters."],
  ["organizations_gst_needs_registration", "Enter your GSTIN and state before switching GST on."],
  ["organizations_upi_vpa_check", "That does not look like a UPI ID. It should look like name@bank."],
  ["kennels_org_id_name_key", "A kennel with that name already exists."],
  ["services_one_default_per_kind", "There is already a default price for that kind of stay."],
  ["care_tasks_skipped_medication_needs_note", "Say why the medicine was not given. The parent and the next shift need to know."],
  ["organizations_play_hours_in_order", "The yards must close after they open."],
  ["organizations_play_break_inside_day", "The break must start and end while the yards are open."],
  ["peak_periods_check", "The last day cannot be before the first day."],
  ["play_yards_org_id_name_key", "A yard with that name already exists."],
];

const BY_CODE: Record<string, string> = {
  "42501": "You do not have permission to do that.",
  "23503": "This is linked to something that no longer exists, or is still in use elsewhere.",
  "23502": "A required detail is missing.",
  PGRST116: "That could not be found.",
};

export const GENERIC_ERROR = "Something went wrong. Nothing was saved. Please try again.";

export function friendlyError(error: DbError | null | undefined): string {
  if (!error) return GENERIC_ERROR;
  const wb = /WB\d{3}:\s*(.+)/.exec(error.message);
  if (wb) {
    const text = wb[1].trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  const haystack = `${error.message} ${error.details ?? ""}`;
  for (const [needle, message] of BY_CONSTRAINT) if (haystack.includes(needle)) return message;
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  return GENERIC_ERROR;
}
