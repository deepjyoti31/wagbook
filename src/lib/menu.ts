import type { Offers } from "@/lib/core";
import type { Messages } from "@/messages";

/**
 * Everything under More, in one list, so the More page and the sidebar on a
 * laptop show the same links to the same people.
 *
 * Reports, expenses and the history are for owners and managers (D20), so staff are not shown them.
 * A link with `when` shows only while the kennel offers that (D44). Links are grouped so the
 * day's work comes first and what is set up once comes after.
 */
export type MenuGroup = keyof Messages["more"]["groups"];
export type MenuKey = keyof Messages["more"]["links"];
type Kennel = Offers & { keeps_rota: boolean };

export const MENU_LINKS: readonly { href: string; key: MenuKey; group: MenuGroup; managers?: boolean; when?: (o: Kennel) => boolean }[] = [
  { href: "/app/bills", key: "bills", group: "daily" },
  { href: "/app/appointments", key: "appointments", group: "daily", when: (o) => o.offers_appointments },
  { href: "/app/more/intake", key: "intake", group: "daily" },
  { href: "/app/more/house", key: "house", group: "daily" },
  { href: "/app/kitchen", key: "kitchen", group: "daily", when: (o) => o.offers_kitchen },
  { href: "/app/food", key: "food", group: "daily", when: (o) => o.offers_food_delivery },
  { href: "/app/shop", key: "shop", group: "daily", when: (o) => o.offers_shop },
  { href: "/app/more/orders", key: "orders", group: "daily", when: (o) => o.offers_kitchen || o.offers_shop },
  { href: "/app/more/reports", key: "reports", group: "money", managers: true },
  { href: "/app/more/expenses", key: "expenses", group: "money", managers: true },
  { href: "/app/more/history", key: "history", group: "money", managers: true },
  { href: "/app/more/people", key: "people", group: "team" },
  { href: "/app/more/rota", key: "rota", group: "team", when: (o) => o.keeps_rota },
  { href: "/app/more/leave", key: "leave", group: "team", when: (o) => o.keeps_rota },
  { href: "/app/more/attendance", key: "attendance", group: "team", when: (o) => o.keeps_rota },
  { href: "/app/more/alerts", key: "alerts", group: "team" },
  { href: "/app/more/settings", key: "settings", group: "setup" },
  { href: "/app/more/kennels", key: "kennels", group: "setup" },
  { href: "/app/more/routines", key: "routines", group: "setup" },
  { href: "/app/more/play", key: "play", group: "setup" },
  { href: "/app/more/extras", key: "extras", group: "setup" },
  { href: "/app/more/peak", key: "peak", group: "setup" },
  { href: "/app/more/cancellation", key: "cancellation", group: "setup" },
  { href: "/app/more/health", key: "health", group: "setup" },
  { href: "/app/more/areas", key: "areas", group: "setup", when: (o) => o.offers_food_delivery },
  { href: "/app/more/appointments", key: "appointmentSetup", group: "setup", when: (o) => o.offers_appointments },
  { href: "/app/more/import", key: "import", group: "upkeep", managers: true },
  { href: "/app/more/photos", key: "photos", group: "upkeep", managers: true },
  { href: "/app/more/problems", key: "problems", group: "upkeep", managers: true },
];

export const MENU_GROUPS: readonly MenuGroup[] = ["daily", "money", "team", "setup", "upkeep"];

/** The links this person sees in this kennel, in order. */
export function menuFor(kennel: Kennel, canManage: boolean) {
  return MENU_LINKS.filter((l) => (canManage || !l.managers) && (!l.when || l.when(kennel)));
}

/** The groups the sidebar on a laptop shows under the main links: the day's work, and the money for those who see it. */
export const SIDEBAR_GROUPS: readonly MenuGroup[] = ["daily", "money"];

/**
 * Which of `hrefs` a path belongs to: the longest one that is the path or a
 * folder above it. Today ("/app") is only ever itself.
 */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const match = href === "/app" ? pathname === "/app" : pathname === href || pathname.startsWith(`${href}/`);
    if (match && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
