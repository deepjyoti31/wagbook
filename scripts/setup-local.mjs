// Points the app at the local Supabase started by `npx -y supabase@2.120.0 start`:
// reads its address and publishable key from `supabase status` and writes them
// to .env.local. An existing .env.local is kept as .env.local.bak first.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync } from "node:fs";

// The same pinned CLI as scripts/e2e.mjs.
const SUPABASE_CLI = "supabase@2.120.0";

let status;
try {
  status = JSON.parse(execFileSync("npx", ["-y", SUPABASE_CLI, "status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
} catch {
  console.error(`The local Supabase is not running. Start it first with: npx -y ${SUPABASE_CLI} start (needs Docker).`);
  process.exit(1);
}
const url = status.API_URL;
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
if (!url || !key) {
  console.error("Could not read the local Supabase address and publishable key from `supabase status`.");
  process.exit(1);
}

if (existsSync(".env.local")) {
  copyFileSync(".env.local", ".env.local.bak");
  console.log("Kept your old .env.local as .env.local.bak.");
}
writeFileSync(
  ".env.local",
  `# Written by npm run setup:local for the local Supabase. Not for a real kennel.\nNEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${key}\nNEXT_PUBLIC_SITE_URL=\n`,
);
console.log(`Wrote .env.local for ${url}. Now run: npm run dev`);
console.log("Sign in as owner@demo.wagbook.test, manager@demo.wagbook.test or staff@demo.wagbook.test, password wagbook-demo.");
