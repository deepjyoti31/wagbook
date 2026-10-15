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

const languageOf = async (who: string) =>
  (await db.query<{ org_id: string; language: string }>("select org_id, language from public.memberships where user_id = $1 order by org_id", [who])).rows;

describe("each person's language", () => {
  it("is English until the person chooses another", async () => {
    expect((await languageOf(staff)).map((r) => r.language)).toEqual(["en"]);
  });

  it("is set by the person, for every kennel they work at, and for nobody else", async () => {
    // The staff member also works at the other kennel.
    const email = (await db.query<{ email: string }>("select email from auth.users where id = $1", [staff])).rows[0].email;
    await as(db, user(other.owner), () => db.query("select public.invite_member_by_email($1, $2, 'staff', 'Both')", [other.org, email]));
    await as(db, user(staff), () => db.query("select public.respond_to_invitation($1, true)", [other.org]));

    await as(db, user(staff), () => db.query("select public.set_my_language('kn')"));
    expect((await languageOf(staff)).map((r) => r.language)).toEqual(["kn", "kn"]);
    expect((await languageOf(k.owner)).map((r) => r.language)).toEqual(["en"]);
  });

  it("cannot be changed by writing the membership row directly, even by an owner", async () => {
    const e = await errorOf(() => as(db, user(k.owner), () => db.query("update public.memberships set language = 'hi' where user_id = $1", [staff])));
    expect(e.code).toBe("42501");
  });

  it("refuses a language Wagbook does not offer, and someone not signed in", async () => {
    expect((await errorOf(() => as(db, user(staff), () => db.query("select public.set_my_language('fr')")))).message).toContain("WB013");
    expect((await errorOf(() => as(db, anon, () => db.query("select public.set_my_language('hi')")))).code).toBe("42501");
  });
});

describe("the parent pages' language", () => {
  it("is set by owners and managers, not staff", async () => {
    await as(db, user(staff), async () => {
      const r = await db.query("update public.organizations set parent_language = 'hi' where id = $1", [k.org]);
      expect(r.affectedRows).toBe(0);
    });
    const e = await errorOf(() => as(db, user(k.owner), () => db.query("update public.organizations set parent_language = 'fr' where id = $1", [k.org])));
    expect(e.code).toBe("23514");
    await as(db, user(k.owner), () => db.query("update public.organizations set parent_language = 'hi' where id = $1", [k.org]));
  });

  it("reaches the stay page, the bill and the intake form, whose consent wording is stored as the parent read it", async () => {
    const slug = (await db.query<{ slug: string }>("select slug from public.organizations where id = $1", [k.org])).rows[0].slug;
    const booking = await book(db, k, { pet: k.pets[0], start: "2027-05-01", end: "2027-05-03" });
    const token = (await db.query<{ public_token: string }>("select public_token from public.bookings where id = $1", [booking])).rows[0].public_token;

    await as(db, anon, async () => {
      const stay = (await db.query<{ v: { kennel: { language: string } } }>("select public.get_public_stay($1) as v", [token])).rows[0].v;
      expect(stay.kennel.language).toBe("hi");
      const form = (await db.query<{ v: { language: string; notice: string } }>("select public.get_public_intake_form($1) as v", [slug])).rows[0].v;
      expect(form.language).toBe("hi");
      expect(form.notice).toContain("मैं सहमत हूँ");
      expect(form.notice).toContain("Test Kennel");
      await db.query("select public.submit_intake($1, $2::jsonb)", [
        slug,
        JSON.stringify({ v: 1, parent: { name: "Asha", phone: "+919811100001" }, pets: [{ name: "Moti" }], stay: { kind: "boarding" }, consent: true }),
      ]);
    });
    const stored = await db.query<{ consent_text: string }>("select consent_text from public.intake_submissions where org_id = $1", [k.org]);
    expect(stored.rows[0].consent_text).toContain("मैं सहमत हूँ");

    await as(db, user(k.owner), () => db.query("update public.organizations set parent_language = 'kn' where id = $1", [k.org]));
    const kn = await as(db, anon, async () => (await db.query<{ v: { notice: string } }>("select public.get_public_intake_form($1) as v", [slug])).rows[0].v);
    expect(kn.notice).toContain("ನಾನು ಒಪ್ಪುತ್ತೇನೆ");
  });

  it("is on the parent's bill", async () => {
    const id = await as(db, user(k.owner), async () => {
      const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id) values ($1, $2) returning id", [k.org, k.client]);
      await db.query("select public.save_invoice_draft($1, $2, $3)", [
        r.rows[0].id,
        JSON.stringify({ subtotal_minor: 1000, discount_minor: 0, taxable_minor: 1000, cgst_minor: 0, sgst_minor: 0, igst_minor: 0, tax_minor: 0, round_off_minor: 0, total_minor: 1000 }),
        JSON.stringify([{ sort_order: 0, description: "Bath", sac_code: null, quantity: 1, unit_price_minor: 1000, discount_minor: 0, taxable_minor: 1000, tax_rate_bp: 0, cgst_minor: 0, sgst_minor: 0, igst_minor: 0, tax_minor: 0, total_minor: 1000 }]),
      ]);
      await db.query("select public.issue_invoice($1)", [r.rows[0].id]);
      return r.rows[0].id;
    });
    const token = (await db.query<{ public_token: string }>("select public_token from public.invoices where id = $1", [id])).rows[0].public_token;
    const bill = await as(db, anon, async () => (await db.query<{ v: { language: string } }>("select public.get_public_invoice($1) as v", [token])).rows[0].v);
    expect(bill.language).toBe("kn");
  });
});
