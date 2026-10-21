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
  await page.getByLabel("Weight in kg").fill("37.5");
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

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
  await page.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "K09" }) }).getByRole("link", { name: "Rocky" }).first().click();
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
