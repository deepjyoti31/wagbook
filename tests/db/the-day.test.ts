import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { admin, as, createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";
import { bookAppointment, seedAppointments, type Appointments } from "./appointment-fixtures";

/**
 * Phase 6 (M50 to M57, D52): the day, smoother. Kennels to clean, house jobs
 * and repairs, a pet that has passed away, stay reports, photo proof on care
 * tasks, a parent's own supplies, trial days and vet visits.
 */

let db: PGlite;
let k: Kennel;
let manager: string;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 8, pets: 3 });
  manager = await addMember(db, k, "manager");
  staff = await addMember(db, k, "staff");
});
afterAll(() => db.close());

const today = () => dayFromToday(db, k, 0);
const toClean = (kennel: string) =>
  q<{ id: string; cleaned_at: string | null; cleaned_by: string | null }>(
    db, staff, "select id, cleaned_at::text, cleaned_by from public.kennel_cleans where kennel_id = $1 order by left_at", [kennel],
  );

describe("kennels to clean between guests (M50)", () => {
  it("leaves a kennel to clean when its pet is checked out, and clean again after Cleaned", async () => {
    const stay = await book(db, k, { pet: k.pets[0], start: await dayFromToday(db, k, -2), end: await today(), kennel: k.kennels[0] });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]);
    expect(await toClean(k.kennels[0])).toEqual([]);
    await q(db, staff, "update public.bookings set status = 'checked_out' where id = $1", [stay]);
    const [open] = await toClean(k.kennels[0]);
    expect(open.cleaned_at).toBeNull();

    await q(db, staff, "update public.kennel_cleans set cleaned_at = '2000-01-01' where id = $1", [open.id]);
    const [done] = await toClean(k.kennels[0]);
    expect(done.cleaned_by).toBe(staff);
    expect(new Date(done.cleaned_at!).getFullYear()).toBeGreaterThan(2000);
    // Cleaned stays cleaned, and who did it is kept.
    const again = await errorOf(async () => q(db, manager, "update public.kennel_cleans set cleaned_at = null where id = $1", [open.id]));
    expect(again.message).toContain("WB250");
  });

  it("waits for the last pet: a sibling still in the kennel keeps it from being asked for", async () => {
    const start = await dayFromToday(db, k, -1);
    const end = await dayFromToday(db, k, 2);
    const a = await book(db, k, { pet: k.pets[1], start, end, kennel: k.kennels[1] });
    const b = await book(db, k, { pet: k.pets[2], start, end, kennel: k.kennels[1] });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = any($1)", [[a, b]]);
    await q(db, staff, "update public.bookings set status = 'checked_out' where id = $1", [a]);
    expect(await toClean(k.kennels[1])).toEqual([]);
    await q(db, staff, "update public.bookings set status = 'checked_out' where id = $1", [b]);
    expect(await toClean(k.kennels[1])).toHaveLength(1);
  });

  it("is written only by the database, and only seen by the kennel's own people", async () => {
    const e = await errorOf(async () => q(db, manager, "insert into public.kennel_cleans (org_id, kennel_id) values ($1, $2)", [k.org, k.kennels[2]]));
    expect(e.code).toBe("42501");
    const other = await seedKennel(db);
    expect(await q(db, other.owner, "select id from public.kennel_cleans")).toEqual([]);
  });
});

describe("jobs that are not about a pet (M51)", () => {
  it("are set by owners and managers, ticked by anyone with who and when", async () => {
    const refused = await q(db, staff, "insert into public.house_jobs (org_id, list, label) values ($1, 'opening', 'Lights on') returning id", [k.org]).catch((e) => e);
    expect(refused).toBeInstanceOf(Error);
    const [{ id: job }] = await q<{ id: string }>(db, manager, "insert into public.house_jobs (org_id, list, label) values ($1, 'opening', 'Gates unlocked') returning id", [k.org]);
    const [tick] = await q<{ done_by: string; done_at: string | null }>(
      db, staff, "insert into public.house_job_days (org_id, job_id, job_date) values ($1, $2, $3) returning done_by, done_at::text", [k.org, job, await today()],
    );
    expect(tick.done_by).toBe(staff);
    expect(tick.done_at).not.toBeNull();
    // Undone, it is pending again with nobody on record.
    const [undone] = await q<{ done_by: string | null }>(db, staff, "update public.house_job_days set status = 'pending' where job_id = $1 returning done_by", [job]);
    expect(undone.done_by).toBeNull();
  });

  it("repairs are reported and fixed by anyone; the cost becomes an expense for owners and managers", async () => {
    const [{ id: repair }] = await q<{ id: string }>(db, staff, "insert into public.repairs (org_id, what) values ($1, 'Pump in yard 2') returning id", [k.org]);
    await q(db, staff, "update public.repairs set fixed_at = now(), cost_minor = 150000 where id = $1", [repair]);
    const byStaff = await errorOf(async () => q(db, staff, "select public.cost_to_expense($1, 'repair', $2, 'Repairs')", [k.org, repair]));
    expect(byStaff.message).toContain("WB002");
    const [{ e }] = await q<{ e: string }>(db, manager, "select public.cost_to_expense($1, 'repair', $2, 'Repairs') as e", [k.org, repair]);
    const [expense] = await q<{ amount_minor: number; category: string; description: string }>(db, manager, "select amount_minor::int, category, description from public.expenses where id = $1", [e]);
    expect(expense).toEqual({ amount_minor: 150000, category: "Repairs", description: "Pump in yard 2" });
    const [linked] = await q<{ expense_id: string }>(db, staff, "select expense_id from public.repairs where id = $1", [repair]);
    expect(linked.expense_id).toBe(e);
    // A second time gives the same expense, not another.
    const [{ again }] = await q<{ again: string }>(db, manager, "select public.cost_to_expense($1, 'repair', $2, 'Repairs') as again", [k.org, repair]);
    expect(again).toBe(e);
    const staffLink = await errorOf(async () => q(db, staff, "update public.repairs set expense_id = null where id = $1", [repair]));
    expect(staffLink.message).toContain("WB002");
  });
});

describe("a pet that has passed away (M52)", () => {
  let kitchen: Kitchen;
  let kManager: string;
  let kStaff: string;

  beforeAll(async () => {
    kitchen = await seedKitchen(db);
    kManager = await addMember(db, kitchen, "manager");
    kStaff = await addMember(db, kitchen, "staff");
  });

  it("leaves nothing to send or make: stays cancelled, food ended, no vaccination reminder", async () => {
    const pet = kitchen.pets[0];
    const day = (n: number) => dayFromToday(db, kitchen, n);
    // A subscription with deliveries made ahead, a stay to come and a vaccination running out before it.
    const [{ id: sub }] = await q<{ id: string }>(
      db, kitchen.owner,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, starts_on) values ($1, $2, $3, $4, 300, '{1,2,3,4,5,6,7}', $5) returning id",
      [kitchen.org, kitchen.client, pet, kitchen.subscriptionFood, await day(3)],
    );
    await q(db, kitchen.owner, "select public.plan_subscription($1, $2)", [sub, await day(20)]);
    const stay = await book(db, kitchen, { pet, start: await day(5), end: await day(8) });
    await q(db, kStaff, "insert into public.vaccinations (org_id, pet_id, vaccine, valid_until) values ($1, $2, 'rabies', $3)", [kitchen.org, pet, await day(6)]);
    expect((await q(db, kStaff, "select id from public.deliveries where pet_id = $1 and status = 'planned'", [pet])).length).toBeGreaterThan(0);

    const refused = await errorOf(async () => q(db, kStaff, "update public.pets set passed_away_on = $2 where id = $1", [pet, await day(0)]));
    expect(refused.message).toContain("WB251");
    const later = await errorOf(async () => q(db, kManager, "update public.pets set passed_away_on = $2 where id = $1", [pet, await day(1)]));
    expect(later.message).toContain("WB252");

    await q(db, kManager, "update public.pets set passed_away_on = $2 where id = $1", [pet, await day(-1)]);
    const [marked] = await q<{ passed_away_by: string }>(db, kStaff, "select passed_away_by from public.pets where id = $1", [pet]);
    expect(marked.passed_away_by).toBe(kManager);

    // Nothing left to send: the stay (and so its arrival and vaccination reminders) is cancelled with no charge.
    const [b] = await q<{ status: string; cancel_reason: string }>(db, kStaff, "select status, cancel_reason from public.bookings where id = $1", [stay]);
    expect(b).toEqual({ status: "cancelled", cancel_reason: "Passed away" });
    expect(await q(db, kStaff, "select id from public.bookings where pet_id = $1 and status in ('requested', 'confirmed', 'checked_in')", [pet])).toEqual([]);
    // The food ends, and no delivery is still to go.
    const [s] = await q<{ cancelled_on: string }>(db, kStaff, "select cancelled_on::text from public.subscriptions where id = $1", [sub]);
    expect(s.cancelled_on).toBe(await day(0));
    expect(await q(db, kStaff, "select id from public.deliveries where pet_id = $1 and status not in ('cancelled')", [pet])).toEqual([]);

    // Nothing new is booked or made for it.
    const again = await errorOf(async () => book(db, kitchen, { pet, start: await day(30), end: await day(32) }, kManager));
    expect(again.message).toContain("WB254");
    const food = await errorOf(async () => q(db, kitchen.owner,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, starts_on) values ($1, $2, $3, $4, 300, '{1}', $5)",
      [kitchen.org, kitchen.client, pet, kitchen.subscriptionFood, await day(3)]));
    expect(food.message).toContain("WB254");
  });

  it("leaves the parent's booking link, which refuses a request for it", async () => {
    const pet = kitchen.pets[0];
    const [{ token }] = await q<{ token: string }>(db, kStaff, "select public.renew_request_link($1) as token", [kitchen.client]);
    await q(db, kitchen.owner, "update public.organizations set requests_enabled = true where id = $1", [kitchen.org]);
    await q(db, kitchen.owner, "insert into public.services (org_id, kind, name, price_minor, is_default) values ($1, 'boarding', 'Boarding', 120000, true)", [kitchen.org]);
    const form = await as(db, { kind: "anon" }, async () => (await db.query<{ f: { pets: { id: string }[] } }>("select public.get_public_booking_form($1) as f", [token])).rows[0].f);
    expect(form.pets.map((p) => p.id)).not.toContain(pet);
    expect(form.pets).toHaveLength(2);
    const asked = await errorOf(async () => as(db, { kind: "anon" }, () =>
      db.query("select public.submit_booking_request($1, $2)", [token, JSON.stringify({ kind: "boarding", pet_ids: [pet], start_date: "2099-01-01", end_date: "2099-01-03" })])));
    expect(asked.message).toMatch(/WB10[23]/);
  });

  it("is undone within a week of marking it, and not after", async () => {
    const pet = kitchen.pets[1];
    await q(db, kManager, "update public.pets set passed_away_on = $2 where id = $1", [pet, await dayFromToday(db, kitchen, 0)]);
    await q(db, kManager, "update public.pets set flowers_sent_at = now() where id = $1", [pet]);
    await q(db, kManager, "update public.pets set passed_away_on = null where id = $1", [pet]);
    const [back] = await q<{ passed_away_at: string | null; flowers_sent_at: string | null }>(db, kStaff, "select passed_away_at, flowers_sent_at from public.pets where id = $1", [pet]);
    expect(back).toEqual({ passed_away_at: null, flowers_sent_at: null });

    await q(db, kManager, "update public.pets set passed_away_on = $2 where id = $1", [pet, await dayFromToday(db, kitchen, 0)]);
    await as(db, admin, () => db.query("update public.pets set passed_away_at = now() - interval '8 days' where id = $1", [pet]));
    const late = await errorOf(async () => q(db, kManager, "update public.pets set passed_away_on = null where id = $1", [pet]));
    expect(late.message).toContain("WB253");
  });

  it("cancels its appointments still to come", async () => {
    const a: Appointments = await seedAppointments(db);
    const aManager = await addMember(db, a, "manager");
    const appt = await bookAppointment(db, a.owner, a, { pet: a.pets[0], service: a.swim, day: await dayFromToday(db, a, 3), time: "10:00" });
    await q(db, aManager, "update public.pets set passed_away_on = $2 where id = $1", [a.pets[0], await dayFromToday(db, a, 0)]);
    const [x] = await q<{ status: string }>(db, aManager, "select status from public.appointments where id = $1", [appt]);
    expect(x.status).toBe("cancelled");
    const e = await errorOf(async () => bookAppointment(db, a.owner, a, { pet: a.pets[0], service: a.swim, day: await dayFromToday(db, a, 4), time: "10:00" }));
    expect(e.message).toContain("WB254");
  });
});

describe("a stay report at check-out (M53)", () => {
  it("shows on the stay page once the pet has gone home, worked out from the stay's records", async () => {
    const pet = await strangerPet(db, k);
    const stay = await book(db, k, { pet, start: await dayFromToday(db, k, -2), end: await today(), kennel: k.kennels[2] });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]);
    await q(db, manager, "insert into public.care_items (org_id, kind, label, due_time) values ($1, 'meal', 'Dinner', '18:00')", [k.org]);
    await q(db, staff, "select public.generate_care_tasks($1, $2)", [k.org, await today()]);
    await q(db, staff, "update public.care_tasks set status = 'done' where booking_id = $1 and kind = 'meal'", [stay]);
    const [{ id: update }] = await q<{ id: string }>(
      db, staff, "insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths) values ($1, $2, $3, 'Happy', $4) returning id",
      [k.org, stay, pet, [`${k.org}/updates/x/1.jpg`]],
    );
    const [{ id: hidden }] = await q<{ id: string }>(
      db, staff, "insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths, is_visible_to_parent) values ($1, $2, $3, 'For the team', $4, false) returning id",
      [k.org, stay, pet, [`${k.org}/updates/y/1.jpg`]],
    );
    expect(update && hidden).toBeTruthy();
    // Only photos the parent was shown on this stay.
    const wrong = await errorOf(async () => q(db, staff, "insert into public.stay_reports (org_id, booking_id, photo_paths) values ($1, $2, $3)", [k.org, stay, [`${k.org}/updates/y/1.jpg`]]));
    expect(wrong.message).toContain("WB261");
    await q(db, staff, "insert into public.stay_reports (org_id, booking_id, words, photo_paths) values ($1, $2, 'A lovely guest', $3)", [k.org, stay, [`${k.org}/updates/x/1.jpg`]]);

    const [{ token }] = await q<{ token: string }>(db, staff, "select public_token as token from public.bookings where id = $1", [stay]);
    const page = () => as(db, { kind: "anon" }, async () => (await db.query<{ p: { report: Record<string, unknown> | null } }>("select public.get_public_stay($1) as p", [token])).rows[0].p);
    expect((await page()).report).toBeNull();
    await q(db, staff, "update public.bookings set status = 'checked_out' where id = $1", [stay]);
    const report = (await page()).report!;
    expect(report.words).toBe("A lovely guest");
    expect(report.photos).toEqual([`${k.org}/updates/x/1.jpg`]);
    expect(report.tasks).toEqual([{ kind: "meal", label: "Dinner", status: "done" }]);
  });

  it("is only for a stay in the kennel or gone home", async () => {
    const stay = await book(db, k, { pet: k.pets[0], start: await dayFromToday(db, k, 40), end: await dayFromToday(db, k, 42) });
    const e = await errorOf(async () => q(db, staff, "insert into public.stay_reports (org_id, booking_id, words) values ($1, $2, 'Too soon')", [k.org, stay]));
    expect(e.message).toContain("WB260");
  });
});

describe("photo proof on care tasks (M54)", () => {
  it("a task that wants a photo cannot be ticked without one, and cannot be told it does not", async () => {
    const pet = k.pets[1];
    const stay = await book(db, k, { pet, start: await today(), end: await dayFromToday(db, k, 3), kennel: k.kennels[0] });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]);
    await q(db, staff, "insert into public.care_items (org_id, pet_id, kind, label, due_time, needs_photo) values ($1, $2, 'medication', 'Clean the wound', '09:00', true)", [k.org, pet]);
    await q(db, staff, "select public.generate_care_tasks($1, $2)", [k.org, await today()]);
    const [task] = await q<{ id: string; needs_photo: boolean }>(db, staff, "select id, needs_photo from public.care_tasks where booking_id = $1 and label = 'Clean the wound'", [stay]);
    expect(task.needs_photo).toBe(true);

    const bare = await errorOf(async () => q(db, staff, "update public.care_tasks set status = 'done' where id = $1", [task.id]));
    expect(bare.message).toContain("care_tasks_done_with_photo");
    const sneaky = await errorOf(async () => q(db, staff, "update public.care_tasks set status = 'done', needs_photo = false where id = $1", [task.id]));
    expect(sneaky.message).toContain("care_tasks_done_with_photo");
    const [done] = await q<{ status: string }>(db, staff, "update public.care_tasks set status = 'done', photo_path = $2 where id = $1 returning status", [task.id, `${k.org}/care/${task.id}/1.jpg`]);
    expect(done.status).toBe("done");
  });
});

describe("a parent's own food and medicines (M55)", () => {
  it("counts down as meals are ticked, and says when it will not last the stay", async () => {
    const pet = await strangerPet(db, k);
    const stay = await book(db, k, { pet, start: await today(), end: await dayFromToday(db, k, 4) });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]);
    // Dinner (above) and breakfast: two meals a day of 100 g, and 1,000 g brought: five days.
    await q(db, manager, "insert into public.care_items (org_id, kind, label, due_time) values ($1, 'meal', 'Breakfast', '08:00')", [k.org]);
    await q(db, staff, "insert into public.stay_supplies (org_id, booking_id, pet_id, kind, label, brought, per_task) values ($1, $2, $3, 'food', 'Own kibble', 1000, 100)", [k.org, stay, pet]);
    const left = async () =>
      (await q<{ left_amount: number; days_left: number; days_to_go: number; runs_short: boolean }>(
        db, staff, "select left_amount, days_left, days_to_go, runs_short from public.stay_supply_left where booking_id = $1", [stay],
      ))[0];
    expect(await left()).toEqual({ left_amount: 1000, days_left: 5, days_to_go: 4, runs_short: false });

    await q(db, staff, "select public.generate_care_tasks($1, $2)", [k.org, await today()]);
    await q(db, staff, "update public.care_tasks set status = 'done' where booking_id = $1 and kind = 'meal'", [stay]);
    expect(await left()).toEqual({ left_amount: 800, days_left: 4, days_to_go: 4, runs_short: false });

    // Two days more of the stay, and it falls short.
    await q(db, manager, "update public.bookings set end_date = $2 where id = $1", [stay, await dayFromToday(db, k, 6)]);
    expect(await left()).toMatchObject({ days_left: 4, days_to_go: 6, runs_short: true });
    // In the parent's export, with the stay.
    const [{ client }] = await q<{ client: string }>(db, manager, "select client_id as client from public.pets where id = $1", [pet]);
    const [{ x }] = await q<{ x: { stays: { supplies: { label: string }[] }[] } }>(db, manager, "select public.export_client($1) as x", [client]);
    expect(x.stays[0].supplies.map((v) => v.label)).toEqual(["Own kibble"]);
  });
});

describe("a trial day (M56)", () => {
  it("is day boarding, and only a trial has a result", async () => {
    const day = await dayFromToday(db, k, 50);
    const e = await errorOf(async () => q(db, manager,
      "insert into public.bookings (org_id, client_id, pet_id, kind, start_date, end_date, rate_minor, is_trial) values ($1, $2, $3, 'boarding', $4, $5, 0, true)",
      [k.org, k.client, k.pets[0], day, await dayFromToday(db, k, 52)]));
    expect(e.message).toContain("bookings_trial_is_a_day");
    const trial = await book(db, k, { pet: k.pets[0], start: day, end: day, kind: "daycare", rate: 0 });
    const noTrial = await errorOf(async () => q(db, staff, "update public.bookings set trial_outcome = 'anxious' where id = $1", [trial]));
    expect(noTrial.message).toContain("bookings_trial_outcome_on_trial");
    await q(db, staff, "update public.bookings set is_trial = true where id = $1", [trial]);
    const [b] = await q<{ trial_outcome: string }>(db, staff, "update public.bookings set trial_outcome = 'anxious', trial_note = 'Barked at the gate' where id = $1 returning trial_outcome", [trial]);
    expect(b.trial_outcome).toBe("anxious");
  });
});

describe("vet visits during a stay (M57)", () => {
  it("records the visit, the line on the bill, the expense and the medicine's care task in one step", async () => {
    const pet = await strangerPet(db, k);
    const stay = await book(db, k, { pet, start: await dayFromToday(db, k, -1), end: await dayFromToday(db, k, 3) });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]);
    const [{ visit }] = await q<{ visit: string }>(
      db, manager,
      "select public.record_vet_visit($1, $2, $3, 'Limping', 'City Vet', 'A sprain. Rest for a week.', 80000, 'Vet visit: Limping', 'Vet', $4) as visit",
      [k.org, stay, await today(), JSON.stringify([{ label: "Painkiller", details: "Half a tablet with food", due_time: "20:00" }])],
    );
    const [v] = await q<{ pet_id: string; booking_item_id: string; expense_id: string }>(db, manager, "select pet_id, booking_item_id, expense_id from public.vet_visits where id = $1", [visit]);
    expect(v.pet_id).toBe(pet);
    const [line] = await q<{ description: string; unit_price_minor: number }>(db, staff, "select description, unit_price_minor::int from public.booking_items where id = $1", [v.booking_item_id]);
    expect(line).toEqual({ description: "Vet visit: Limping", unit_price_minor: 80000 });
    const [expense] = await q<{ amount_minor: number; category: string; booking_id: string; is_reimbursable: boolean }>(
      db, manager, "select amount_minor::int, category, booking_id, is_reimbursable from public.expenses where id = $1", [v.expense_id],
    );
    expect(expense).toEqual({ amount_minor: 80000, category: "Vet", booking_id: stay, is_reimbursable: true });
    await q(db, staff, "select public.generate_care_tasks($1, $2)", [k.org, await today()]);
    const tasks = await q<{ label: string; kind: string }>(db, staff, "select label, kind from public.care_tasks where booking_id = $1 and label = 'Painkiller'", [stay]);
    expect(tasks).toEqual([{ label: "Painkiller", kind: "medication" }]);
    // The visit is in the parent's export, with the pet's health record.
    const [{ client }] = await q<{ client: string }>(db, manager, "select client_id as client from public.pets where id = $1", [pet]);
    const [{ x }] = await q<{ x: { pets: { vet_visits: { reason: string }[] }[] } }>(db, manager, "select public.export_client($1) as x", [client]);
    expect(x.pets[0].vet_visits.map((v) => v.reason)).toEqual(["Limping"]);
  });

  it("leaves the expense to an owner or manager when staff record it", async () => {
    const pet = await strangerPet(db, k);
    const stay = await book(db, k, { pet, start: await today(), end: await dayFromToday(db, k, 2) });
    const [{ visit }] = await q<{ visit: string }>(
      db, staff, "select public.record_vet_visit($1, $2, $3, 'Ear check', null, null, 50000, 'Vet visit', 'Vet', '[]') as visit", [k.org, stay, await today()],
    );
    const [v] = await q<{ booking_item_id: string | null; expense_id: string | null }>(db, staff, "select booking_item_id, expense_id from public.vet_visits where id = $1", [visit]);
    expect(v.booking_item_id).not.toBeNull();
    expect(v.expense_id).toBeNull();
    const [{ e }] = await q<{ e: string }>(db, manager, "select public.cost_to_expense($1, 'vet', $2, 'Vet') as e", [k.org, visit]);
    expect(e).toBeTruthy();
    const future = await errorOf(async () => q(db, staff, "select public.record_vet_visit($1, $2, $3, 'Later', null, null, 0, null, null, '[]')", [k.org, stay, await dayFromToday(db, k, 1)]));
    expect(future.message).toContain("WB256");
    const other = await seedKennel(db);
    const stranger = await errorOf(async () => q(db, other.owner, "select public.record_vet_visit($1, $2, $3, 'Not mine', null, null, 0, null, null, '[]')", [k.org, stay, await today()]));
    expect(stranger.message).toContain("WB003");
  });
});
