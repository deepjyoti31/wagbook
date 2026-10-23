import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests: a real browser against the real app and a local Supabase.
 * Not part of `npm run check`, because they need Docker.
 *
 *   npx -y supabase@2.120.0 start
 *   npm run test:e2e
 *
 * The app is built and started on port 3100 with the local Supabase's address
 * and publishable key, which `npm run test:e2e` reads from `supabase status`.
 */
const PORT = 3100;
// Point at an app that is already running (say `npm run dev`) instead of building one.
const external = process.env.E2E_BASE_URL;
const baseURL = external ?? `http://localhost:${PORT}`;

// Alerts on phones (M61) are switched on with a key pair made for this run.
const vapid = (() => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const point = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
  return { publicKey: point.toString("base64url"), privateKey: privateKey.export({ format: "jwk" }).d!, secret: randomBytes(32).toString("hex") };
})();

// Use the browser a container already has, if any, instead of downloading one.
const preinstalled = process.env.E2E_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "./e2e",
  // The tests share one database and walk one story, so they run in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Pixel 7"],
        // The narrowest phone Wagbook promises to work on.
        viewport: { width: 360, height: 780 },
        ...(existsSync(preinstalled) ? { launchOptions: { executablePath: preinstalled } } : {}),
      },
    },
  ],
  webServer: external
    ? undefined
    : {
    command: `npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_KEY ?? "",
      NEXT_PUBLIC_SITE_URL: baseURL,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: "mailto:walk@example.test",
      PUSH_SECRET: vapid.secret,
    },
  },
});
