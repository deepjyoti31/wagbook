import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { as, createTestDb, user } from "./harness";

/**
 * The waiting list (D42): a request that waits for a kennel keeps its place
 * in line, stamped by the database, and the list says which would fit now.
 */

let db: PGlite;
let k: Kennel;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  // One kennel, so one stay fills the house.
  k = await seedKennel(db, { kennels: 1, pets: 3 });
  staff = await addMember(db, k, "staff");
});
afterAll(() => db.close());

const row = (id: string) =>
  as(db, user(staff), async () => (await db.query<{ status: string; waitlisted_at: string | null }>("select status, waitlisted_at::text from public.bookings where id = $1", [id])).rows[0]);

/** Put a request on the waiting list the way the app does: by setting the column to anything. */
const join = (id: string, when = "2001-01-01T00:00:00Z") =>
  as(db, user(staff), () => db.query("update public.bookings set waitlisted_at = $2 where id = $1", [id, when]));

const list = () =>
  as(db, user(staff), async () =>
    (await db.query<{ booking_id: string; has_space: boolean }>("select booking_id, has_space from public.waiting_list($1)", [k.org])).rows,
  );

describe("the waiting list", () => {
  it("stamps the real time a request joins, and never moves its place", async () => {
    const request = await book(db, k, { pet: k.pets[0], start: "2030-01-10", end: "2030-01-12", status: "requested" });
    await join(request);
    const first = (await row(request)).waitlisted_at;
    // Not the time the client sent: nobody can put themselves first in line.
    expect(first).not.toContain("2001");
    await join(request, "1999-01-01T00:00:00Z");
    await as(db, user(staff), () => db.query("update public.bookings set notes = 'Prefers a quiet kennel' where id = $1", [request]));
    expect((await row(request)).waitlisted_at).toBe(first);
  });

  it("is only for requests: a confirmed or cancelled stay leaves it", async () => {
    const confirmed = await book(db, k, { pet: k.pets[1], start: "2030-02-10", end: "2030-02-12" });
    await join(confirmed);
    expect((await row(confirmed)).waitlisted_at).toBeNull();

    const request = await book(db, k, { pet: k.pets[1], start: "2030-03-10", end: "2030-03-12", status: "requested" });
    await join(request);
    await as(db, user(staff), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Found another kennel' where id = $1", [request]));
    expect(await row(request)).toEqual({ status: "cancelled", waitlisted_at: null });
  });

  it("says which requests would fit now, first in line first", async () => {
    // The only kennel is taken from the 10th to the 15th of April 2031.
    const holder = await book(db, k, { pet: await strangerPet(db, k), start: "2031-04-10", end: "2031-04-15", kennel: k.kennels[0] });
    const second = await book(db, k, { pet: k.pets[0], start: "2031-04-12", end: "2031-04-14", status: "requested" });
    const first = await book(db, k, { pet: k.pets[1], start: "2031-04-11", end: "2031-04-13", status: "requested" });
    await join(first);
    await join(second);
    // A later stay, not waiting for this kennel: fits.
    const later = await book(db, k, { pet: k.pets[2], start: "2031-05-01", end: "2031-05-03", status: "requested" });
    await join(later);

    const before = (await list()).filter((r) => [first, second, later].includes(r.booking_id));
    expect(before).toEqual([
      { booking_id: first, has_space: false },
      { booking_id: second, has_space: false },
      { booking_id: later, has_space: true },
    ]);

    // The stay that held the kennel is cancelled: both now fit, in the order they joined.
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Plans changed' where id = $1", [holder]));
    const after = (await list()).filter((r) => [first, second].includes(r.booking_id));
    expect(after).toEqual([
      { booking_id: first, has_space: true },
      { booking_id: second, has_space: true },
    ]);

    // The first is confirmed and takes the kennel: it leaves the list, and the second no longer fits.
    await as(db, user(staff), () => db.query("update public.bookings set status = 'confirmed' where id = $1", [first]));
    const last = (await list()).filter((r) => [first, second].includes(r.booking_id));
    expect(last).toEqual([{ booking_id: second, has_space: false }]);
  });

  it("does not offer a pet a kennel on days it is already staying", async () => {
    const stay = await book(db, k, { pet: k.pets[2], start: "2032-01-10", end: "2032-01-12" });
    const request = await book(db, k, { pet: k.pets[2], start: "2032-01-11", end: "2032-01-13", status: "requested" });
    await join(request);
    expect((await list()).find((r) => r.booking_id === request)).toEqual({ booking_id: request, has_space: false });
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Moved' where id = $1", [stay]));
    expect((await list()).find((r) => r.booking_id === request)).toEqual({ booking_id: request, has_space: true });
  });

  it("leaves out stays that are already over", async () => {
    const past = await book(db, k, { pet: k.pets[0], start: "2020-01-10", end: "2020-01-12", status: "requested" });
    await join(past);
    expect((await list()).some((r) => r.booking_id === past)).toBe(false);
  });
});
