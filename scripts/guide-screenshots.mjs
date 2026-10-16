// Takes the pictures in docs/17-guide-for-kennel-owners.md, at phone width,
// from a running Wagbook with the demo data of supabase/seed.sql:
//
//   npx -y supabase@2.120.0 db reset      # fresh demo data, dated today
//   npm run build && npm run start        # with the local Supabase's settings
//   node scripts/guide-screenshots.mjs http://localhost:3000
//
// Uses the browser that Playwright finds, or the one at E2E_CHROMIUM_PATH.
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const out = "docs/guide";
mkdirSync(out, { recursive: true });
const executablePath = process.env.E2E_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium";
const browser = await chromium.launch(existsSync(executablePath) ? { executablePath } : {});
const context = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();

async function shot(name, path) {
  if (path) await page.goto(base + path);
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/${name}.jpg`, type: "jpeg", quality: 80 });
  console.log(`${out}/${name}.jpg`);
}

await shot("01-sign-in", "/login");
await page.getByLabel("Email").fill("owner@demo.wagbook.test");
await page.getByLabel("Password").fill("wagbook-demo");
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL(/\/app/);
await shot("02-today", "/app");
await shot("03-new-booking", "/app/bookings/new");
await page.goto(`${base}/app/bookings`);
await page.getByRole("link").filter({ hasText: "Biscuit" }).filter({ hasText: "In house" }).first().click();
await page.waitForURL(/\/app\/bookings\/[0-9a-f-]{36}/);
const stayLink = (await page.getByText(/\/s\/[0-9a-f]{64}/).first().innerText()).trim();
await shot("04-booking");
await shot("05-care", "/app/care");
await shot("06-pets", "/app/dogs");
await page.getByRole("link", { name: "Biscuit", exact: true }).first().click();
await page.waitForURL(/\/app\/dogs\/[0-9a-f-]{36}/);
await shot("07-pet");
await shot("08-bills", "/app/bills");
await shot("09-forms", "/app/more/intake");
await shot("10-reports", "/app/more/reports");
await shot("11-more", "/app/more");
await shot("12-two-step", "/app/more/two-step");

// What parents see: no account, just links.
const parent = await browser.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1.5 });
const p = await parent.newPage();
await p.goto(`${base}/i/demo`);
await p.waitForLoadState("networkidle");
await p.screenshot({ path: `${out}/13-intake-form.jpg`, type: "jpeg", quality: 80 });
console.log(`${out}/13-intake-form.jpg`);
await p.goto(stayLink);
await p.waitForLoadState("networkidle");
await p.screenshot({ path: `${out}/14-stay-page.jpg`, type: "jpeg", quality: 80 });
console.log(`${out}/14-stay-page.jpg`);

await browser.close();
