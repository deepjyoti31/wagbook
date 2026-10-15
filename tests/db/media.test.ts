import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;
let k: Kennel;
let other: Kennel;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  other = await seedKennel(db);
  staff = await addMember(db, k, "staff");
});
afterAll(() => db.close());

/** Put a file in the bucket, as an upload by the given member would. */
async function upload(actor: string, name: string) {
  await as(db, user(actor), () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [name]));
}

/** What an anonymous request carrying this stay token can see, as Storage would ask. */
async function visibleTo(token: string | null): Promise<string[]> {
  await db.query("select set_config('request.headers', $1, false)", [token === null ? "" : JSON.stringify({ "x-wagbook-stay": token })]);
  try {
    return await as(db, anon, async () => (await db.query<{ name: string }>("select name from storage.objects order by name")).rows.map((r) => r.name));
  } finally {
    await db.query("select set_config('request.headers', '', false)");
  }
}

const tokenOf = async (booking: string) => (await db.query<{ t: string }>("select public_token as t from public.bookings where id = $1", [booking])).rows[0].t;

describe("photos on the parent's stay page", () => {
  let booking: string;
  let token: string;
  beforeAll(async () => {
    booking = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    token = await tokenOf(booking);
    const shown = `${k.org}/updates/u1/1.jpg`;
    const internal = `${k.org}/updates/u2/1.jpg`;
    const petPhoto = `${k.org}/pets/${k.pets[0]}/profile.jpg`;
    const otherPet = `${k.org}/pets/${k.pets[1]}/profile.jpg`;
    for (const name of [shown, shown.replace(".jpg", ".small.jpg"), internal, internal.replace(".jpg", ".small.jpg"), petPhoto, otherPet]) await upload(staff, name);
    await upload(other.owner, `${other.org}/updates/x/1.jpg`);
    await as(db, user(staff), async () => {
      await db.query("insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths) values ($1, $2, $3, 'Happy', $4)", [k.org, booking, k.pets[0], [shown]]);
      await db.query(
        "insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths, is_visible_to_parent) values ($1, $2, $3, 'Vet note', $4, false)",
        [k.org, booking, k.pets[0], [internal]],
      );
      await db.query("update public.pets set photo_path = $2 where id = $1", [k.pets[0], petPhoto]);
      await db.query("update public.pets set photo_path = $2 where id = $1", [k.pets[1], otherPet]);
    });
  });

  it("shows the holder of the stay link only that stay's shared photos and its pet's photo", async () => {
    expect(await visibleTo(token)).toEqual([`${k.org}/pets/${k.pets[0]}/profile.jpg`, `${k.org}/updates/u1/1.jpg`, `${k.org}/updates/u1/1.small.jpg`]);
  });

  it("shows nothing without the token, with a wrong one, or once the stay is cancelled", async () => {
    expect(await visibleTo(null)).toEqual([]);
    expect(await visibleTo("0".repeat(64))).toEqual([]);
    expect(await visibleTo("not json")).toEqual([]);
    await db.query("select set_config('request.headers', 'not json', false)");
    expect(await as(db, anon, async () => (await db.query("select name from storage.objects")).rows)).toEqual([]);
    await db.query("select set_config('request.headers', '', false)");

    const cancelled = await book(db, k, { pet: k.pets[2], start: "2027-05-01", end: "2027-05-03" });
    await upload(staff, `${k.org}/updates/u3/1.jpg`);
    await as(db, user(staff), () =>
      db.query("insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths) values ($1, $2, $3, 'Hi', $4)", [k.org, cancelled, k.pets[2], [`${k.org}/updates/u3/1.jpg`]]),
    );
    const t = await tokenOf(cancelled);
    expect(await visibleTo(t)).toContain(`${k.org}/updates/u3/1.jpg`);
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled' where id = $1", [cancelled]));
    expect(await visibleTo(t)).toEqual([]);
  });

  it("never lets an anonymous request add, change or remove a file", async () => {
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-wagbook-stay": token })]);
    try {
      expect((await errorOf(() => as(db, anon, () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [`${k.org}/updates/u1/2.jpg`])))).code).toBe("42501");
      await as(db, anon, () => db.query("delete from storage.objects where name like $1", [`${k.org}/%`]));
    } finally {
      await db.query("select set_config('request.headers', '', false)");
    }
    const still = await db.query<{ n: number }>("select count(*)::int as n from storage.objects where name like $1", [`${k.org}/%`]);
    expect(still.rows[0].n).toBeGreaterThan(3);
  });
});

describe("files stay in their kennel", () => {
  it("refuses a photo, certificate or update that points into another kennel's folder", async () => {
    const theirs = `${other.org}/updates/x/1.jpg`;
    const b = await book(db, k, { pet: k.pets[1], start: "2027-06-01", end: "2027-06-03", status: "checked_in" });
    const fails = (q: string, params: unknown[]) => errorOf(() => as(db, user(staff), () => db.query(q, params)));
    expect((await fails("update public.pets set photo_path = $2 where id = $1", [k.pets[1], theirs])).message).toContain("pets_photo_in_org");
    expect(
      (await fails("insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths) values ($1, $2, $3, 'x', $4)", [k.org, b, k.pets[1], [theirs]])).message,
    ).toContain("stay_updates_media_in_org");
    expect(
      (await fails("insert into public.vaccinations (org_id, pet_id, vaccine, certificate_path) values ($1, $2, 'rabies', $3)", [k.org, k.pets[1], theirs])).message,
    ).toContain("vaccinations_certificate_in_org");
    expect(
      (await fails("insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths) values ($1, $2, $3, 'x', $4)", [k.org, b, k.pets[1], Array.from({ length: 7 }, (_, i) => `${k.org}/updates/y/${i}.jpg`)])).message,
    ).toContain("stay_updates_at_most_six_photos");
  });

  it("does not let another kennel's member fetch the file", async () => {
    const mine = `${k.org}/pets/${k.pets[0]}/profile.jpg`;
    const seen = await as(db, user(other.owner), async () => (await db.query("select name from storage.objects where name = $1", [mine])).rows);
    expect(seen).toEqual([]);
  });
});
