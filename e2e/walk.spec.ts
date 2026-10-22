import { expect, test, type Browser, type Page } from "@playwright/test";
import { en } from "../src/messages/en";
import { hi } from "../src/messages/hi";
import { kn } from "../src/messages/kn";

/**
 * The whole day at a kennel, in a real browser at phone width, against a
 * local Supabase loaded with supabase/seed.sql. The steps share one database
 * and run in order; `npm run test:e2e` resets the database first.
 */

test.describe.configure({ mode: "serial" });

// Each test is a different visitor to the app's rate limits (src/lib/rate-limit.ts),
// as the kennel's staff on their own phones would be. One test below shares an address on purpose.
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-real-ip": `198.51.100.${Math.floor(Math.random() * 250) + 1}` });
});

const PASSWORD = "wagbook-demo";

/** The kennel's calendar date, plus some days. The demo kennel is in India. */
function day(offset = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function signIn(page: Page, who: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(who.includes("@") ? who : `${who}@demo.wagbook.test`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/app|\/onboarding/);
}

/** A fresh browser with nobody signed in: what a parent has. */
async function privateWindow(browser: Browser) {
  const context = await browser.newContext({ viewport: { width: 360, height: 780 } });
  return { context, page: await context.newPage() };
}

/** A pet's own page, found through the search on Pets. */
async function openPet(page: Page, pet: string) {
  await page.goto(`/app/dogs?q=${encodeURIComponent(pet)}`);
  await page.getByRole("link", { name: pet, exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: pet })).toBeVisible();
}

async function openBooking(page: Page, pet: string, status: string) {
  await page.goto("/app/bookings");
  await page.getByRole("link").filter({ hasText: pet }).filter({ hasText: status }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: pet })).toBeVisible();
}

test("signing in shows today at the kennel", async ({ page }) => {
  await signIn(page, "staff");
  await expect(page.getByText("4 in house of 12 kennels")).toBeVisible();
  await expect(page.getByRole("link", { name: /Meals 2 of 12/ })).toBeVisible();
  // Nothing on the page is wider than the phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("checking in with the checklist", async ({ page }) => {
  await signIn(page, "staff");
  await openBooking(page, "Coco", "Confirmed");
  await page.getByLabel("I have seen the vaccination certificates").check();
  await page.getByLabel("Belongings", { exact: false }).first().fill("Red harness, chew toy");
  await page.getByLabel("Anything said at the gate").fill("Eats slowly");
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("In house", { exact: true })).toBeVisible();
});

test("double booking is refused with a clear sentence", async ({ page }) => {
  await signIn(page, "staff");
  // Coco is in house until day 4 in K05.
  await page.goto(`/app/bookings/new`);
  await page.locator("select[name=petId]").selectOption({ label: "Coco, Beagle (Kavya Example)" });
  await page.getByLabel("Check-in date").fill(day(1));
  await page.getByLabel("Check-out date").fill(day(3));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("This pet already has a booking that overlaps those dates.")).toBeVisible();
  // What was typed is still there.
  await expect(page.getByLabel("Check-out date")).toHaveValue(day(3));

  // Found by typing part of the parent's phone number.
  await page.getByLabel("Find a pet").fill("00105");
  await expect(page.locator("select[name=petId]")).toHaveValue(/.+/);
  await expect(page.locator("select[name=petId] option:checked")).toHaveText("Tofu, Shih Tzu (Neha Placeholder)");
  await page.getByLabel("Check-in date").fill(day(1));
  await page.getByLabel("Check-out date").fill(day(3));
  // K05 is taken on those dates, so it is not offered; it is again from the day Coco leaves.
  const k05 = page.locator("select[name=kennelId] option", { hasText: /^K05$/ });
  await expect(k05).toHaveCount(0);
  await expect(page.getByText("Kennels taken on these dates are left out.")).toBeVisible();
  await page.getByLabel("Check-out date").fill(day(7));
  await page.getByLabel("Check-in date").fill(day(4));
  await expect(k05).toHaveCount(1);
});

test("staff cannot set a price; a family is booked together as a request, then confirmed", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto("/app/bookings/new");
  await expect(page.getByLabel("Price")).toHaveCount(0);
  await expect(page.getByText("Only an owner or manager can change a price.")).toBeVisible();

  await page.locator("select[name=petId]").selectOption({ label: "Biscuit, Labrador (Priya Demo)" });
  await page.getByRole("checkbox", { name: /Pepper/ }).check();
  await page.getByLabel("Check-in date").fill(day(30));
  await page.getByLabel("Check-out date").fill(day(33));
  await page.getByRole("button", { name: "Save as request" }).click();
  await expect(page.getByText("Saved as a request. It holds no space until you confirm it.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Booked together/ })).toBeVisible();
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Confirmed. The space is now held.")).toBeVisible();
});

test("two pets of one parent share a kennel, the second at the shared kennel price", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/settings");
  await page.getByLabel("Second pet sharing a kennel, per night").fill("900");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(en.settings.saved)).toBeVisible();
  await expect(page.getByLabel("Second pet sharing a kennel, per night")).toHaveValue("900");

  await signIn(page, "staff");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Rocky, Indie (Vikram Mock)" });
  await page.getByRole("checkbox", { name: /Luna/ }).check();
  await page.getByLabel("Check-in date").fill(day(50));
  await page.getByLabel("Check-out date").fill(day(53));
  await page.getByRole("radio", { name: "One kennel together" }).check();
  await expect(page.getByText("The second pet is at your shared kennel price, ₹900.")).toBeVisible();
  // Sharing needs a kennel chosen.
  await expect(page.locator("select[name=kennelId]")).toHaveAttribute("required", "");
  await page.locator("select[name=kennelId]").selectOption({ label: "K09" });
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("2 pets booked together.")).toBeVisible();
  await expect(page.getByText("Shares K09 with Luna.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.getByRole("link", { name: /Luna/ }).first().click();
  await expect(page.getByText("Shares K09 with Rocky.")).toBeVisible();
  await expect(page.getByText(/₹900 a night/)).toBeVisible();

  // Both are in K09's square on the calendar.
  await page.goto(`/app/calendar?from=${day(50)}`);
  const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "K09" }) });
  // One link a night for each of them, three nights.
  await expect(row.getByRole("link", { name: "Rocky" })).toHaveCount(3);
  await expect(row.getByRole("link", { name: "Luna" })).toHaveCount(3);
});

test("a pet that overstays is extended to today", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto("/app");
  const bruno = page.getByRole("listitem").filter({ hasText: "Bruno" });
  await bruno.getByRole("button", { name: "Extend to today" }).click();
  await expect(page.getByText("Stay extended to today.")).toBeVisible();
});

test("the care round: one tap, and safe to tap twice", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto("/app/care?kind=medication");
  const tablet = page.getByRole("listitem").filter({ hasText: "Thyroid tablet" });
  await tablet.getByRole("button", { name: "Done" }).dblclick();
  await expect(tablet.getByText("Done", { exact: true }).first()).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /Medicines 1 of 1/ })).toBeVisible();

  await page.goto("/app/care?kind=meal&show=pending");
  const lunch = page.getByRole("listitem").filter({ hasText: "Mango" }).filter({ hasText: "Lunch" });
  await lunch.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Mango" }).filter({ hasText: "Lunch" })).toHaveCount(0);
});

test("solo play is planned and ticked", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto("/app/play");
  await page.getByRole("button", { name: "Plan today" }).click();
  await expect(page.getByText(/Planned \d+ sessions? of 20 minutes/)).toBeVisible();
  await page.getByRole("button", { name: "Done" }).first().click();
  await expect(page.getByText(/1 of \d+ sessions done/)).toBeVisible();
});

test("a booking is cancelled with a reason", async ({ page }) => {
  await signIn(page, "staff");
  await openBooking(page, "Tofu", "Confirmed");
  await page.getByLabel("Why is it cancelled?").fill("Parent's plans changed");
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled. The space is free again.")).toBeVisible();
});

test("a parent sends the intake form, and staff accept it", async ({ page, browser }) => {
  const parent = await privateWindow(browser);
  await parent.page.goto("/i/demo");
  await parent.page.getByLabel("Your name").fill("Sanjay Invented");
  await parent.page.getByLabel("Mobile number").fill("9800000199");
  await parent.page.getByLabel("Name", { exact: true }).fill("Whiskers");
  await parent.page.getByLabel("Drop-off date").fill(day(40));
  await parent.page.getByLabel("Pick-up date").fill(day(42));
  await parent.page.getByRole("checkbox").check();
  await parent.page.getByRole("button", { name: /Send to/ }).click();
  await expect(parent.page.getByText(/Thank you|sent/i).first()).toBeVisible();
  await parent.context.close();

  await signIn(page, "staff");
  await page.goto("/app/more/intake");
  await page.getByRole("button", { name: "Accept and book" }).click();
  await page.waitForURL(/\/app\/bookings\/new/);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Whiskers" })).toBeVisible();
});

test("the parent's stay page opens in a private window", async ({ page, browser }) => {
  await signIn(page, "staff");
  await openBooking(page, "Mango", "In house");
  const link = await page.getByText(/\/s\/[0-9a-f]{64}/).innerText();
  const parent = await privateWindow(browser);
  await parent.page.goto(link.trim());
  await expect(parent.page.getByText("Mango").first()).toBeVisible();
  await expect(parent.page.getByText("Staying with us now")).toBeVisible();
  await parent.context.close();
});

test("a manager changes a price and adds an extra", async ({ page }) => {
  await signIn(page, "manager");
  await openBooking(page, "Mango", "Request");
  await page.getByLabel("Price per night").fill("1100");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Booking saved.")).toBeVisible();
  await page.getByLabel("From your price list").selectOption({ label: "Grooming, ₹2,000" });
  await page.getByRole("button", { name: "Add extra" }).click();
  await expect(page.getByText("Added Grooming.")).toBeVisible();
  await expect(page.getByText(/Estimated total/)).toBeVisible();

  // Turned into day boarding and back again, priced per day in between.
  await page.getByRole("combobox", { name: /^Stay/ }).selectOption("daycare");
  await page.getByLabel("Price per night").fill("720");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Booking saved.")).toBeVisible();
  await expect(page.getByLabel("Price per day")).toHaveValue("720");
  await page.getByRole("combobox", { name: /^Stay/ }).selectOption("boarding");
  await page.getByLabel("Price per day").fill("1100");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByLabel("Price per night")).toHaveValue("1100");
});

test("the calendar shows kennels by day and books from an empty square", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto("/app/calendar");
  await expect(page.getByRole("region", { name: "Kennels by day" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("link", { name: /Book K12 from/ }).first().click();
  await expect(page.locator("select[name=kennelId]")).toHaveValue(/[0-9a-f-]{36}/);
});

test("a new person creates a kennel, invites a colleague, who joins and switches between kennels", async ({ page, browser }) => {
  const email = `new-${Date.now()}@example.test`;
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Kennel name").fill("Second Test Kennel");
  await page.getByLabel("Link name").fill(`second-${Date.now() % 100000}`);
  await page.getByLabel("Your name").fill("Tester");
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL(/\/app\/more\/kennels/);
  await page.getByRole("button", { name: "Add the row" }).click();
  await expect(page.getByText("Added 10 kennels.")).toBeVisible();

  // Invite the demo staff member, who then has two kennels.
  await page.goto("/app/more/people");
  const byEmail = page.locator("form").filter({ has: page.getByLabel("Their email") });
  await byEmail.getByLabel("Their name").fill("Meena");
  await byEmail.getByLabel("Their email").fill("staff@demo.wagbook.test");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText(/Meena/).first()).toBeVisible();

  const staff = await privateWindow(browser);
  await signIn(staff.page, "staff");
  await staff.page.goto("/onboarding");
  await staff.page.getByRole("button", { name: "Join" }).click();
  await staff.page.goto("/app/more");
  await staff.page.getByRole("button", { name: /Switch to/ }).first().click();
  await staff.page.goto("/app/more");
  await expect(staff.page.getByText(/You also work at/)).toBeVisible();
  await staff.page.getByRole("button", { name: "Sign out" }).click();
  await staff.page.waitForURL(/\/login/);
  await staff.context.close();
});

test("an advance is recorded on a booking before the bill", async ({ page }) => {
  await signIn(page, "staff");
  await openBooking(page, "Coco", "In house");
  await page.getByLabel("Amount").fill("1000");
  await page.getByRole("button", { name: "Record advance" }).click();
  await expect(page.getByText("Advance recorded.")).toBeVisible();
  await expect(page.getByText(/Advance of ₹1,000/)).toBeVisible();
});

test("check out, make the bill, issue it, and the parent sees it with a UPI QR code", async ({ page, browser }) => {
  await signIn(page, "staff");
  await openBooking(page, "Mango", "In house");
  await page.getByRole("button", { name: "Check out" }).click();
  await expect(page.getByText(/Checked out\. .*Make the bill below\./)).toBeVisible();
  await page.getByRole("button", { name: "Make bill" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft bill" })).toBeVisible();
  await page.getByRole("button", { name: "Issue bill" }).click();
  await expect(page.getByText(/^Issued\./)).toBeVisible();
  const number = await page.getByRole("heading", { level: 1 }).innerText();
  expect(number).toMatch(/^WB\/\d{2}-\d{2}\/0001$/);

  const link = (await page.getByRole("link", { name: "Open it" }).getAttribute("href"))!;
  const parent = await privateWindow(browser);
  await parent.page.goto(link);
  await expect(parent.page.getByRole("heading", { name: "Bill", exact: true })).toBeVisible();
  await expect(parent.page.getByText(number)).toBeVisible();
  await expect(parent.page.getByRole("img", { name: /QR code to pay/ })).toBeVisible();
  await expect(parent.page.getByRole("link", { name: "Pay with UPI" })).toHaveAttribute("href", /^upi:\/\/pay\?pa=demokennel%40okdemo/);
  await expect(parent.page.getByText(/Rupees One Thousand Two Hundred Only/)).toBeVisible();
  expect(await parent.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // A payment recorded by the kennel, and only that, makes the bill paid.
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();
  await expect(page.getByText("Nothing due")).toBeVisible();
  await parent.page.reload();
  await expect(parent.page.getByText("Paid in full")).toBeVisible();
  await expect(parent.page.getByRole("img", { name: /QR code to pay/ })).toHaveCount(0);
  await parent.context.close();
});

test("a manager changes a line on a draft bill before issuing it", async ({ page }) => {
  await signIn(page, "manager");
  await openBooking(page, "Biscuit", "In house");
  // Biscuit was booked with Pepper, so they share one bill.
  await page.getByRole("button", { name: "Make the family bill" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft bill" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pepper booking" })).toBeVisible();
  await page.getByText("Change").first().click();
  await page.getByLabel("Discount").first().fill("500");
  await page.getByRole("button", { name: "Save line" }).first().click();
  await expect(page.getByText("Bill updated.")).toBeVisible();
  await expect(page.getByText(/less ₹500/)).toBeVisible();
  await page.getByRole("button", { name: "Issue bill" }).click();
  await expect(page.getByText(/^Issued\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "Send bill" })).toHaveAttribute("href", /^https:\/\/wa\.me\/919800000101\?text=/);
});

/** A real JPEG drawn in the browser, with a fake camera location planted in it, as a phone would write. */
async function photoWithLocation(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2400;
    c.height = 1800;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#c98a3d";
    ctx.fillRect(0, 0, 2400, 1800);
    ctx.fillStyle = "#14213d";
    ctx.fillRect(600, 400, 1200, 1000);
    return c.toDataURL("image/jpeg", 0.9);
  });
  const jpeg = Buffer.from(dataUrl.split(",")[1], "base64");
  const payload = Buffer.from("Exif\0\0GPSLatitude 12.9716 N GPSLongitude 77.5946 E", "latin1");
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]), payload]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

test("a photo of the pet, and an update with a photo that the parent sees without the location", async ({ page, browser }) => {
  await signIn(page, "staff");
  await openPet(page, "Pepper");
  const photo = await photoWithLocation(page);
  await page.locator("input[name=photo]").setInputFiles({ name: "pepper.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator("img[src^='blob:']").first()).toBeVisible();
  await page.getByRole("button", { name: "Save photo" }).click();
  await expect(page.getByText("Photo saved.")).toBeVisible();

  await openBooking(page, "Pepper", "In house");
  await page.getByRole("link", { name: "Write update" }).first().click();
  await page.getByLabel("How is the pet doing?").fill("Pepper played fetch all morning.");
  await page.locator("input[name=photos]").setInputFiles({ name: "fetch.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.locator("img[src^='blob:']").first()).toBeVisible();
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Saved. It is on the parent's stay page now.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveAttribute("href", /wa\.me\/919800000101\?text=Pepper/);

  await page.getByRole("link", { name: "Back to the booking" }).click();
  const link = await page.getByText(/\/s\/[0-9a-f]{64}/).innerText();
  const parent = await privateWindow(browser);
  await parent.page.goto(link.trim());
  await expect(parent.page.getByText("Pepper played fetch all morning.")).toBeVisible();
  const shown = parent.page.locator("a[target=_blank] img").first();
  await expect(shown).toBeVisible();
  expect(await shown.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

  // The photo itself: shrunk to about 1,600 pixels and with no location in it.
  const fullUrl = (await parent.page.locator("a[target=_blank]").first().getAttribute("href"))!;
  const bytes = Buffer.from(await (await parent.page.request.get(fullUrl)).body());
  expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
  expect(bytes.toString("latin1")).not.toContain("GPS");
  const size = await parent.page.evaluate(async (u) => {
    const img = new Image();
    img.src = u;
    await img.decode();
    return Math.max(img.naturalWidth, img.naturalHeight);
  }, fullUrl);
  expect(size).toBe(1600);
  await parent.context.close();

  // Without the stay's token the same file is out of reach.
  const bare = fullUrl.replace(/\/sign\//, "/authenticated/").split("?")[0];
  expect((await page.request.get(bare)).status()).toBeGreaterThanOrEqual(400);
});

test("a vaccination is recorded with its certificate", async ({ page }) => {
  await signIn(page, "staff");
  await openPet(page, "Pepper");
  await page.getByText("Add a vaccination").click();
  await page.getByLabel("Vaccine").fill("Kennel cough");
  await page.getByLabel("Valid until").fill("2030-01-01");
  await page.locator("input[name=certificate]").setInputFiles({ name: "certificate.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%Wagbook test\n%%EOF\n") });
  await page.getByRole("button", { name: "Save vaccination" }).click();
  await expect(page.getByText("Recorded Kennel cough.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Certificate" })).toBeVisible();
});

test("search finds a pet by its parent's name or phone number", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto(`/app/dogs?q=${encodeURIComponent("98000 00103")}`);
  await expect(page.getByRole("link", { name: "Coco", exact: true })).toBeVisible();
  await page.goto(`/app/dogs?q=${encodeURIComponent("Vikram")}`);
  await expect(page.getByRole("link", { name: "Rocky", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Luna", exact: true })).toBeVisible();
});

test("a pet's details change, and an incident shows on Today until it is dealt with", async ({ page }) => {
  await signIn(page, "staff");
  await openPet(page, "Bruno");
  // A weight is written down on its own, and the pet shows the latest (M25).
  await page.getByLabel(en.weights.weightKg, { exact: true }).fill("37.5");
  await page.getByRole("button", { name: en.weights.save }).click();
  await expect(page.getByText(en.weights.saved)).toBeVisible();
  await expect(page.getByText(/^37\.5 kg on /)).toBeVisible();

  await page.getByRole("link", { name: "Write down an incident" }).click();
  await page.locator("select[name=category]").selectOption("injury");
  await page.locator("select[name=severity]").selectOption("high");
  await page.getByLabel("Describe it").fill("Cut on the left front paw after play.");
  await page.getByRole("button", { name: "Save incident" }).click();
  await expect(page.getByText("Incident written down.")).toBeVisible();

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Incidents to deal with/ })).toBeVisible();
  await page.getByRole("link", { name: /Bruno.*High/ }).click();
  await page.getByRole("button", { name: "Parent has been told" }).click();
  await expect(page.getByText("Marked as told.")).toBeVisible();
  await page.getByRole("button", { name: "Dealt with" }).click();
  await expect(page.getByText("Marked as dealt with.")).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: /Incidents to deal with/ })).toHaveCount(0);
  // Staff are not offered a correction; a manager is.
  await openPet(page, "Bruno");
  await expect(page.getByRole("link", { name: "Correct it" })).toHaveCount(0);

  await signIn(page, "manager");
  await openPet(page, "Bruno");
  await page.getByRole("link", { name: "Correct it" }).first().click();
  await expect(page.getByLabel("Describe it")).toHaveValue("Cut on the left front paw after play.");
  await page.getByLabel("Describe it").fill("Small cut on the left front paw after play. Cleaned and dressed.");
  await page.locator("select[name=severity]").selectOption("medium");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/^Incident corrected\./)).toBeVisible();
  await expect(page.getByText("Small cut on the left front paw after play. Cleaned and dressed.")).toBeVisible();
});

test("a parent's details change, and a second record of the same parent is merged in", async ({ page }) => {
  await signIn(page, "manager");
  // A walk-in entered under a second number by mistake.
  await page.goto("/app/dogs/new");
  await page.getByLabel("Mobile number").fill("9800000188");
  await page.getByLabel("Name").first().fill("Priya D");
  await page.locator("input[name=petName]").fill("Toffee");
  await page.getByRole("button", { name: "Save pet" }).click();
  await page.waitForURL(/\/app\/dogs$/);

  await openPet(page, "Biscuit");
  await page.getByRole("link", { name: "Priya Demo" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Priya Demo" })).toBeVisible();
  await page.getByLabel("City").fill("Mysuru");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await page.getByLabel("The other record's phone number").fill("98000 00188");
  await page.getByRole("button", { name: "Find" }).click();
  await page.getByRole("button", { name: "Merge into Priya Demo" }).click();
  await expect(page.getByText("Merged.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Toffee/ })).toBeVisible();
  await expect(page.getByText(/also 98000 00188/)).toBeVisible();
});

test("a manager hides a pet from lists and shows it again, but not one with a stay to come", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/dogs/new");
  await page.getByLabel("Mobile number").fill("9800000199");
  await page.getByLabel("Name").first().fill("Meera Sample");
  await page.locator("input[name=petName]").fill("Pebble");
  await page.getByRole("button", { name: "Save pet" }).click();
  await page.waitForURL(/\/app\/dogs$/);

  await openPet(page, "Pebble");
  await page.getByRole("button", { name: "Hide this pet" }).click();
  await expect(page.getByText("Hidden from lists.")).toBeVisible();
  await expect(page.getByText("This pet is hidden from lists and search.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a stay" })).toHaveCount(0);
  await page.goto(`/app/dogs?q=Pebble`);
  await expect(page.getByText('Nothing found for "Pebble".')).toBeVisible();

  await page.goto("/app/dogs");
  await page.getByRole("link", { name: "Hidden pets" }).click();
  await page.getByRole("link", { name: "Pebble", exact: true }).click();
  await page.getByRole("button", { name: "Show in lists again" }).click();
  await expect(page.getByText("Back in lists.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Book a stay" })).toBeVisible();

  // Rocky has a stay in the festival week.
  await openPet(page, "Rocky");
  await page.getByRole("button", { name: "Hide this pet" }).click();
  await expect(page.getByText("This pet has a stay in the kennel now or still to come. Check it out or cancel it first.")).toBeVisible();
});

test("someone with no account joins with an invite link, and is suspended and restored", async ({ page, browser }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/people");
  await page.getByRole("textbox", { name: "Their name" }).first().fill("Kiran");
  await page.getByRole("button", { name: "Make a link" }).click();
  await expect(page.getByText("Link made.")).toBeVisible();
  const href = (await page.getByRole("link", { name: "Send on WhatsApp" }).first().getAttribute("href"))!;
  const joinPath = /\/join\/[0-9a-f]{64}/.exec(decodeURIComponent(href))![0];

  const kiran = await privateWindow(browser);
  await kiran.page.goto(joinPath);
  await kiran.page.getByRole("link", { name: "Create an account" }).click();
  await kiran.page.getByLabel("Email").fill(`kiran-${Date.now()}@example.test`);
  await kiran.page.getByLabel("Password").fill(PASSWORD);
  await kiran.page.getByRole("button", { name: "Create account" }).click();
  await kiran.page.getByRole("button", { name: /Join Wagbook Demo Kennel/ }).click();
  await kiran.page.waitForURL(/\/app$/);
  await expect(kiran.page.getByText(/in house of 12 kennels/)).toBeVisible();

  // The same link does not work twice.
  await page.reload();
  await expect(page.getByRole("link", { name: "Send on WhatsApp" })).toHaveCount(0);

  const row = page.getByRole("listitem").filter({ hasText: "Kiran" });
  await row.getByText("Change").click();
  await row.getByRole("button", { name: "Suspend" }).click();
  await expect(page.getByText(/^Suspended\./)).toBeVisible();
  await kiran.page.goto("/app");
  await kiran.page.waitForURL(/\/onboarding/);

  // The Change panel stays open after the last change; open it only if it closed.
  const restore = page.getByRole("listitem").filter({ hasText: "Kiran" }).getByRole("button", { name: "Restore" });
  if (!(await restore.isVisible())) await page.getByRole("listitem").filter({ hasText: "Kiran" }).getByText("Change").click();
  await restore.click();
  await expect(page.getByText("They can use Wagbook here again.")).toBeVisible();
  await kiran.page.goto("/app");
  await expect(kiran.page.getByText(/in house of 12 kennels/)).toBeVisible();
  await kiran.context.close();
});

test("a manager writes down an expense with its receipt; staff see no money reports", async ({ page, browser }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/expenses");
  await page.getByLabel("Amount").fill("1250.50");
  await page.getByLabel("What for").fill("Vet and medicines");
  await page.getByLabel("Shop or person").fill("Demo Vet Clinic");
  const receipt = await photoWithLocation(page);
  await page.locator("input[name=receipt]").setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: receipt });
  await expect(page.locator("img[src^='blob:']").first()).toBeVisible();
  await page.getByRole("button", { name: "Add expense" }).click();
  await expect(page.getByText("Expense written down.")).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: "Demo Vet Clinic" });
  await expect(row).toContainText("₹1,250.50");
  const receiptUrl = (await row.getByRole("link", { name: "See receipt" }).getAttribute("href"))!;
  expect((await page.request.get(receiptUrl)).status()).toBe(200);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  // Deleting is for owners: a manager is not offered it.
  await expect(row.getByText("Remove")).toHaveCount(0);

  // The owner deletes an expense written by mistake, in two steps, and its receipt goes with it.
  const owner = await privateWindow(browser);
  await signIn(owner.page, "owner");
  await owner.page.goto("/app/more/expenses");
  await owner.page.getByLabel("Amount").fill("99");
  await owner.page.getByLabel("What for").fill("Typed by mistake");
  await owner.page.locator("input[name=receipt]").setInputFiles({ name: "receipt.jpg", mimeType: "image/jpeg", buffer: receipt });
  await owner.page.getByRole("button", { name: "Add expense" }).click();
  await expect(owner.page.getByText("Expense written down.")).toBeVisible();
  const wrong = owner.page.getByRole("listitem").filter({ hasText: "Typed by mistake" });
  const wrongReceipt = (await wrong.getByRole("link", { name: "See receipt" }).getAttribute("href"))!;
  await wrong.getByText("Remove").click();
  await expect(wrong.getByText("This cannot be undone. The receipt is deleted too.")).toBeVisible();
  await wrong.getByRole("button", { name: "Yes, delete it" }).click();
  await expect(owner.page.getByRole("listitem").filter({ hasText: "Typed by mistake" })).toHaveCount(0);
  expect((await owner.page.request.get(wrongReceipt)).status()).not.toBe(200);
  await owner.context.close();

  const staff = await privateWindow(browser);
  await signIn(staff.page, "staff");
  // More does not offer them to staff, and opening one by its address says why.
  await staff.page.goto("/app/more");
  await expect(staff.page.getByRole("link", { name: /^Bills/ })).toBeVisible();
  for (const title of ["Reports", "Expenses", "History of changes"]) await expect(staff.page.getByRole("link", { name: new RegExp(`^${title}`) })).toHaveCount(0);
  for (const path of ["/app/more/reports", "/app/more/expenses", "/app/more/history"]) {
    await staff.page.goto(path);
    await expect(staff.page.getByText(/for owners and managers\.$/)).toBeVisible();
  }
  const csv = await staff.page.request.get(`/app/more/reports/download?what=expenses&from=${day(-30)}&to=${day(0)}`);
  expect(csv.status()).toBe(403);
  await staff.context.close();
});

test("reports add up the month, and downloads open in a spreadsheet", async ({ page }) => {
  await signIn(page, "owner");
  // The month Biscuit's stay (with grooming) began.
  await page.goto(`/app/more/reports?month=${day(-2).slice(0, 7)}`);
  await expect(page.getByText("Nights sold")).toBeVisible();
  await expect(page.getByText(/Pets in each day\. The top line is all 12 kennels full\./)).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Money in / })).toBeVisible();
  await expect(page.getByText("Grooming")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByText("See each day").click();
  await expect(page.getByRole("columnheader", { name: "Overnight" })).toBeVisible();

  const get = (what: string) => page.request.get(`/app/more/reports/download?what=${what}&from=${day(-40)}&to=${day(30)}`);
  const expenses = await get("expenses");
  expect(expenses.headers()["content-type"]).toContain("text/csv");
  expect(expenses.headers()["content-disposition"]).toContain("attachment");
  const text = await expenses.text();
  expect(text.startsWith("﻿Date,What for,")).toBe(true);
  expect(text).toContain("Vet and medicines,Demo Vet Clinic,,1250.50");
  expect(await (await get("bills")).text()).toMatch(/WB\/\d{2}-\d{2}\/\d{4}/);
  expect(await (await get("bookings")).text()).toContain("Biscuit");
  expect((await (await get("payments")).text()).split("\r\n").length).toBeGreaterThan(3);
  expect((await page.request.get(`/app/more/reports/download?what=bills&from=${day(0)}&to=${day(-1)}`)).status()).toBe(400);
});

test("the history of changes says who changed a price", async ({ page }) => {
  await signIn(page, "owner");
  await page.goto("/app/more/history");
  await page.getByLabel("What").selectOption({ label: "Booking" });
  await page.getByLabel("Who").selectOption({ label: "Ravi" });
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page.getByText(/^Ravi, /).first()).toBeVisible();
  await expect(page.getByText(/^Price per night or day: was ₹1,200, now/).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("a care task ticked with no connection is kept on the phone and sent when it is back", async ({ page, context }) => {
  await signIn(page, "staff");
  await page.goto("/app/care");
  const done = page.getByRole("button", { name: en.care.markDone, exact: true }).first();
  await expect(done).toBeVisible();
  await context.setOffline(true);
  await done.click();
  await expect(page.getByText(en.offline.doneNotSent).first()).toBeVisible();
  await expect(page.getByText(en.offline.youAreOffline)).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Sent 1 tick made offline.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(en.offline.doneNotSent)).toHaveCount(0);
});

test("the owner sends tomorrow's summary to themselves on WhatsApp", async ({ page }) => {
  await signIn(page, "owner");
  const link = page.getByRole("link", { name: en.summary.button });
  const href = decodeURIComponent((await link.getAttribute("href"))!);
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=Wagbook Demo Kennel, /);
  expect(href).toMatch(/Arriving \(\d+\):|Nobody arriving\./);
});

test("a person reads Wagbook in Hindi, and parents read the kennel's pages in Kannada", async ({ page, browser }) => {
  await signIn(page, "manager");
  await page.goto("/app/more");
  await page.locator("select[name=language]").selectOption("hi");
  await page.locator("select[name=language]").locator("xpath=ancestor::form").getByRole("button").click();
  await expect(page.getByText(hi.language.saved)).toBeVisible();
  await expect(page.getByRole("navigation", { name: hi.nav.label }).getByRole("link", { name: hi.nav.today })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("hi");
  await page.goto("/app");
  await expect(page.getByRole("link", { name: hi.today.newBooking })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Parents' pages in Kannada.
  await page.goto("/app/more/settings");
  await page.locator("select[name=parent_language]").selectOption("kn");
  await page.getByRole("button", { name: hi.settings.save }).click();
  await expect(page.getByText(hi.settings.saved)).toBeVisible();
  await openBooking(page, "Biscuit", hi.labels.bookingStatus.checked_in);
  const link = await page.getByText(/\/s\/[0-9a-f]{64}/).first().innerText();
  const parent = await privateWindow(browser);
  await parent.page.goto(link.trim());
  await expect(parent.page.getByText(kn.stayPage.status.checked_in)).toBeVisible();
  expect(await parent.page.evaluate(() => document.documentElement.lang)).toBe("kn");
  await parent.context.close();

  // Back to English for whoever runs next.
  await page.goto("/app/more/settings");
  await page.locator("select[name=parent_language]").selectOption("en");
  await page.getByRole("button", { name: hi.settings.save }).click();
  await expect(page.getByText(hi.settings.saved)).toBeVisible();
  await page.goto("/app/more");
  await page.locator("select[name=language]").selectOption("en");
  await page.locator("select[name=language]").locator("xpath=ancestor::form").getByRole("button").click();
  await expect(page.getByText(en.language.saved)).toBeVisible();
});

/**
 * No connection at all. setOffline alone does not reliably reach the service
 * worker's own requests in Chromium, so every request to the site fails too.
 */
async function goOffline(context: import("@playwright/test").BrowserContext, base: string, on: boolean) {
  await context.setOffline(on);
  if (on) await context.route(`${base}/**`, (route) => route.abort("internetdisconnected"));
  else await context.unrouteAll();
}

test("with no connection, Today and Care open from the phone's copy, and other pages say the phone is offline", async ({ page, context, baseURL }) => {
  const base = baseURL!.replace(/\/$/, "");
  await signIn(page, "staff");
  // The service worker takes over from the next page load (production builds only).
  await page.waitForFunction(async () => Boolean(await navigator.serviceWorker.ready));
  await page.reload();
  await page.goto("/app/care");
  await expect(page.getByRole("heading", { level: 1, name: en.care.title })).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("link", { name: en.today.newBooking })).toBeVisible();

  await goOffline(context, base, true);
  await page.goto("/app/care");
  await expect(page.getByRole("heading", { level: 1, name: en.care.title })).toBeVisible();
  await expect(page.getByText(en.offline.youAreOffline)).toBeVisible();
  await page.goto("/app/dogs");
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  await goOffline(context, base, false);

  // Opening the sign-in page forgets the copies.
  await page.goto("/login");
  await expect(page.locator("input[name=email]")).toBeVisible();
  await page.waitForTimeout(500);
  await goOffline(context, base, true);
  await page.goto("/app/care");
  await expect(page.getByRole("heading", { name: "You are offline" })).toBeVisible();
  await goOffline(context, base, false);
});

// ---------------------------------------------------------------------------
// Roadmap M9: hardening and privacy tools.
// ---------------------------------------------------------------------------

test("pages run only their own scripts: an injected script is refused", async ({ page }) => {
  const res = await page.goto("/login");
  const policy = res!.headers()["content-security-policy"];
  expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'sha256-/);
  expect((await page.request.get("/login")).headers()["content-security-policy"]).not.toBe(policy);

  const refused: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) refused.push(m.text());
  });
  await signIn(page, "owner");
  for (const path of ["/app", "/app/care", "/app/bookings", "/app/more"]) await page.goto(path);
  // The app's own scripts all ran: nothing was refused, and the page is interactive.
  expect(refused).toEqual([]);
  await page.getByRole("link", { name: "More", exact: true }).first().click();

  const injected = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        document.addEventListener("securitypolicyviolation", () => resolve("refused"));
        const s = document.createElement("script");
        s.textContent = "window.__wagbookInjected = true";
        document.body.append(s);
        setTimeout(() => resolve((window as unknown as { __wagbookInjected?: boolean }).__wagbookInjected ? "ran" : "refused"), 1000);
      }),
  );
  expect(injected).toBe("refused");
});

test("too many sign-in tries from one address are slowed down", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-real-ip": "203.0.113.77" });
  await page.goto("/login");
  const password = page.getByLabel("Password");
  // One try, counted only once its post has been answered. On a slow machine the
  // first click can come before the page's scripts, and the form then posts and
  // reloads the old way, so each try also takes the 8 character minimum off again:
  // a short password is refused by the app before Supabase is asked, so only the
  // app's limit is in play.
  async function tryShortPassword() {
    await password.evaluate((el) => el.removeAttribute("minlength"));
    await page.getByLabel("Email").fill("someone@example.test");
    await password.fill("short");
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login"),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
  }
  for (let i = 0; i < 20; i++) {
    await tryShortPassword();
    await expect(page.getByText(en.auth.errors.passwordShort)).toBeVisible();
  }
  await tryShortPassword();
  await expect(page.getByText(en.errors.slowDown)).toBeVisible();
});

/** The current code of an authenticator app for a base32 secret (RFC 6238: 30 seconds, 6 digits, SHA-1). */
async function totp(secret: string, at = Date.now()): Promise<string> {
  const { createHmac } = await import("node:crypto");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** A code that has not been used yet: waits for the next 30 seconds if need be. */
async function freshCode(secret: string, used: Set<string>): Promise<string> {
  for (;;) {
    const code = await totp(secret);
    if (!used.has(code)) {
      used.add(code);
      return code;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

test("an owner turns on two-step sign-in, and then a password alone is not enough", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `twostep-${Date.now()}@example.test`;
  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Kennel name").fill("Two Step Kennel");
  await page.getByLabel("Link name").fill(`two-step-${Date.now() % 100000}`);
  await page.getByLabel("Your name").fill("Tara");
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL(/\/app\/more\/kennels/);

  await page.goto("/app/more");
  await expect(page.getByText(en.more.ownerNudge)).toBeVisible();
  await page.getByRole("link", { name: new RegExp(en.more.twoStepLink) }).click();
  await page.getByRole("button", { name: en.twoStep.start }).click();
  await expect(page.getByRole("img", { name: en.twoStep.qrAlt })).toBeVisible();
  const secret = (await page.locator("p.font-mono").innerText()).trim();
  const used = new Set<string>();
  await page.getByLabel(en.twoStep.code).fill("000000" === (await totp(secret)) ? "111111" : "000000");
  await page.getByRole("button", { name: en.twoStep.confirm, exact: true }).click();
  await expect(page.getByText(en.twoStep.wrong)).toBeVisible();
  await page.getByLabel(en.twoStep.code).fill(await freshCode(secret, used));
  await page.getByRole("button", { name: en.twoStep.confirm, exact: true }).click();
  // The session cookie changes, so the page draws itself again in its "on" state.
  await expect(page.getByText(en.twoStep.isOn)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // Signing in again: the password leads to the code, and nothing else opens.
  await page.goto("/app/more");
  await page.getByRole("button", { name: en.more.signOut }).click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/login\/code/);
  await page.goto("/app");
  await page.waitForURL(/\/login\/code/);

  // Someone with the password who skips the app and calls Supabase directly
  // gets nothing either, and cannot add an authenticator of their own.
  const { createClient } = await import("@supabase/supabase-js");
  const thief = createClient(process.env.E2E_SUPABASE_URL ?? "http://127.0.0.1:54321", process.env.E2E_SUPABASE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await thief.auth.signInWithPassword({ email, password: PASSWORD })).error).toBeNull();
  expect((await thief.from("organizations").select("id")).data).toEqual([]);
  expect((await thief.from("memberships").select("org_id")).data).toEqual([]);
  expect((await thief.auth.mfa.enroll({ factorType: "totp", friendlyName: "Thief" })).error).not.toBeNull();
  await page.getByLabel(en.auth.code.label).fill(await freshCode(secret, used));
  await page.getByRole("button", { name: en.auth.code.continue }).click();
  await page.waitForURL(/\/app/);
  await page.goto("/app/more");
  await expect(page.getByRole("link", { name: `${en.more.twoStepLink}: ${en.more.twoStepOn}` })).toBeVisible();
  await expect(page.getByText(en.more.ownerNudge)).toHaveCount(0);

  // And off again.
  await page.goto("/app/more/two-step");
  await page.getByRole("button", { name: en.twoStep.turnOff }).click();
  await expect(page.getByText(en.twoStep.turnedOff)).toBeVisible();
});

test("a parent sends a certificate with the form, then asks for their details and to be erased", async ({ page, browser }) => {
  const phone = "9800000377";
  const parent = await privateWindow(browser);
  await parent.page.goto("/i/demo");
  await parent.page.getByLabel("Your name").fill("Rhea Invented");
  await parent.page.getByLabel("Mobile number").fill(phone);
  await parent.page.getByLabel("Name", { exact: true }).fill("Mochi");
  await parent.page.getByLabel(en.intakeForm.vaccine).fill("Rabies");
  await parent.page.locator("input[name='pets.0.certificate']").setInputFiles({
    name: "card.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%Wagbook test card\n%%EOF\n"),
  });
  // A second vaccine with its own card.
  await parent.page.getByText(en.intakeForm.anotherVaccine).click();
  await parent.page.locator("input[name='pets.0.vaccine2']").fill("DHPPi");
  await parent.page.locator("input[name='pets.0.certificate2']").setInputFiles({
    name: "card2.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%Wagbook second card\n%%EOF\n"),
  });
  await parent.page.getByRole("checkbox").check();
  await parent.page.getByRole("button", { name: /Send to/ }).click();
  await expect(parent.page.getByText(/Thank you/).first()).toBeVisible();
  await expect(parent.page.getByText(/could not be sent/)).toHaveCount(0);
  await parent.context.close();

  await signIn(page, "owner");
  await page.goto("/app/more/intake");
  const card = page.getByRole("link", { name: "See the certificate for Mochi" }).first();
  await expect(card).toBeVisible();
  await expect(page.getByRole("link", { name: "See the certificate for Mochi" })).toHaveCount(2);
  const cardUrl = (await card.getAttribute("href"))!;
  expect((await (await page.request.get(cardUrl)).body()).toString()).toContain("Wagbook test card");
  await page.getByRole("listitem").filter({ hasText: "Rhea Invented" }).getByRole("button", { name: "Accept and book" }).click();
  await page.waitForURL(/\/app\/bookings\/new/);

  // Each certificate is now on its vaccination.
  await openPet(page, "Mochi");
  await expect(page.getByRole("link", { name: "Certificate" })).toHaveCount(2);

  // The parent asks what the kennel holds about them.
  await page.goto(`/app/dogs?q=${phone}`);
  await page.getByRole("link", { name: /Rhea Invented/ }).first().click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: en.parent.privacy.download }).click()]);
  const exported = JSON.parse((await (await download.createReadStream()).toArray()).join(""));
  expect(exported.parent.full_name).toBe("Rhea Invented");
  expect(exported.pets[0].name).toBe("Mochi");
  expect(exported.forms).toHaveLength(1);
  expect(exported.files.some((f: string) => f.endsWith("/pet-1"))).toBe(true);

  // And then to be erased.
  await page.getByRole("button", { name: en.parent.privacy.eraseButton }).click();
  await expect(page.getByText(en.parent.privacy.confirmFirst)).toBeVisible();
  await page.getByLabel(en.parent.privacy.eraseConfirm).check();
  await page.getByRole("button", { name: en.parent.privacy.eraseButton }).click();
  await page.waitForURL(/\/app\/dogs\?done=erased$/);
  await expect(page.getByText(en.parent.privacy.erased)).toBeVisible();
  await page.goto(`/app/dogs?q=${phone}`);
  await expect(page.getByRole("link", { name: /Rhea Invented|Mochi/ })).toHaveCount(0);
  // The certificate file is gone from storage too.
  expect((await page.request.get(cardUrl)).ok()).toBe(false);
});

test("a manager adds a kennel with its own name, renames it and moves it to the top of the list", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/kennels");
  await page.locator("input[name=name]").first().fill("Garden suite");
  await page.getByRole("button", { name: "Add kennel", exact: true }).click();
  await expect(page.getByText("Added Garden suite.")).toBeVisible();

  // Each row's Change says which kennel it is for, to a screen reader.
  const row = page.locator("details").filter({ has: page.locator("summary", { hasText: "Change Garden suite" }) });
  await row.locator("summary").click();
  await row.locator("input[name=name]").fill("Garden suite 1");
  await row.locator("input[name=position]").fill("0");
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved Garden suite 1.")).toBeVisible();
  await page.reload();
  // First in the list now, before K01.
  const names = await page.locator(".door-tag").allTextContents();
  expect(names[0]).toContain("Garden suite 1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  // A name already in use is refused with a sentence.
  await page.locator("input[name=name]").first().fill("K01");
  await page.getByRole("button", { name: "Add kennel", exact: true }).click();
  await expect(page.getByText("A kennel with that name already exists.")).toBeVisible();
});

test("a sibling leaves early, and the pet left on its own pays the usual price for those nights", async ({ page }) => {
  await signIn(page, "manager");
  // Rocky and Luna share K09 for three nights (booked above); Rocky goes home a night early.
  await page.goto(`/app/calendar?from=${day(50)}`);
  // Followed by its address: on a phone the sticky kennel column and the bottom bar can sit over the square.
  const rocky = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "K09" }) }).getByRole("link", { name: "Rocky" }).first();
  await page.goto((await rocky.getAttribute("href"))!);
  await expect(page.getByRole("heading", { level: 1, name: "Rocky" })).toBeVisible();
  await page.getByLabel("Check-out date").fill(day(52));
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Booking saved.")).toBeVisible();

  await page.getByRole("link", { name: /Luna/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Luna" })).toBeVisible();
  await expect(page.getByText("Boarding, sharing a kennel, 2 x ₹900")).toBeVisible();
  await expect(page.getByText("Boarding, kennel to itself, 1 x ₹1,200")).toBeVisible();
  await expect(page.getByLabel(en.booking.change.aloneRate)).toHaveValue("1200");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("day boarding turns into boarding, and is priced as days and then nights", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Tofu, Shih Tzu (Neha Placeholder)" });
  await page.locator("select[name=kind]").selectOption("daycare");
  await page.getByLabel("Check-in date").fill(day(70));
  await page.getByLabel("Check-out date").fill(day(70));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();

  // The parent asks for Tofu to stay the night of the 71st and the 72nd.
  const overnight = page.locator("form").filter({ has: page.getByRole("button", { name: en.booking.overnight.save }) });
  await overnight.getByLabel(en.booking.overnight.firstNight).fill(day(71));
  await overnight.getByLabel(en.booking.overnight.checkOut).fill(day(73));
  await overnight.getByLabel(en.booking.overnight.pricePerNight).fill("1200");
  await overnight.getByRole("button", { name: en.booking.overnight.save }).click();
  await page.waitForURL(/done=boarding/);
  await expect(page.getByText(en.booking.done.boarding)).toBeVisible();
  await expect(page.getByText(/^Day boarding until .*, then staying nights from /)).toBeVisible();
  await expect(page.getByText("Day boarding, 1 x ₹720")).toBeVisible();
  await expect(page.getByText("Boarding, 2 x ₹1,200")).toBeVisible();
  await expect(page.getByRole("heading", { name: en.booking.overnight.title })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("staff cannot change a parent's phone numbers, and a parent who asks gets their bill's headings in Hindi too", async ({ page, browser }) => {
  await signIn(page, "staff");
  await openPet(page, "Biscuit");
  await page.getByRole("link", { name: "Priya Demo" }).click();
  await expect(page.getByText(en.parent.phoneByManager)).toBeVisible();
  await expect(page.locator("input[name=phone]")).toHaveCount(0);
  await page.getByLabel("City").fill("Mysuru");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  await signIn(page, "manager");
  await openPet(page, "Mango");
  await page.getByRole("link", { name: "Arjun Sample" }).click();
  await page.locator("select[name=bill_translation]").selectOption("hi");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // Mango's bill, issued earlier in the walk, from the parent's page.
  await page.getByRole("link", { name: /WB\// }).first().click();
  const link = (await page.getByRole("link", { name: "Open it" }).getAttribute("href"))!;
  const parent = await privateWindow(browser);
  await parent.page.goto(link);
  await expect(parent.page.getByRole("heading", { name: `Bill (${hi.invoice.bill})`, exact: true })).toBeVisible();
  await expect(parent.page.getByRole("heading", { name: `Billed to (${hi.invoice.billedTo})` })).toBeVisible();
  expect(await parent.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await parent.context.close();
});

test("a manager takes back part of a paid bill with a credit note, and the parent sees it", async ({ page, browser }) => {
  await signIn(page, "manager");
  await openPet(page, "Mango");
  await page.getByRole("link", { name: "Arjun Sample" }).click();
  await page.getByRole("link", { name: /WB\// }).first().click();

  const form = page.locator("form").filter({ has: page.getByRole("button", { name: en.bill.credit.make }) });
  await form.getByLabel(en.bill.credit.amount, { exact: true }).fill("200");
  await form.getByLabel(en.bill.credit.why).fill("Picked up a morning early");
  await form.getByRole("button", { name: en.bill.credit.make }).click();
  await page.waitForURL(/done=credited/);
  await expect(page.getByText(en.bill.done.credited)).toBeVisible();
  await expect(page.getByRole("link", { name: /^CN\/\d{2}-\d{2}\/0001, / })).toBeVisible();
  // It was paid in full, so ₹200 is now owed back to the parent.
  await expect(page.getByText("₹200 paid over")).toBeVisible();
  // A credited bill is credited the rest of the way, never cancelled.
  await expect(page.getByText(en.bill.cancelCredited)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  const link = (await page.getByRole("link", { name: "Open it" }).getAttribute("href"))!;
  const parent = await privateWindow(browser);
  await parent.page.goto(link);
  await parent.page.getByRole("link", { name: /^Credit note CN\// }).click();
  await expect(parent.page.getByRole("heading", { level: 1, name: /^Credit note/ })).toBeVisible();
  await expect(parent.page.getByText("Why: Picked up a morning early")).toBeVisible();
  expect(await parent.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await parent.context.close();
});

test("Today lists the reminders to send, and one sent leaves the list", async ({ page, context }) => {
  await signIn(page, "staff");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Tofu, Shih Tzu (Neha Placeholder)" });
  await page.locator("select[name=kind]").selectOption("daycare");
  await page.getByLabel("Check-in date").fill(day(1));
  await page.getByLabel("Check-out date").fill(day(1));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();

  await page.goto("/app");
  const toSend = page.locator("section").filter({ has: page.getByRole("heading", { name: new RegExp(`^${en.today.toSend}`) }) });
  const arrival = toSend.getByRole("listitem").filter({ hasText: en.today.reminderKinds.arrival }).filter({ hasText: "Tofu" });
  await expect(arrival).toBeVisible();
  const link = arrival.getByRole("link", { name: /Neha Placeholder/ });
  expect(decodeURIComponent((await link.getAttribute("href"))!)).toContain("see you and Tofu tomorrow");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  // Send opens WhatsApp in a new tab and marks it sent.
  const [whatsapp] = await Promise.all([context.waitForEvent("page"), link.click()]);
  await whatsapp.close();
  await expect(arrival).toHaveCount(0);
});

test("a parent asks for a stay through their own link, and it waits as a request", async ({ page, browser }) => {
  await signIn(page, "manager");
  await openPet(page, "Rocky");
  await page.getByRole("link", { name: "Vikram Mock" }).click();
  const send = page.getByRole("link", { name: en.parent.requestLink.send });
  const text = decodeURIComponent((await send.getAttribute("href"))!);
  const url = /https?:\/\/\S+\/b\/[0-9a-f]{64}/.exec(text)![0];

  const parent = await privateWindow(browser);
  await parent.page.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(parent.page.getByText(/Hello Vikram/)).toBeVisible();
  await parent.page.getByRole("checkbox", { name: "Luna" }).check();
  await parent.page.getByLabel(en.requestForm.checkIn).fill(day(120));
  await parent.page.getByLabel(en.requestForm.checkOut).fill(day(123));
  await parent.page.getByLabel(en.requestForm.note).fill("Luna is nervous of thunder");
  await parent.page.getByRole("button", { name: en.requestForm.send }).click();
  await expect(parent.page.getByText(en.requestForm.sent)).toBeVisible();
  await parent.page.reload();
  await expect(parent.page.getByText(en.requestForm.status.requested, { exact: true })).toBeVisible();
  expect(await parent.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await parent.context.close();

  await page.goto("/app");
  await expect(page.getByText("One request from a parent is waiting.")).toBeVisible();
  // A new link, and the old one stops working.
  await openPet(page, "Rocky");
  await page.getByRole("link", { name: "Vikram Mock" }).click();
  await page.getByRole("button", { name: en.parent.requestLink.renew }).click();
  await expect(page.getByText(en.parent.requestLink.renewed)).toBeVisible();
  // The page streams, so the old link answers with the not-found page rather than a 404 status.
  const old = await privateWindow(browser);
  await old.page.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await expect(old.page.getByRole("button", { name: en.requestForm.send })).toHaveCount(0);
  await expect(old.page.getByText(/Hello Vikram/)).toHaveCount(0);
  await old.context.close();
});

test("a regular buys a pack of days, and repeating day boarding is paid from it", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/extras");
  const packForm = page.locator("form").filter({ has: page.getByRole("button", { name: en.extras.addPack }) });
  await packForm.getByLabel(en.extras.packName, { exact: true }).fill("10 days");
  await packForm.getByLabel(en.extras.packDays, { exact: true }).fill("10");
  await packForm.getByLabel(en.extras.packPrice, { exact: true }).fill("6000");
  await packForm.getByLabel(en.extras.packValid).fill("60");
  await packForm.getByRole("button", { name: en.extras.addPack }).click();
  await expect(page.getByText("Added 10 days.")).toBeVisible();

  await openPet(page, "Tofu");
  await page.getByRole("link", { name: "Neha Placeholder" }).click();
  await page.getByLabel(en.parent.packs.startsOn).fill(day(90));
  await page.getByRole("button", { name: en.parent.packs.sell }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft bill" })).toBeVisible();
  await expect(page.getByText(/10 days: 10 days of day boarding/)).toBeVisible();
  await page.getByRole("button", { name: "Issue bill" }).click();
  await expect(page.getByText(/^Issued\./)).toBeVisible();

  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Tofu, Shih Tzu (Neha Placeholder)" });
  await page.locator("select[name=kind]").selectOption("daycare");
  await page.getByLabel("Check-in date").fill(day(91));
  await page.getByText(en.newBooking.repeat, { exact: true }).click();
  for (const box of await page.locator("input[name=repeat_day]").all()) await box.check();
  await page.locator("input[name=repeat_until]").fill(day(97));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  await expect(page.getByText("Repeats: 7 days in all, 7 still to come.")).toBeVisible();
  await expect(page.getByText("Paid from the pack 10 days.")).toBeVisible();
  await expect(page.getByText("Day boarding, from a pack, 1 x ₹0")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await openPet(page, "Tofu");
  await page.getByRole("link", { name: "Neha Placeholder" }).click();
  await expect(page.getByText(/10 days: 3 of 10 days left/)).toBeVisible();
});

/** Add a pet and its parent, as a manager does on Pets. */
async function addPet(page: Page, phone: string, parent: string, pet: string) {
  await page.goto("/app/dogs/new");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByLabel("Name").first().fill(parent);
  await page.locator("input[name=petName]").fill(pet);
  await page.getByRole("button", { name: "Save pet" }).click();
  await page.waitForURL(/\/app\/dogs$/);
}

/** The month a kennel date is in, as the app writes it in English: "October 2027". */
const monthName = (date: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));

// Juno's stay, used again by the photo test below.
let junoBooking = "";

test("a pet goes home early: billed to today, the paid bill credited for the nights not stayed, and the difference refunded", async ({ page }) => {
  await signIn(page, "manager");
  await addPet(page, "9800000411", "Ravi Sample", "Juno");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Juno (Ravi Sample)" });
  await page.getByLabel("Check-in date").fill(day(0));
  await page.getByLabel("Check-out date").fill(day(3));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  junoBooking = new URL(page.url()).pathname;

  // Paid in advance, in full: three nights at ₹1,200.
  await page.getByRole("button", { name: "Make bill" }).click();
  await page.getByRole("button", { name: "Issue bill" }).click();
  await expect(page.getByText(/^Issued\./)).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded.")).toBeVisible();

  await page.goto(junoBooking);
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();
  // On Today, going home early opens the booking, which asks how to bill it.
  await page.goto("/app");
  await page.getByRole("listitem").filter({ hasText: "Juno" }).getByRole("link", { name: en.today.checkOutEarly }).click();
  await expect(page.getByText(/Going home early\?/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("button", { name: en.booking.step.checkOutToToday }).click();
  await expect(page.getByText(en.booking.done.checked_out_early)).toBeVisible();
  // Gone home on the day it came: a boarding stay is at least its first night.
  await expect(page.getByText("Boarding, 1 x ₹1,200")).toBeVisible();

  await page.locator("a[href^='/app/bills/']").first().click();
  await expect(page.getByRole("heading", { name: en.bill.difference.title })).toBeVisible();
  await expect(page.getByText(/now come to ₹1,200\. The bill is ₹2,400 more than that/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("button", { name: "Credit ₹2,400" }).click();
  await page.waitForURL(/done=credited/);
  await expect(page.getByRole("heading", { name: en.bill.difference.title })).toHaveCount(0);
  await expect(page.getByText("₹2,400 was paid more than the bill now comes to.", { exact: false })).toBeVisible();

  // A refund of more than was paid over is refused by the database.
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: en.payments.recordRefund }) });
  await form.getByLabel(en.payments.amount).fill("2500");
  await form.getByRole("button", { name: en.payments.recordRefund }).click();
  await expect(page.getByText(/refund can only give back what was paid over/i)).toBeVisible();
  await form.getByLabel(en.payments.amount).fill("2400");
  await form.getByRole("button", { name: en.payments.recordRefund }).click();
  await expect(page.getByText(en.payments.refundRecorded)).toBeVisible();
  await page.reload();
  await expect(page.getByText(en.bill.nothingDue)).toBeVisible();
});

test("an owner takes a photo posted by mistake off an update, and the parent no longer sees it", async ({ page, browser }) => {
  await signIn(page, "staff");
  await page.goto(`${junoBooking}/update`);
  await page.getByLabel("How is the pet doing?").fill("Juno is settling in.");
  await page.locator("input[name=photos]").setInputFiles({ name: "wrong.jpg", mimeType: "image/jpeg", buffer: await photoWithLocation(page) });
  await expect(page.locator("img[src^='blob:']").first()).toBeVisible();
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Saved. It is on the parent's stay page now.")).toBeVisible();
  await page.goto(junoBooking);
  // Staff are not offered it.
  await expect(page.getByText(en.booking.updates.removePhoto)).toHaveCount(0);
  const link = (await page.getByText(/\/s\/[0-9a-f]{64}/).innerText()).trim();

  await page.context().clearCookies();
  await signIn(page, "owner");
  await page.goto(junoBooking);
  await page.getByText(en.booking.updates.removePhoto).click();
  await expect(page.getByText(en.booking.updates.removePhotoWarning)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("button", { name: "Delete photo 1" }).click();
  await expect(page.getByText(en.booking.done.photo_removed)).toBeVisible();

  const parent = await privateWindow(browser);
  await parent.page.goto(link);
  await expect(parent.page.getByText("Juno is settling in.")).toBeVisible();
  await expect(parent.page.locator("a[target=_blank] img")).toHaveCount(0);
  await parent.context.close();
});

test("a request waits on the waiting list, is shown on the calendar, and Today offers it once a kennel is free", async ({ page }) => {
  await signIn(page, "staff");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Juno (Ravi Sample)" });
  await page.getByLabel("Check-in date").fill(day(120));
  await page.getByLabel("Check-out date").fill(day(123));
  await page.getByRole("button", { name: en.newBooking.addToWaitlist }).click();
  await expect(page.getByText(en.booking.savedAsRequest)).toBeVisible();
  await expect(page.getByText(en.booking.waitlist.badge, { exact: true })).toBeVisible();
  await expect(page.getByText(/Number \d+ on the waiting list\./)).toBeVisible();
  // The house has room on those days.
  await expect(page.getByText(en.booking.waitlist.spaceNow)).toBeVisible();
  const request = new URL(page.url()).pathname;

  await page.goto(`/app/calendar?from=${day(120)}`);
  await expect(page.getByText(en.calendar.requestsTitle)).toBeVisible();
  const row = page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: /Juno/ }) });
  await expect(row.getByRole("rowheader")).toContainText(en.calendar.waiting);
  await expect(row.getByRole("link").first()).toHaveAttribute("title", "Juno, on the waiting list");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto("/app");
  const offered = page.getByRole("listitem").filter({ hasText: "Juno" }).filter({ has: page.getByRole("link", { name: en.today.waitlist.tell }) });
  await expect(offered).toBeVisible();
  await expect(offered.getByRole("link", { name: en.today.waitlist.tell })).toHaveAttribute("href", /wa\.me\/919800000411\?text=Hi%20Ravi%20Sample%2C%20good%20news/);
  await offered.getByRole("button", { name: en.booking.step.confirm }).click();
  await expect(page.getByText(en.booking.done.confirmed)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(request);
  await expect(page.getByText(en.booking.waitlist.badge, { exact: true })).toHaveCount(0);
});

test("the days of a repeating series are billed together, a month at a time", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Juno (Ravi Sample)" });
  await page.locator("select[name=kind]").selectOption("daycare");
  await page.getByLabel("Check-in date").fill(day(150));
  await page.getByText(en.newBooking.repeat, { exact: true }).click();
  for (const box of await page.locator("input[name=repeat_day]").all()) await box.check();
  await page.locator("input[name=repeat_until]").fill(day(156));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();

  const month = monthName(day(150));
  const sameMonth = [150, 151, 152, 153, 154, 155, 156].filter((n) => day(n).slice(0, 7) === day(150).slice(0, 7)).length;
  await expect(page.getByText(en.booking.bill.seriesNote)).toBeVisible();
  await page.getByRole("button", { name: `Make the bill for ${month}` }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Draft bill" })).toBeVisible();
  await expect(page.getByText(new RegExp(`Day boarding: Juno, ${sameMonth} days? in ${month}`))).toBeVisible();
  await expect(page.getByRole("link", { name: `Juno's day boarding in ${month}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole("button", { name: "Issue bill" }).click();
  await expect(page.getByText(/^Issued\./)).toBeVisible();

  await page.goto("/app/bills");
  await expect(page.getByText(`Ravi Sample, Juno, day boarding in ${month}`).first()).toBeVisible();
});

test("a person who lost their phone signs in with a recovery code, once", async ({ page }) => {
  test.setTimeout(150_000);
  const email = `recovery-${Date.now()}@example.test`;
  await page.goto("/login?mode=signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Kennel name").fill("Recovery Kennel");
  await page.getByLabel("Link name").fill(`recovery-${Date.now() % 100000}`);
  await page.getByLabel("Your name").fill("Ira");
  await page.getByRole("button", { name: /Create/ }).click();
  await page.waitForURL(/\/app\/more\/kennels/);

  await page.goto("/app/more/two-step");
  await page.getByRole("button", { name: en.twoStep.start }).click();
  const secret = (await page.locator("p.font-mono").innerText()).trim();
  await page.getByLabel(en.twoStep.code).fill(await freshCode(secret, new Set()));
  await page.getByRole("button", { name: en.twoStep.confirm, exact: true }).click();
  await expect(page.getByText(en.twoStep.isOn)).toBeVisible();
  await expect(page.getByText(en.twoStep.recovery.none)).toBeVisible();
  await page.getByRole("button", { name: en.twoStep.recovery.make }).click();
  await expect(page.getByText(en.twoStep.recovery.shown)).toBeVisible();
  const codes = (await page.locator("ol li").allInnerTexts()).map((c) => c.trim());
  expect(codes).toHaveLength(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  const signInWithRecovery = async (code: string) => {
    await page.goto("/app/more");
    await page.getByRole("button", { name: en.more.signOut }).click();
    await page.waitForURL(/\/login/);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/login\/code/);
    await page.getByText(en.auth.code.useRecovery).click();
    await page.getByLabel(en.auth.code.recoveryLabel).fill(code);
    await page.getByRole("button", { name: en.auth.code.continue }).last().click();
  };

  await signInWithRecovery(codes[0]);
  await page.waitForURL(/\/app\/more\/two-step/);
  await expect(page.getByText(en.twoStep.recovery.usedOne)).toBeVisible();
  await expect(page.getByText("9 codes left.")).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app$/);

  // The same code does not work twice.
  await signInWithRecovery(codes[0]);
  await expect(page.getByText(en.auth.code.recoveryWrong)).toBeVisible();
  await expect(page).toHaveURL(/\/login\/code/);
});

/** Where the 360 pixel screenshots of new screens go: SCREENSHOT_DIR, or nowhere. */
async function shot(page: Page, name: string) {
  const dir = process.env.SCREENSHOT_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
}

test("a kennel with a kitchen delivers: areas served, a parent's address, weights and skills", async ({ page }) => {
  // Staff see none of it while it is off.
  await signIn(page, "manager");
  await page.goto("/app/more");
  await expect(page.getByRole("link", { name: new RegExp(en.more.links.areas.title) })).toHaveCount(0);

  // Delivery needs the kitchen: the database says so.
  await page.goto("/app/more/settings");
  await page.getByLabel(en.offers.delivery).check();
  await page.getByRole("button", { name: en.settings.save }).click();
  await expect(page.getByText(en.errors.constraints.organizations_delivery_needs_kitchen)).toBeVisible();
  await page.getByLabel(en.offers.kitchen).check();
  await page.getByRole("button", { name: en.settings.save }).click();
  await expect(page.getByText(en.settings.saved)).toBeVisible();
  await shot(page, "m25-settings");

  await page.goto("/app/more");
  await page.getByRole("link", { name: new RegExp(en.more.links.areas.title) }).click();
  await page.getByLabel(en.areas.pin).fill("560 038");
  await page.getByLabel(en.areas.name).fill("Indiranagar");
  await page.getByLabel(en.areas.charge).fill("50");
  await page.getByRole("button", { name: en.areas.addButton }).click();
  await expect(page.getByText("Added Indiranagar.")).toBeVisible();
  await expect(page.getByText("₹50 a delivery")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(page, "m25-areas");

  // A parent's address, matched to the area by its PIN code.
  await openPet(page, "Biscuit");
  await page.getByRole("link", { name: "Priya Demo" }).click();
  await page.getByText(en.addresses.add, { exact: true }).click();
  // The parent's details form has a PIN code of its own, so look inside the address form.
  const addressForm = page.locator("form").filter({ has: page.getByRole("button", { name: en.addresses.addButton }) });
  await addressForm.getByLabel(en.addresses.line).fill("12, 4th Cross, HAL 2nd Stage");
  await addressForm.getByLabel(en.addresses.area).fill("Indiranagar");
  await addressForm.getByLabel(en.addresses.pin).fill("560038");
  await addressForm.getByLabel(en.addresses.map).fill("javascript:alert(1)");
  await addressForm.getByRole("button", { name: en.addresses.addButton }).click();
  await expect(page.getByText(en.addresses.errors.map)).toBeVisible();
  await addressForm.getByLabel(en.addresses.map).fill("https://maps.example.test/priya");
  await addressForm.getByRole("button", { name: en.addresses.addButton }).click();
  await expect(page.getByText(en.addresses.added)).toBeVisible();
  await page.reload();
  await expect(page.getByText("We deliver here: Indiranagar, ₹50 a delivery")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(page, "m25-parent-addresses");

  // Biscuit was weighed twice: the trend and the target show.
  await openPet(page, "Biscuit");
  await expect(page.getByText(/^31\.5 kg on /)).toBeVisible();
  await expect(page.getByText(/^Down 1\.3 kg since /)).toBeVisible();
  await expect(page.getByText("Target: 30 kg")).toBeVisible();
  await page.getByLabel(en.weights.weightKg, { exact: true }).fill("heavy");
  await page.getByRole("button", { name: en.weights.save }).click();
  await expect(page.getByText(en.weights.errors.weight)).toBeVisible();
  await page.getByLabel(en.weights.weightKg, { exact: true }).fill("31,2");
  await page.getByLabel(en.weights.bodyCondition).selectOption("5");
  await page.getByRole("button", { name: en.weights.save }).click();
  await expect(page.getByText(en.weights.saved)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/^31\.2 kg on /)).toBeVisible();
  await expect(page.getByText("Body condition 5 of 9").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(page, "m25-pet-weight");

  // A cook is marked on People.
  await page.goto("/app/more/people");
  const staffCard = page.getByRole("listitem").filter({ hasText: "Meena" });
  await staffCard.locator("summary", { hasText: en.skills.title }).click();
  await staffCard.getByLabel(en.skills.names.cook).check();
  await staffCard.getByRole("button", { name: en.skills.save }).click();
  await expect(page.getByText(en.skills.saved)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Meena" }).getByText(en.skills.names.cook, { exact: true }).first()).toBeVisible();
  await shot(page, "m25-people-skills");

  // Staff may add an address but not change one.
  await signIn(page, "staff");
  await openPet(page, "Biscuit");
  await page.getByRole("link", { name: "Priya Demo" }).click();
  await expect(page.getByText(en.addresses.byManagers)).toBeVisible();
  await expect(page.getByText("We deliver here: Indiranagar, ₹50 a delivery")).toBeVisible();
});

// ---------------------------------------------------------------------------
// Phase 1: the kitchen and food (M26 to M33). The kitchen and delivery were
// switched on above, with Indiranagar (560038) served and Priya's home there.
// ---------------------------------------------------------------------------

const narrow = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

test("a manager sets up the kitchen: stock, a supplier, a recipe in the rotation and food prices", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more");
  await page.getByRole("link", { name: new RegExp(en.more.links.kitchen.title) }).click();
  await expect(page.getByRole("heading", { level: 1, name: en.kitchen.title })).toBeVisible();
  await page.getByRole("link", { name: en.kitchen.links.stock }).click();

  const addItem = page.locator("form").filter({ has: page.getByRole("button", { name: en.stock.addItemButton }) });
  for (const [name, kind, never] of [["Chicken", "meat", false], ["Rice", "grain", false], ["Onion", "vegetable", true]] as const) {
    await addItem.getByLabel(en.stock.itemName).fill(name);
    await addItem.getByLabel(en.stock.kind).selectOption(kind);
    if (never) await addItem.getByLabel(en.stock.never).check();
    await addItem.getByRole("button", { name: en.stock.addItemButton }).click();
    await expect(page.getByText(`${name} added.`)).toBeVisible();
  }
  const supplier = page.locator("form").filter({ has: page.getByRole("button", { name: en.stock.addSupplierButton }) });
  await supplier.getByLabel(en.stock.supplierName).fill("Ali Meats");
  await supplier.getByLabel(en.stock.supplierPhone).fill("98450 11111");
  await supplier.getByRole("button", { name: en.stock.addSupplierButton }).click();
  await expect(page.getByText("Ali Meats added.")).toBeVisible();

  // Bought in, with the cost, and written down as an expense in the same step.
  const buy = page.locator("form").filter({ has: page.getByRole("button", { name: en.stock.recordBuy }) });
  for (const [item, quantity, cost] of [["Chicken (grams)", "20 kg", "4400"], ["Rice (grams)", "15 kg", "900"]]) {
    await buy.locator("select[name=itemId]").selectOption({ label: item });
    await buy.getByLabel(en.stock.quantity).fill(quantity);
    await buy.getByLabel(en.stock.cost).fill(cost);
    await buy.getByRole("button", { name: en.stock.recordBuy }).click();
    await expect(page.getByText(new RegExp(`of ${item.split(" ")[0]} recorded`))).toBeVisible();
  }
  const waste = page.locator("form").filter({ has: page.getByRole("button", { name: en.stock.recordWaste, exact: true }) });
  await waste.locator("select[name=itemId]").selectOption({ label: "Chicken (grams)" });
  await waste.getByLabel(en.stock.quantity).fill("500 g");
  await waste.getByRole("button", { name: en.stock.recordWaste, exact: true }).click();
  await expect(page.getByText("500 g of Chicken written off.")).toBeVisible();
  const count = page.locator("form").filter({ has: page.getByRole("button", { name: en.stock.recordCount }) });
  await count.locator("select[name=itemId]").selectOption({ label: "Rice (grams)" });
  await count.getByLabel(en.stock.counted).fill("14.9 kg");
  await count.getByRole("button", { name: en.stock.recordCount }).click();
  await expect(page.getByText("Rice counted: -100 g difference.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("19.5 kg", { exact: true })).toBeVisible();
  await narrow(page);
  await shot(page, "m26-stock");

  // A recipe: nothing a dog must never eat goes in.
  await page.goto("/app/kitchen/recipes");
  await page.getByLabel(en.recipes.name).fill("Chicken and rice");
  await page.getByLabel(en.recipes.place).fill("1");
  await page.getByRole("button", { name: en.recipes.addButton }).click();
  await expect(page.getByText("Chicken and rice added. Add what goes in it.")).toBeVisible();
  await expect(page.locator("select[name=item_0] option", { hasText: "Onion" })).toHaveCount(0);
  await page.locator("select[name=item_0]").selectOption({ label: "Chicken (grams)" });
  await page.locator("input[name=qty_0]").fill("600 g");
  await page.locator("select[name=item_1]").selectOption({ label: "Rice (grams)" });
  await page.locator("input[name=qty_1]").fill("400 g");
  await page.getByLabel(en.recipePage.goodForField).fill("A gentle everyday meal");
  await page.getByRole("button", { name: en.recipePage.saveVersion }).click();
  await expect(page.getByText("Version 1 saved.")).toBeVisible();
  await page.reload();
  // Chicken ₹220 a kilo and rice ₹60 a kilo: ₹132 + ₹24.
  await expect(page.getByText("₹156 a kg")).toBeVisible();
  await narrow(page);
  await shot(page, "m27-recipe");

  // Food prices.
  await page.goto("/app/kitchen/settings");
  const price = page.locator("form").filter({ has: page.getByRole("button", { name: en.kitchenSettings.addPriceButton }) });
  await price.getByLabel(en.kitchenSettings.kind).selectOption("subscription");
  await price.getByLabel(en.kitchenSettings.name).fill("Fresh food");
  await price.getByLabel(en.kitchenSettings.price, { exact: true }).fill("400");
  await price.getByRole("button", { name: en.kitchenSettings.addPriceButton }).click();
  await expect(page.getByText("Fresh food added.")).toBeVisible();
  await price.getByLabel(en.kitchenSettings.kind).selectOption("trial");
  await price.getByLabel(en.kitchenSettings.name).fill("Food trial");
  await price.getByLabel(en.kitchenSettings.price, { exact: true }).fill("499");
  await price.getByLabel(en.kitchenSettings.trialGrams).fill("1");
  await price.getByRole("button", { name: en.kitchenSettings.addPriceButton }).click();
  await expect(page.getByText("Food trial added.")).toBeVisible();
  await expect(page.getByText("Fresh food: ₹400 a kg")).toBeVisible();
  await narrow(page);
  await shot(page, "m28-kitchen-settings");
});

test("Biscuit's portion, and a food subscription every day: billed ahead and credited for a cancelled delivery", async ({ page }) => {
  await signIn(page, "manager");
  await openPet(page, "Biscuit");
  // 31.2 kg is a large dog: 2% a day.
  await expect(page.getByText("624 g a day: large dog, 2% of 31.2 kg")).toBeVisible();
  await narrow(page);
  await shot(page, "m28-pet-food");
  await page.getByRole("link", { name: en.petFood.startSubscription }).click();
  await expect(page.locator("input[name=grams]")).toHaveValue("624");
  for (const d of [1, 3, 4, 6, 7]) await page.locator(`input[name=day_${d}]`).check();
  await page.getByLabel(en.food.startsOn).fill(day(2));
  await page.locator("input[name=grams]").fill("500");
  await page.getByRole("button", { name: en.food.startButton }).click();
  await expect(page.getByText(en.food.started)).toBeVisible();
  // Each day covers one day: two packs of 250 g.
  await expect(page.getByText(/: 2 packs, 0\.5 kg, Chicken and rice for 1 day/).first()).toBeVisible();
  await narrow(page);
  await shot(page, "m29-subscription");

  // Billed ahead: this week and the next.
  const subscription = page.url().split("?")[0];
  for (let i = 0; i < 2; i++) {
    await page.goto(subscription);
    await page.getByRole("button", { name: /^Make the bill for / }).first().click();
    await page.getByRole("button", { name: "Issue bill" }).click();
    await expect(page.getByText(/^Issued\./)).toBeVisible();
  }
  await expect(page.getByText(/Fresh food for Biscuit: /).first()).toBeVisible();

  // The first delivery is cancelled before it is cooked: its bill offers the difference back.
  await page.goto(subscription);
  const first = page.getByRole("listitem").filter({ has: page.getByText(en.subscription.cancel) }).first();
  await first.locator("summary", { hasText: en.subscription.cancel }).click();
  await first.getByLabel(en.subscription.cancelReason).fill("Away that day");
  await first.getByRole("button", { name: en.subscription.cancel }).click();
  await expect(page.getByText(en.subscription.cancelledDelivery)).toBeVisible();
  // Bills are listed newest first; the cancelled day is in the first week.
  await page.locator("a[href^='/app/bills/']").last().click();
  await page.waitForURL(/\/app\/bills\//);
  await expect(page.getByRole("heading", { name: en.bill.difference.title })).toBeVisible();
  await page.getByRole("button", { name: /^Credit ₹/ }).click();
  await page.waitForURL(/done=credited/);
  await narrow(page);

  // Paused for a few days.
  await page.goto(subscription);
  await page.getByLabel(en.subscription.pauseFrom, { exact: true }).fill(day(10));
  await page.getByLabel(en.subscription.pauseUntil, { exact: true }).fill(day(12));
  await page.getByRole("button", { name: en.subscription.pauseButton, exact: true }).click();
  await expect(page.getByText(en.subscription.pausedDone)).toBeVisible();
});

test("the cook plan for a day, a batch that takes stock out, packing, labels and who got the batch", async ({ page }) => {
  await signIn(page, "staff");
  await expect(page.getByRole("heading", { name: en.todayKitchen.title })).toBeVisible();
  await page.goto(`/app/kitchen?date=${day(3)}`);
  // One delivery of 0.5 kg, any boarders on the kitchen's food, and 10% more.
  await expect(page.getByText(/^Chicken and rice: [\d.]+ kg$/)).toBeVisible();
  await expect(page.getByText(/^0\.5 kg for deliveries/)).toBeVisible();
  await expect(page.getByText("Ali Meats")).toHaveCount(0);
  await page.locator("input[name=packs]").fill("3");
  await page.getByRole("button", { name: en.kitchen.recordBatch }).click();
  await expect(page.getByText(/^Batch \d{6}-1 recorded\./)).toBeVisible();
  await narrow(page);
  await shot(page, "m30-cook-plan");
  const row = page.getByRole("listitem").filter({ hasText: "Biscuit for Priya Demo" });
  await row.getByRole("button", { name: en.kitchen.pack }).click();
  await expect(page.getByText(/^Packed from batch \d{6}-1\./)).toBeVisible();

  await page.goto(`/app/kitchen/labels?date=${day(3)}`);
  await expect(page.getByText("For Biscuit")).toHaveCount(2);
  await shot(page, "m30-labels");

  await page.goto(`/app/kitchen?date=${day(3)}`);
  await page.getByRole("link", { name: /^\d{6}-1: Chicken and rice/ }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Biscuit" }).getByText(/^Delivery on /)).toBeVisible();
  await narrow(page);
  await shot(page, "m30-batch");
  // Staff see no cost.
  await expect(page.getByText(/^Cost ₹/)).toHaveCount(0);
});

test("a rider joins and sees only their own run, and marks a stop delivered", async ({ page, browser }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/people");
  const linkForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Make a link" }) });
  await linkForm.getByRole("textbox", { name: "Their name" }).fill("Raju");
  await linkForm.locator("select[name=role]").selectOption("rider");
  await linkForm.getByRole("button", { name: "Make a link" }).click();
  await expect(page.getByText("Link made.")).toBeVisible();
  const href = (await page.getByRole("link", { name: "Send on WhatsApp" }).first().getAttribute("href"))!;
  const joinPath = /\/join\/[0-9a-f]{64}/.exec(decodeURIComponent(href))![0];
  const raju = await privateWindow(browser);
  await raju.page.goto(joinPath);
  await raju.page.getByRole("link", { name: "Create an account" }).click();
  await raju.page.getByLabel("Email").fill(`raju-${Date.now()}@example.test`);
  await raju.page.getByLabel("Password").fill(PASSWORD);
  await raju.page.getByRole("button", { name: "Create account" }).click();
  await raju.page.getByRole("button", { name: /Join Wagbook Demo Kennel/ }).click();
  await raju.page.waitForURL(/\/rider$/);
  await expect(raju.page.getByText(en.rider.none)).toBeVisible();
  // The kennel's own screens send a rider back to their run.
  await raju.page.goto("/app/bookings");
  await raju.page.waitForURL(/\/rider$/);

  // A trial for Biscuit today, cooked, packed and put on Raju's run.
  await openPet(page, "Biscuit");
  const petUrl = page.url();
  const petId = petUrl.split("/").pop()!;
  await page.goto(`/app/food/new?pet=${petId}&kind=order`);
  await page.getByLabel(en.food.orderKind).selectOption("trial");
  await page.locator("select[name=productId]").selectOption({ label: "Food trial (A trial, once per pet, ₹499)" });
  await page.getByLabel(en.food.orderDate).fill(day(0));
  await page.getByRole("button", { name: en.food.orderButton }).click();
  await expect(page.getByText(`Order added for ${day(0)}.`)).toBeVisible();
  await page.goto(`/app/kitchen?date=${day(0)}`);
  await page.locator("input[name=packs]").fill("4");
  await page.getByRole("button", { name: en.kitchen.recordBatch }).click();
  await expect(page.getByText(/^Batch \d{6}-\d recorded\./)).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Biscuit for Priya Demo" }).getByRole("button", { name: en.kitchen.pack }).click();
  await expect(page.getByText(/^Packed from batch/)).toBeVisible();
  await page.goto(`/app/food/runs?date=${day(0)}`);
  await page.locator("select[name=riderId]").selectOption({ label: "Raju" });
  await page.getByRole("button", { name: en.runs.startRun }).click();
  await expect(page.getByText(en.runs.runStarted)).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Biscuit" }).getByRole("button", { name: en.runs.addTo }).click();
  await expect(page.getByText(en.runs.added)).toBeVisible();
  await expect(page.getByRole("link", { name: en.runs.route })).toBeVisible();
  await narrow(page);
  await shot(page, "m31-runs");

  await raju.page.reload();
  await expect(raju.page.getByText("1. Priya Demo")).toBeVisible();
  await expect(raju.page.getByText("12, 4th Cross, HAL 2nd Stage, Indiranagar, 560038")).toBeVisible();
  // No prices, no medical notes.
  await expect(raju.page.getByText(/₹/)).toHaveCount(0);
  await expect(raju.page.getByRole("link", { name: en.rider.tellOnTheWay })).toHaveAttribute("href", /wa\.me/);
  expect(await raju.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(raju.page, "m31-rider");
  await raju.page.getByRole("button", { name: en.rider.onTheWay }).click();
  await expect(raju.page.getByText("Saved: On the way.")).toBeVisible();
  await raju.page.getByRole("button", { name: en.rider.delivered, exact: true }).click();
  await expect(raju.page.getByText("Saved: Delivered.")).toBeVisible();
  await raju.context.close();

  await page.goto(`/app/food/runs?date=${day(0)}`);
  await expect(page.getByRole("listitem").filter({ hasText: "Biscuit" }).getByText(en.deliveryStatus.delivered, { exact: true })).toBeVisible();
});

test("an order from the kennel's food page becomes a subscription; a known parent asks for a pause from their link", async ({ page, browser }) => {
  const parent = await privateWindow(browser);
  await parent.page.goto("/f/demo");
  await expect(parent.page.getByRole("heading", { name: "Fresh food from Wagbook Demo Kennel" })).toBeVisible();
  await parent.page.getByLabel(en.foodOrder.dogName).fill("Mango");
  await parent.page.getByLabel(en.foodOrder.weight).fill("12");
  // A 12 kg dog is medium: 2.5% a day.
  await expect(parent.page.getByText("About 300 g a day for a medium dog.")).toBeVisible();
  await parent.page.getByLabel(en.foodOrder.line).fill("7 Lake View Road");
  await parent.page.getByLabel(en.foodOrder.pin).fill("560038");
  await expect(parent.page.getByText("We deliver to Indiranagar.")).toBeVisible();
  // Tuesday 900 g and Friday 1.2 kg, each made whole packs of 250 g (1 kg and 1.25 kg), at ₹400 a kilo, and ₹50 each time.
  await expect(parent.page.getByText("To pay now, the first week: ₹1,000")).toBeVisible();
  await parent.page.getByLabel(en.foodOrder.name).fill("Anita Example");
  await parent.page.getByLabel(en.foodOrder.phone).fill("98450 22222");
  await parent.page.getByLabel(/I agree to Wagbook Demo Kennel keeping/).check();
  expect(await parent.page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(parent.page, "m32-order-form");
  await parent.page.getByRole("button", { name: en.foodOrder.send }).click();
  await expect(parent.page.getByText("Pay ₹1,000 by UPI")).toBeVisible();
  await shot(parent.page, "m32-order-pay");
  await parent.page.getByRole("button", { name: en.foodOrder.paid }).click();
  await expect(parent.page.getByText(en.foodOrder.paidThanks)).toBeVisible();

  // A PIN code not served waits for its area, with nothing to pay.
  await parent.page.goto("/f/demo");
  await parent.page.getByLabel(en.foodOrder.dogName).fill("Kiwi");
  await parent.page.getByLabel(en.foodOrder.weight).fill("8");
  await parent.page.getByLabel(en.foodOrder.line).fill("1 Far Away Street");
  await parent.page.getByLabel(en.foodOrder.pin).fill("560100");
  await expect(parent.page.getByText(en.foodOrder.notServed)).toBeVisible();
  await parent.page.getByLabel(en.foodOrder.name).fill("Sunil Example");
  await parent.page.getByLabel(en.foodOrder.phone).fill("98450 33333");
  await parent.page.getByLabel(/I agree to Wagbook Demo Kennel keeping/).check();
  await parent.page.getByRole("button", { name: en.foodOrder.send }).click();
  await expect(parent.page.getByText(en.foodOrder.waitingArea)).toBeVisible();
  await parent.context.close();

  await signIn(page, "staff");
  await page.goto("/app/food/orders");
  await expect(page.getByText("560100: 1")).toBeVisible();
  const order = page.getByRole("listitem").filter({ hasText: "Anita Example" });
  await expect(order.getByText(en.foodOrders.statuses.paid)).toBeVisible();
  await narrow(page);
  await shot(page, "m32-orders");
  await order.getByRole("button", { name: en.foodOrders.confirm }).click();
  await expect(page.getByText(en.foodOrders.confirmed)).toBeVisible();
  await page.goto("/app/food");
  await expect(page.getByRole("link", { name: /Mango \(Anita Example\): 300 g a day, Tue, Fri/ })).toBeVisible();
  await narrow(page);
  await shot(page, "m29-food");

  // Priya asks for a pause from her own link.
  await openPet(page, "Biscuit");
  await page.getByRole("link", { name: "Priya Demo" }).click();
  const linkHref = (await page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: en.parent.requestLink.title }) })
    .getByRole("link", { name: en.parent.requestLink.send })
    .getAttribute("href"))!;
  const tokenPath = /\/b\/[0-9a-f]{64}/.exec(decodeURIComponent(linkHref))![0];
  const priya = await privateWindow(browser);
  await priya.page.goto(tokenPath);
  await expect(priya.page.getByRole("heading", { name: en.foodLink.title })).toBeVisible();
  await priya.page.getByLabel(en.foodLink.from).fill(day(15));
  await priya.page.getByLabel(en.foodLink.until).fill(day(16));
  await priya.page.getByRole("button", { name: en.foodLink.send }).click();
  await expect(priya.page.getByText(en.foodLink.sent)).toBeVisible();
  await priya.context.close();
  await page.goto("/app/food/orders");
  const pause = page.getByRole("listitem").filter({ hasText: en.foodOrders.kinds.pause });
  await pause.getByRole("button", { name: en.foodOrders.confirm }).click();
  await expect(page.getByText(en.foodOrders.confirmed)).toBeVisible();
});

test("the food report counts the month, and downloads as CSV; staff are refused", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/reports");
  await expect(page.getByRole("heading", { name: en.foodReports.title, exact: true })).toBeVisible();
  await expect(page.getByText(en.foodReports.active)).toBeVisible();
  await expect(page.getByText(/Raju: 1 delivered/)).toBeVisible();
  await narrow(page);
  await shot(page, "m33-food-report");
  const href = (await page.getByRole("link", { name: en.foodReports.download }).getAttribute("href"))!;
  const csv = await page.request.get(href);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(en.foodReports.active);

  await signIn(page, "staff");
  const refused = await page.request.get(href);
  expect(refused.status()).toBe(403);
});

// ---------------------------------------------------------------------------
// Phase 2: appointments (M34 to M37). New pets are added for these steps, so
// they do not depend on the stays the steps above changed.
// ---------------------------------------------------------------------------

/** Book an appointment from the form: the pet, the service, the day, then one of the free times. */
async function openAppointmentForm(page: Page, petLabel: string, service: string, date: string) {
  await page.goto("/app/appointments/new");
  await page.locator("select[name=pet]").selectOption({ label: petLabel });
  await page.getByRole("button", { name: en.newAppointment.next }).click();
  await page.locator("select[name=service]").selectOption({ label: service });
  await page.locator("input[name=date]").fill(date);
  await page.getByRole("button", { name: en.newAppointment.showTimes }).click();
  await expect(page.getByRole("heading", { name: en.newAppointment.times })).toBeVisible();
}

test("appointments: a manager sets up places, services priced by coat, an add-on and a package", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/settings");
  await page.getByLabel(en.offers.appointments).check();
  await page.getByRole("button", { name: en.settings.save }).click();
  await expect(page.getByText(en.settings.saved)).toBeVisible();

  await page.goto("/app/more");
  await page.getByRole("link", { name: new RegExp(en.more.links.appointmentSetup.title) }).click();
  const s = en.appointmentSetup;
  const placeForm = page.locator("form").filter({ has: page.getByRole("button", { name: s.addPlaceButton }) });
  for (const name of ["Pool", "Grooming table"]) {
    await placeForm.locator("input[name=name]").fill(name);
    await placeForm.getByRole("button", { name: s.addPlaceButton }).click();
    await expect(page.getByText(`Added ${name}.`)).toBeVisible();
  }

  const serviceForm = page.locator("form").filter({ has: page.getByRole("button", { name: s.addServiceButton }) });
  const addService = async (o: { name: string; kind: string; place?: string; minutes?: string; cleanup?: string; pricing?: string; price: string; addon?: boolean }) => {
    await serviceForm.locator("input[name=name]").fill(o.name);
    await serviceForm.locator("select[name=kind]").selectOption({ label: o.kind });
    if (o.place) await serviceForm.locator("select[name=placeId]").selectOption({ label: o.place });
    if (o.minutes) await serviceForm.locator("input[name=minutes]").fill(o.minutes);
    await serviceForm.locator("input[name=cleanup]").fill(o.cleanup ?? "0");
    await serviceForm.locator("select[name=pricing]").selectOption({ label: o.pricing ?? en.pricings.fixed });
    await serviceForm.locator("input[name=price]").fill(o.price);
    if (o.addon) await serviceForm.locator("input[name=is_addon]").check();
    await serviceForm.getByRole("button", { name: s.addServiceButton }).click();
    await expect(page.getByText(`Added ${o.name}.`)).toBeVisible();
  };
  await addService({ name: "Swim", kind: en.appointmentKinds.swim, place: "Pool", minutes: "60", cleanup: "30", price: "800" });
  await addService({ name: "Full groom", kind: en.appointmentKinds.groom, place: "Grooming table", minutes: "120", pricing: en.pricings.by_coat, price: "1000" });
  await addService({ name: "Nail trim", kind: en.appointmentKinds.groom, price: "200", addon: true });

  // A double coat costs more.
  const groom = page.getByRole("listitem").filter({ hasText: "Full groom" });
  await groom.locator("summary", { hasText: "Prices for Full groom" }).click();
  await groom.locator("select[name=coat]").selectOption({ label: en.coats.double });
  await groom.locator("input[name=price]").fill("1200");
  await groom.getByRole("button", { name: s.addPrice }).click();
  await expect(page.getByText(s.saved)).toBeVisible();
  await page.reload();
  await page.getByRole("listitem").filter({ hasText: "Full groom" }).locator("summary", { hasText: "Prices for Full groom" }).click();
  await expect(page.getByText("Double: ₹1,200")).toBeVisible();

  // A holiday package: a swim on the middle day and a groom on the last.
  const packageForm = page.locator("form").filter({ has: page.getByRole("button", { name: s.addPackageButton }) });
  await packageForm.locator("input[name=name]").fill("Holiday package");
  await packageForm.locator("input[name=price]").fill("15000");
  await packageForm.getByRole("button", { name: s.addPackageButton }).click();
  await expect(page.getByText("Added Holiday package.")).toBeVisible();
  for (const [service, dayLabel] of [["Swim", en.packageDays.middle], ["Full groom", en.packageDays.last]] as const) {
    const pkg = page.getByRole("listitem").filter({ hasText: "Holiday package" });
    await pkg.locator("summary", { hasText: "Add to Holiday package" }).click();
    await pkg.locator("select[name=serviceId]").selectOption({ label: service });
    await pkg.locator("select[name=on_day]").selectOption({ label: dayLabel });
    await pkg.getByRole("button", { name: s.addPartButton }).click();
    await expect(page.getByText(s.saved)).toBeVisible();
    await page.reload();
  }
  await expect(page.getByText(`Swim, ${en.packageDays.middle}`)).toBeVisible();
  await expect(page.getByText(`Full groom, ${en.packageDays.last}`)).toBeVisible();
  await narrow(page);
  await shot(page, "m34-setup");
});

test("appointments: two swims at overlapping times are refused with a sentence, and the day shows each place as a column", async ({ page, context }) => {
  await signIn(page, "manager");
  await addPet(page, "9800000412", "Asha Sample", "Kiwi");
  await addPet(page, "9800000413", "Dev Sample", "Olive");
  await signIn(page, "staff");

  // Olive's form is open at 10:30 while Kiwi is booked for 10:00 in another tab.
  await openAppointmentForm(page, "Olive (Dev Sample)", "Swim (Swimming)", day(2));
  await expect(page.getByLabel("10:30")).toBeVisible();
  const other = await context.newPage();
  await openAppointmentForm(other, "Kiwi (Asha Sample)", "Swim (Swimming)", day(2));
  await other.getByLabel("10:00").check();
  await other.getByRole("button", { name: en.newAppointment.bookButton }).click();
  await expect(other.getByText(en.appointment.done_.booked)).toBeVisible();
  await other.close();

  // The pool is taken 10:00 to 11:00 and cleaned until 11:30.
  await page.getByLabel("10:30").check();
  await page.getByRole("button", { name: en.newAppointment.bookButton }).click();
  await expect(page.getByText(en.errors.constraints.appointments_no_place_overlap)).toBeVisible();
  await page.getByRole("button", { name: en.newAppointment.showTimes }).click();
  await expect(page.getByLabel("10:30")).toHaveCount(0);
  await expect(page.getByLabel("11:00")).toHaveCount(0);
  await page.getByLabel("11:30").check();
  await page.getByRole("button", { name: en.newAppointment.bookButton }).click();
  await expect(page.getByText(en.appointment.done_.booked)).toBeVisible();

  await page.goto(`/app/appointments?date=${day(2)}`);
  await expect(page.locator("[data-board]").getByText("Pool")).toBeVisible();
  await expect(page.locator("[data-board]").getByText("10:00 Kiwi")).toBeVisible();
  await expect(page.locator("[data-board]").getByText("11:30 Olive")).toBeVisible();
  await expect(page.locator("[data-board]").getByText(en.appointments.cleaning).first()).toBeVisible();
  await narrow(page);
  await shot(page, "m34-day");
});

test("appointments: a visitor's groom has a bill of its own, priced by its coat, with an add-on", async ({ page }) => {
  await signIn(page, "manager");
  await openPet(page, "Kiwi");
  await page.locator("select[name=coat]").selectOption({ label: en.coats.double });
  await page.locator("input[name=usual_cut]").fill("Short all over");
  await page.locator("input[name=every_weeks]").fill("6");
  await page.getByRole("button", { name: en.grooming.save }).click();
  await expect(page.getByText(en.grooming.saved)).toBeVisible();
  await narrow(page);
  await shot(page, "m35-pet-grooming");

  await openAppointmentForm(page, "Kiwi (Asha Sample)", "Full groom (Grooming)", day(3));
  await expect(page.getByText("It costs ₹1,200.")).toBeVisible();
  await expect(page.getByText(/is not staying that day/)).toBeVisible();
  await page.getByLabel("09:00").check();
  await page.getByRole("button", { name: en.newAppointment.bookButton }).click();
  await expect(page.getByText(en.appointment.done_.booked)).toBeVisible();
  await expect(page.getByText(`${en.appointment.price}: ₹1,200`)).toBeVisible();
  await page.getByRole("button", { name: en.appointment.addOnButton }).click();
  await expect(page.getByText(en.appointment.done_.addOn)).toBeVisible();
  await narrow(page);
  await shot(page, "m34-appointment");

  await page.getByRole("button", { name: en.appointment.makeBill }).click();
  await expect(page.getByText(/^Full groom for Kiwi \(/)).toBeVisible();
  await expect(page.getByText(/^Nail trim for Kiwi \(/)).toBeVisible();
  await page.getByRole("button", { name: "Issue bill" }).click();
  await expect(page.getByText(/^Issued\./)).toBeVisible();
  await expect(page.getByText("₹1,400").first()).toBeVisible();
});

test("appointments: a boarder's groom before going home is on its stay's bill, and the parent sees the after photo", async ({ page, browser }) => {
  await signIn(page, "manager");
  await addPet(page, "9800000414", "Neel Sample", "Simba");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Simba (Neel Sample)" });
  await page.getByLabel("Check-in date").fill(day(0));
  await page.getByLabel("Check-out date").fill(day(2));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  const stay = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();

  // The last day, finished by the kennel's check-out time of 12:00: 10:00 to 12:00.
  await page.getByRole("button", { name: en.stayAppointments.groomBefore }).click();
  await expect(page.getByText(en.appointment.done_.booked)).toBeVisible();
  await expect(page.getByText(/, 10:00 to 12:00$/)).toBeVisible();
  await page.getByLabel(en.appointment.vaccinationsSeen).check();
  await page.getByRole("button", { name: en.appointment.done }).click();
  await expect(page.getByText(en.appointment.done_.done)).toBeVisible();

  await page.getByRole("link", { name: en.appointment.photos }).click();
  await expect(page.getByLabel("How is the pet doing?")).toHaveValue("Before and after: Full groom");
  await page.locator("input[name=photos]").setInputFiles({ name: "after.jpg", mimeType: "image/jpeg", buffer: await photoWithLocation(page) });
  await expect(page.locator("img[src^='blob:']").first()).toBeVisible();
  await page.getByRole("button", { name: "Save update" }).click();
  await expect(page.getByText("Saved. It is on the parent's stay page now.")).toBeVisible();

  await page.goto(stay);
  await expect(page.getByText(/^Full groom for Simba \(/)).toBeVisible();
  await narrow(page);
  await shot(page, "m35-stay-groom");
  const link = (await page.getByText(/\/s\/[0-9a-f]{64}/).innerText()).trim();
  await page.getByRole("button", { name: "Make bill" }).click();
  await expect(page.getByText(/^Full groom for Simba \(/)).toBeVisible();

  const parent = await privateWindow(browser);
  await parent.page.goto(link);
  await expect(parent.page.getByText("Before and after: Full groom")).toBeVisible();
  await expect(parent.page.locator("a[target=_blank] img").first()).toBeVisible();
  await parent.context.close();
});

test("appointments: a stay with a package is billed as one line, its swim and groom booked", async ({ page }) => {
  await signIn(page, "manager");
  await addPet(page, "9800000415", "Ira Sample", "Toby");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Toby (Ira Sample)" });
  await page.getByLabel("Check-in date").fill(day(5));
  await page.getByLabel("Check-out date").fill(day(9));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  await page.locator("select[name=packageId]").selectOption({ label: "Holiday package, ₹15,000" });
  await page.getByRole("button", { name: en.stayAppointments.addPackageButton }).click();
  await expect(page.getByText(en.stayAppointments.applied)).toBeVisible();
  await expect(page.getByText("Booked as Holiday package: ₹15,000 for the whole stay.")).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: "Swim (In the package)" })).toBeVisible();
  await expect(page.getByRole("link").filter({ hasText: "Full groom (In the package)" })).toBeVisible();
  await narrow(page);
  await shot(page, "m37-package-stay");
  await page.getByRole("button", { name: "Make bill" }).click();
  await expect(page.getByText(/^Holiday package: Toby, 4 nights/)).toBeVisible();
  await expect(page.getByText(/^Swim for Toby/)).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// Phase 3: boarding as the public rules promise (M38 to M42). New pets again.
// ---------------------------------------------------------------------------

test("cancellation: the kennel cancels a paid stay, the parent keeps it as credit, and a manager adds goodwill", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more");
  await page.getByRole("link", { name: new RegExp(en.more.links.cancellation.title) }).click();
  await page.locator("input[name='boarding.hours']").fill("48");
  await page.getByRole("button", { name: en.cancelSetup.save }).click();
  await expect(page.getByText(en.cancelSetup.saved)).toBeVisible();
  await narrow(page);
  await shot(page, "m38-rules");

  await addPet(page, "9800000416", "Asha Sample", "Mitra");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Mitra (Asha Sample)" });
  await page.getByLabel("Check-in date").fill(day(10));
  await page.getByLabel("Check-out date").fill(day(13));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  await page.getByLabel("Amount").fill("3000");
  await page.getByRole("button", { name: "Record advance" }).click();
  await expect(page.getByText("Advance recorded.")).toBeVisible();

  await page.getByLabel("Why is it cancelled?").fill("The kennel is closed for repairs");
  await page.getByLabel(en.cancelRules.byKennel).check();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("Booking cancelled. The space is free again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: en.cancelRules.title })).toBeVisible();
  await expect(page.getByText(en.cancelRules.byKennelAbout)).toBeVisible();
  await narrow(page);
  await shot(page, "m38-cancelled");
  await page.locator("select[name=choice]").selectOption({ label: en.cancelRules.chooseCredit });
  await page.getByRole("button", { name: en.cancelRules.confirmChoice }).click();
  await expect(page.getByText(en.cancelRules.settled)).toBeVisible();

  await openPet(page, "Mitra");
  await page.getByRole("link", { name: "Asha Sample" }).click();
  await expect(page.getByText("₹3,000 of credit to spend")).toBeVisible();
  await page.locator("form").filter({ has: page.getByRole("button", { name: en.credit.give }) }).locator("input[name=amount]").fill("500");
  await page.locator("input[name=reason]").fill("Sorry for the trouble");
  await page.getByRole("button", { name: en.credit.give }).click();
  await expect(page.getByText(en.credit.given)).toBeVisible();
  await page.reload();
  await expect(page.getByText("₹3,500 of credit to spend")).toBeVisible();
  await expect(page.getByText(en.credit.kinds.goodwill)).toBeVisible();
  await narrow(page);
  await shot(page, "m38-credit");
});

test("health papers: a pet with no rabies card is refused at check-in until a manager lets it in", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/health");
  await page.locator("select[name=mode]").selectOption("refuse");
  await page.getByRole("button", { name: en.healthSetup.save, exact: true }).click();
  await expect(page.getByText(en.healthSetup.saved, { exact: true })).toBeVisible();
  await page.locator("input[name=vaccine]").fill("Rabies");
  await page.getByRole("button", { name: en.healthSetup.add }).click();
  await expect(page.getByText("Rabies is now required.")).toBeVisible();
  await narrow(page);
  await shot(page, "m40-setup");

  await addPet(page, "9800000417", "Dev Sample", "Kiwi");
  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Kiwi (Dev Sample)" });
  await page.getByLabel("Check-in date").fill(day(0));
  await page.getByLabel("Check-out date").fill(day(1));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  await expect(page.getByText(/this pet lacks what the kennel requires: Rabies vaccination/)).toBeVisible();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("This pet lacks what the kennel requires at the door: Rabies. An owner or manager can let it in with a note.")).toBeVisible();
  await narrow(page);
  await shot(page, "m40-refused");

  await page.getByLabel(en.health.why).fill("Card seen on the parent's phone");
  await page.getByRole("button", { name: en.health.letInButton }).click();
  await expect(page.getByText("Let in anyway: Card seen on the parent's phone")).toBeVisible();
  await page.getByRole("button", { name: "Check in" }).click();
  await expect(page.getByText("Checked in.")).toBeVisible();

  // Back to not checking, for the steps after.
  await page.goto("/app/more/health");
  await page.locator("select[name=mode]").selectOption("off");
  await page.getByRole("button", { name: en.healthSetup.save, exact: true }).click();
  await expect(page.getByText(en.healthSetup.saved, { exact: true })).toBeVisible();
});

test("pick-up from home: a trip on a stay, priced by the area, goes on the day's run", async ({ page }) => {
  await signIn(page, "manager");
  await addPet(page, "9800000418", "Meera Sample", "Zuzu");
  await openPet(page, "Zuzu");
  await page.getByRole("link", { name: "Meera Sample" }).click();
  await page.getByText(en.addresses.add, { exact: true }).click();
  const addressForm = page.locator("form").filter({ has: page.getByRole("button", { name: en.addresses.addButton }) });
  await addressForm.getByLabel(en.addresses.line).fill("7, 2nd Main, Domlur");
  await addressForm.getByLabel(en.addresses.area).fill("Indiranagar");
  await addressForm.getByLabel(en.addresses.pin).fill("560038");
  await addressForm.getByRole("button", { name: en.addresses.addButton }).click();
  await expect(page.getByText(en.addresses.added)).toBeVisible();

  await page.goto("/app/bookings/new");
  await page.locator("select[name=petId]").selectOption({ label: "Zuzu (Meera Sample)" });
  await page.getByLabel("Check-in date").fill(day(0));
  await page.getByLabel("Check-out date").fill(day(2));
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByText("Booked.")).toBeVisible();
  const stay = new URL(page.url()).pathname;
  await page.getByRole("button", { name: en.trips.addButton }).click();
  await expect(page.getByText("Pick-up added. It goes on that day's runs.")).toBeVisible();
  await expect(page.getByRole("link", { name: en.trips.tell })).toHaveAttribute("href", /wa\.me/);
  await narrow(page);
  await shot(page, "m39-trip");

  await page.goto(`/app/food/runs?date=${day(0)}`);
  await page.getByRole("listitem").filter({ hasText: "Zuzu" }).getByRole("button", { name: en.runs.addTo }).click();
  await expect(page.getByText(en.runs.added)).toBeVisible();
  await expect(page.getByText("Pick-up at 09:00: Zuzu (Meera Sample)")).toBeVisible();
  await narrow(page);
  await shot(page, "m39-runs");

  // The trip is a line of the stay's bill.
  await page.goto(stay);
  await page.getByRole("button", { name: "Make bill" }).click();
  await expect(page.getByText(/^Pick-up for Zuzu \(/)).toBeVisible();
});

test("a new parent books on the booking form, sees an estimate, and staff accept it as a request", async ({ page, browser }) => {
  const parent = await privateWindow(browser);
  await parent.page.goto("/book/demo");
  const p = parent.page;
  await p.getByLabel("Drop-off date").fill(day(30));
  await p.getByLabel("Pick-up date").fill(day(33));
  await expect(p.getByText(/^About ₹[\d,]+ for the nights you chose$/)).toBeVisible();
  await p.getByLabel("Name", { exact: true }).fill("Pepper");
  await p.getByLabel(en.bookingForm.vaccinationsOk).check();
  await p.getByLabel("Your name").fill("Kavya Invented");
  await p.getByLabel("Mobile number").fill("9800000198");
  await p.locator("input[name=consent]").check();
  expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(p, "m41-form");
  await p.getByRole("button", { name: en.bookingForm.send }).click();
  await expect(p.getByText("Thank you. Wagbook Demo Kennel has your request.")).toBeVisible();
  await parent.context.close();

  await signIn(page, "staff");
  await page.goto("/app/more/intake");
  const form = page.getByRole("listitem").filter({ hasText: "Kavya Invented" });
  await expect(form.getByText(en.bookingForm.review.stay)).toBeVisible();
  await expect(form.getByText(en.bookingForm.review.vaccinationsOk)).toBeVisible();
  await form.getByRole("button", { name: "Accept and book" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Pepper" })).toBeVisible();
  await expect(page.getByText("This is a request. It holds no space until you confirm it.")).toBeVisible();
});

test("reviews: with a review link set, Today lists a parent whose pet went home this week", async ({ page }) => {
  await signIn(page, "manager");
  await page.goto("/app/more/settings");
  await page.getByLabel(en.reviews.link).fill("https://g.page/r/demo-review");
  await page.getByRole("button", { name: en.settings.save }).click();
  await expect(page.getByText(en.settings.saved)).toBeVisible();
  await page.goto("/app");
  await expect(page.getByText(en.today.reminderKinds.review).first()).toBeVisible();
  const send = page.getByRole("listitem").filter({ hasText: en.today.reminderKinds.review }).first().getByRole("link", { name: en.today.send });
  await expect(send).toHaveAttribute("href", /g\.page%2Fr%2Fdemo-review/);
  await narrow(page);
  await shot(page, "m42-today");
});
