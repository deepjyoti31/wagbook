/**
 * The public demo (roadmap M10, docs/14-self-hosting.md, "The public demo").
 * Built with NEXT_PUBLIC_WAGBOOK_DEMO=1, Wagbook says on every screen that it
 * is a demo, and the sign-in page gives the invented accounts from
 * supabase/seed.sql. The database is put back every night by
 * deploy/demo-reset.sh. Never set this for a real kennel.
 */
export const IS_DEMO = process.env.NEXT_PUBLIC_WAGBOOK_DEMO === "1";

/** The accounts in supabase/seed.sql. Invented people; the password is public on purpose. */
export const DEMO_ACCOUNTS = [
  { role: "owner", email: "owner@demo.wagbook.test" },
  { role: "manager", email: "manager@demo.wagbook.test" },
  { role: "staff", email: "staff@demo.wagbook.test" },
] as const;
export const DEMO_PASSWORD = "wagbook-demo";
