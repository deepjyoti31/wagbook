import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

/**
 * Test database harness.
 *
 * Starts a real Postgres engine inside the test process (PGlite), installs a
 * small stand-in for Supabase's roles and schemas, then applies every file in
 * supabase/migrations in order, exactly as `supabase db push` would. No
 * Docker, no network, no Supabase account needed, so it runs anywhere,
 * including Claude Code cloud sessions.
 */

const here = dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = join(here, "..", "..", "supabase", "migrations");
export const SEED_PATH = join(here, "..", "..", "supabase", "seed.sql");

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  await db.exec(readFileSync(join(here, "supabase-shim.sql"), "utf8"));
  for (const file of migrationFiles()) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}

export type Actor = { kind: "user"; id: string } | { kind: "anon" } | { kind: "admin" };

/**
 * Run a callback as a given actor, the way a request through the Supabase API
 * would run: as the `authenticated` role with a user id, or as `anon`.
 * `admin` is the migration role and bypasses row level security; use it only
 * to arrange test data.
 */
export async function as<T>(db: PGlite, actor: Actor, fn: () => Promise<T>): Promise<T> {
  await db.exec("reset role");
  if (actor.kind === "user") {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [actor.id]);
    await db.exec("set role authenticated");
  } else if (actor.kind === "anon") {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.exec("set role anon");
  } else {
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export const user = (id: string): Actor => ({ kind: "user", id });
export const anon: Actor = { kind: "anon" };
export const admin: Actor = { kind: "admin" };

/** Create an auth user (as Supabase Auth would on sign-up) and return its id. */
export async function createUser(db: PGlite, email: string): Promise<string> {
  const res = await db.query<{ id: string }>("insert into auth.users (email) values ($1) returning id", [email]);
  return res.rows[0].id;
}

/** Create an organisation owned by `ownerId`, through the real function. */
export async function createOrg(db: PGlite, ownerId: string, name: string, slug: string): Promise<string> {
  return as(db, user(ownerId), async () => {
    const res = await db.query<{ id: string }>("select public.create_organization($1, $2, $3) as id", [name, slug, "Owner"]);
    return res.rows[0].id;
  });
}

/** The Postgres error for a statement that is expected to fail. */
export async function errorOf(fn: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; message: string };
    return { code: err.code, message: err.message };
  }
  throw new Error("Expected the statement to fail, but it succeeded");
}
