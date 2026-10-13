// Runs the end-to-end tests against the local Supabase started by
// `npx supabase start`: resets it to the migrations plus supabase/seed.sql,
// reads its address and publishable key, then runs Playwright.
// Extra arguments go to Playwright, e.g. `npm run test:e2e -- --headed`.
import { execFileSync, spawnSync } from "node:child_process";

// Pinned so every machine runs the same CLI. Fetched by npx, not installed as a
// dependency, so `npm ci` stays small for everyone who never runs these tests.
export const SUPABASE_CLI = "supabase@2.120.0";
const supabase = (...args) => execFileSync("npx", ["-y", SUPABASE_CLI, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

let status;
try {
  status = JSON.parse(supabase("status", "-o", "json"));
} catch {
  console.error("The local Supabase is not running. Start it with: npx -y supabase@2.120.0 start (needs Docker).");
  process.exit(1);
}
const url = status.API_URL;
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!url || !key) {
  console.error("Could not read the local Supabase address and publishable key from `supabase status`.");
  process.exit(1);
}

console.log("Resetting the local database to the migrations and the demo seed...");
supabase("db", "reset");

const run = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, E2E_SUPABASE_URL: url, E2E_SUPABASE_KEY: key },
});
process.exit(run.status ?? 1);
