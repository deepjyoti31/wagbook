import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedKennel, type Kennel } from "./fixtures";
import { admin, as, createTestDb, errorOf, user } from "./harness";

/**
 * Two-step sign-in recovery codes (D43): one code lets one
 * session in when the phone is lost, once. Codes belong to the authenticator
 * they were made for, and only a session that gave its code makes them.
 */

let db: PGlite;
let k: Kennel;
let factor: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  // The owner has turned on two-step sign-in.
  factor = (
    await as(db, admin, () => db.query<{ id: string }>("insert into auth.mfa_factors (user_id, status) values ($1, 'verified') returning id", [k.owner]))
  ).rows[0].id;
});
afterAll(() => db.close());

/** Run as the owner in a given session, at a given assurance level. */
const inSession = <T>(session: string, aal: "aal1" | "aal2", fn: () => Promise<T>) =>
  as(db, user(k.owner), async () => {
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ aal, session_id: session })]);
    return fn();
  });

const seesKennel = (session: string) =>
  inSession(session, "aal1", async () => (await db.query<{ n: number }>("select count(*)::int as n from public.organizations where id = $1", [k.org])).rows[0].n === 1);

const make = (session: string, aal: "aal1" | "aal2" = "aal2") =>
  inSession(session, aal, async () => (await db.query<{ code: string }>("select public.make_recovery_codes() as code")).rows.map((r) => r.code));

const use = (session: string, code: string) =>
  inSession(session, "aal1", async () => (await db.query<{ left: number }>("select public.use_recovery_code($1) as left", [code])).rows[0].left);

describe("recovery codes", () => {
  it("are made only by a session that gave its code from the app", async () => {
    expect((await errorOf(() => make("s0", "aal1"))).message).toContain("WB005");
    const codes = await make("s1");
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/);
    // Kept only as a hash, and nobody signed in can read them.
    expect((await errorOf(() => inSession("s1", "aal2", () => db.query("select * from public.recovery_codes")))).code).toBe("42501");
  });

  it("let one session in once each, without the phone", async () => {
    const codes = await make("s2");
    expect(await seesKennel("lost-phone")).toBe(false);
    // Typed in capitals with spaces, it still works.
    expect(await use("lost-phone", ` ${codes[0].toUpperCase().replace(/-/g, " ")} `)).toBe(9);
    expect(await seesKennel("lost-phone")).toBe(true);
    // Another session is still asked for a code; the used one does not work again.
    expect(await seesKennel("another")).toBe(false);
    expect((await errorOf(() => use("another", codes[0]))).message).toContain("WB007");
    expect((await errorOf(() => use("another", "0000-0000-0000"))).message).toContain("WB007");
    // A session let in by a code cannot make itself more codes.
    expect((await errorOf(() => make("lost-phone", "aal1"))).message).toContain("WB005");
  });

  it("are replaced by new ones, and stop counting when the authenticator goes", async () => {
    const old = await make("s3");
    const fresh = await make("s3");
    expect((await errorOf(() => use("s4", old[1]))).message).toContain("WB007");
    await use("s4", fresh[1]);
    expect(await seesKennel("s4")).toBe(true);

    // Two-step sign-in turned off and on again with a new phone: the old codes, and the sessions they let in, no longer count.
    await as(db, admin, async () => {
      await db.query("delete from auth.mfa_factors where id = $1", [factor]);
      factor = (await db.query<{ id: string }>("insert into auth.mfa_factors (user_id, status) values ($1, 'verified') returning id", [k.owner])).rows[0].id;
    });
    expect(await seesKennel("s4")).toBe(false);
    expect((await errorOf(() => use("s5", fresh[2]))).message).toContain("WB007");
  });

  it("need two-step sign-in to be on", async () => {
    const someone = (await as(db, admin, () => db.query<{ id: string }>("insert into auth.users (email) values ('nofactor@example.test') returning id"))).rows[0].id;
    expect(
      (await errorOf(() => as(db, user(someone), () => db.query("select public.make_recovery_codes()")))).message,
    ).toContain("WB006");
  });
});
