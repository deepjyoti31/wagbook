/**
 * Care ticks made with no connection (roadmap M8, decision D22).
 *
 * Ticking a task done is the one write Wagbook lets a phone make offline,
 * because it is safe to send twice: the database keeps the first who and
 * when, and a task already done is left alone. Bookings, payments and
 * everything else wait for the connection (a booking could clash).
 *
 * The ticks wait in this browser's localStorage as task ids, and are sent to
 * /app/care/sync when the connection is back. The time a task shows as done is
 * the time it reached the database, not the time of the tap.
 */

export const QUEUE_KEY = "wb_offline_ticks";
/** More than a kennel ticks in a day; a cap keeps a stuck queue from growing without end. */
export const MAX_QUEUED = 500;

export interface QueuedTick {
  taskId: string;
  /** When it was tapped, for showing; the database records its own time. */
  at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The queue as stored, cleaned: only well-formed ticks, no repeats, at most MAX_QUEUED. */
export function parseQueue(raw: string | null): QueuedTick[] {
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: QueuedTick[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const { taskId, at } = v as Record<string, unknown>;
    if (typeof taskId !== "string" || !UUID.test(taskId) || seen.has(taskId)) continue;
    seen.add(taskId);
    out.push({ taskId, at: typeof at === "string" ? at : "" });
  }
  return out.slice(-MAX_QUEUED);
}

/** The queue with one more tick; tapping the same task twice queues it once. */
export function addTick(queue: readonly QueuedTick[], taskId: string, at: string): QueuedTick[] {
  if (queue.some((q) => q.taskId === taskId)) return [...queue];
  return [...queue, { taskId, at }].slice(-MAX_QUEUED);
}

/** The queue without the ticks the server has taken. */
export function removeTicks(queue: readonly QueuedTick[], sent: readonly string[]): QueuedTick[] {
  const gone = new Set(sent);
  return queue.filter((q) => !gone.has(q.taskId));
}

// Browser side. Every access is guarded: storage can be full or switched off.

export function readQueue(): QueuedTick[] {
  try {
    return parseQueue(window.localStorage.getItem(QUEUE_KEY));
  } catch {
    return [];
  }
}

export function writeQueue(queue: readonly QueuedTick[]): boolean {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    window.dispatchEvent(new Event("wb-ticks"));
    return true;
  } catch {
    return false;
  }
}

/**
 * Send what is waiting. Returns how many the server took, or null when it
 * could not be reached (they stay queued for next time).
 */
export async function sendQueued(): Promise<number | null> {
  const queue = readQueue();
  if (queue.length === 0) return 0;
  try {
    const res = await fetch("/app/care/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: queue.map((q) => q.taskId) }),
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const { taken } = (await res.json()) as { taken: string[] };
    writeQueue(removeTicks(readQueue(), taken));
    return taken.length;
  } catch {
    return null;
  }
}
