/**
 * Solo play scheduling.
 *
 * Some kennels (the reference deployment is one) never let dogs of different
 * families play together. Every dog gets the yard to itself (or with its
 * siblings, when they share a kennel) for a fixed number of short sessions a
 * day. That is safer, and it makes the yard a scarce
 * resource that has to be scheduled: 60 dogs x 2 sessions x 20 minutes is 40
 * yard-hours a day.
 *
 * This module plans a day. The database separately guarantees that two
 * sessions can never overlap in the same yard (see play_sessions).
 */

/** A clock time in 24-hour "HH:MM" form. */
export type ClockTime = string;

export interface PlayWindow {
  start: ClockTime;
  end: ClockTime;
}

export interface PlayPlanInput {
  /**
   * The dogs to plan for. Dogs with the same `together` key (siblings sharing
   * a kennel) play together: they get the same slots in the same yard.
   */
  dogs: readonly { id: string; together?: string | null }[];
  yards: readonly { id: string }[];
  /** When the yards are in use, e.g. morning and late afternoon to avoid the heat. */
  windows: readonly PlayWindow[];
  /** Length of one session in minutes. */
  sessionMinutes: number;
  /** Sessions each dog should get in the day. */
  sessionsPerDog: number;
  /** Minutes between sessions in a yard, for moving dogs and cleaning up. */
  changeoverMinutes?: number;
  /** Minimum minutes between the end of a dog's session and its next one. */
  minGapMinutes?: number;
  /**
   * Sessions already on the timetable (planned earlier in the day, or moved by
   * hand). They keep their slots, count towards each dog's sessions, and the
   * new plan is fitted around them.
   */
  existing?: readonly PlannedSession[];
}

export interface PlannedSession {
  dogId: string;
  yardId: string;
  start: ClockTime;
  end: ClockTime;
}

export interface PlayPlan {
  sessions: PlannedSession[];
  /** Dogs that could not get all their sessions, with how many are missing. */
  shortfall: { dogId: string; missing: number }[];
  slotsAvailable: number;
  slotsNeeded: number;
}

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function toMinutes(time: ClockTime): number {
  const m = CLOCK.exec(time);
  if (!m) throw new RangeError(`Not a clock time: ${time}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function toClock(minutes: number): ClockTime {
  return `${String(Math.trunc(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Yard-minutes the day needs, including changeovers. */
export function yardMinutesNeeded(dogs: number, sessionsPerDog: number, sessionMinutes: number, changeoverMinutes = 0): number {
  return dogs * sessionsPerDog * (sessionMinutes + changeoverMinutes);
}

/** Smallest number of yards that can serve the day, or null if no slot fits in the windows. */
export function yardsNeeded(input: Omit<PlayPlanInput, "yards" | "dogs"> & { dogCount: number }): number | null {
  const step = input.sessionMinutes + (input.changeoverMinutes ?? 0);
  const slotsPerYard = input.windows.reduce((n, w) => n + slotsInWindow(w, input.sessionMinutes, step), 0);
  if (slotsPerYard === 0) return null;
  return Math.ceil((input.dogCount * input.sessionsPerDog) / slotsPerYard);
}

function slotsInWindow(w: PlayWindow, sessionMinutes: number, step: number): number {
  const length = toMinutes(w.end) - toMinutes(w.start);
  if (length < sessionMinutes) return 0;
  return Math.floor((length - sessionMinutes) / step) + 1;
}

/**
 * Plan a day of solo play.
 *
 * The plan is fair before it is full: every dog gets a first session before
 * any dog gets a second. If the yards cannot fit everything, the dogs at the
 * end of the list are the ones that miss out, and `shortfall` says so, so
 * staff can add a yard, lengthen the day or shorten sessions.
 */
export function planPlaySessions(input: PlayPlanInput): PlayPlan {
  const { sessionMinutes, sessionsPerDog } = input;
  const changeover = input.changeoverMinutes ?? 0;
  const minGap = input.minGapMinutes ?? 0;
  if (!Number.isInteger(sessionMinutes) || sessionMinutes <= 0) throw new RangeError("sessionMinutes must be a positive integer");
  if (!Number.isInteger(sessionsPerDog) || sessionsPerDog < 0) throw new RangeError("sessionsPerDog must be zero or more");
  if (changeover < 0 || minGap < 0) throw new RangeError("changeover and gap cannot be negative");

  // Every free slot in every yard, earliest first.
  type Slot = { yardId: string; start: number; end: number; taken: boolean };
  const slots: Slot[] = [];
  const step = sessionMinutes + changeover;
  for (const w of input.windows) {
    const open = toMinutes(w.start);
    const close = toMinutes(w.end);
    if (close <= open) throw new RangeError(`Play window ends before it starts: ${w.start} to ${w.end}`);
    for (let t = open; t + sessionMinutes <= close; t += step) {
      for (const yard of input.yards) slots.push({ yardId: yard.id, start: t, end: t + sessionMinutes, taken: false });
    }
  }
  slots.sort((a, b) => a.start - b.start);

  // What is already on the timetable blocks its yard (with the changeover)
  // and its dog (with the gap), and counts towards that dog's sessions.
  const existing = (input.existing ?? []).map((e) => ({ dogId: e.dogId, yardId: e.yardId, start: toMinutes(e.start), end: toMinutes(e.end) }));
  for (const slot of slots) {
    if (existing.some((e) => e.yardId === slot.yardId && slot.start < e.end + changeover && e.start < slot.end + changeover)) slot.taken = true;
  }
  const clashesWithExisting = (dogId: string, slot: Slot) =>
    existing.some((e) => e.dogId === dogId && slot.start < e.end + minGap && e.start < slot.end + minGap);

  const sessions: PlannedSession[] = [];
  const already = new Map<string, number>(input.dogs.map((d) => [d.id, existing.filter((e) => e.dogId === d.id).length]));
  const got = new Map<string, number>(already);

  // Siblings who play together are planned as one: a slot for the group is a
  // slot for each of them. In the order the first of each group appears.
  const groups = new Map<string, string[]>();
  for (const dog of input.dogs) {
    const key = dog.together ? `together:${dog.together}` : `dog:${dog.id}`;
    groups.set(key, [...(groups.get(key) ?? []), dog.id]);
  }
  const units = [...groups.values()];
  const unitGot = (dogs: string[]) => Math.min(...dogs.map((d) => got.get(d)!));
  const lastEnd = new Map<string[], number>();

  for (let round = 0; round < sessionsPerDog; round++) {
    for (const dogs of units) {
      // Fair before full: nobody gets a session in this round ahead of a dog with fewer.
      if (unitGot(dogs) > round) continue;
      const earliest = lastEnd.has(dogs) ? lastEnd.get(dogs)! + minGap : 0;
      const slot = slots.find((s) => !s.taken && s.start >= earliest && !dogs.some((d) => clashesWithExisting(d, s)));
      if (!slot) continue;
      slot.taken = true;
      lastEnd.set(dogs, slot.end);
      for (const dogId of dogs) {
        // A sibling who already has its sessions (one moved by hand, say) gets no extra.
        if (got.get(dogId)! >= sessionsPerDog) continue;
        got.set(dogId, got.get(dogId)! + 1);
        sessions.push({ dogId, yardId: slot.yardId, start: toClock(slot.start), end: toClock(slot.end) });
      }
    }
  }

  sessions.sort((a, b) => a.start.localeCompare(b.start) || a.yardId.localeCompare(b.yardId) || a.dogId.localeCompare(b.dogId));
  return {
    sessions,
    shortfall: input.dogs
      .map((d) => ({ dogId: d.id, missing: sessionsPerDog - got.get(d.id)! }))
      .filter((s) => s.missing > 0),
    slotsAvailable: slots.length,
    slotsNeeded: units.reduce((n, dogs) => n + Math.max(0, sessionsPerDog - Math.min(...dogs.map((d) => already.get(d)!))), 0),
  };
}

/**
 * The play windows of a day: the yards' opening hours, split in two by an
 * optional break (the midday heat, say). Accepts "HH:MM" or "HH:MM:SS".
 */
export function playWindows(dayStart: string, dayEnd: string, breakStart?: string | null, breakEnd?: string | null): PlayWindow[] {
  const hm = (t: string) => t.slice(0, 5);
  if (breakStart && breakEnd) {
    return [
      { start: hm(dayStart), end: hm(breakStart) },
      { start: hm(breakEnd), end: hm(dayEnd) },
    ];
  }
  return [{ start: hm(dayStart), end: hm(dayEnd) }];
}
