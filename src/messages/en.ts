/**
 * Every word Wagbook shows, in English. The source for every other language:
 * hi.ts and kn.ts must have exactly this shape (TypeScript checks it, and
 * src/messages/messages.test.ts checks that each translation keeps the same
 * {placeholders}). Plain words for a kennel worker on a phone; see
 * docs/12-glossary.md. Grouped by screen.
 */
import { core } from "./en/core";
import { bookingsArea } from "./en/bookings";
import { careArea } from "./en/care";
import { moneyArea } from "./en/money";
import { petsArea } from "./en/pets";
import { kennelArea } from "./en/kennel";
import { beyondArea } from "./en/beyond";
import { kitchenArea } from "./en/kitchen";
import { appointmentsArea } from "./en/appointments";
import { rulesArea } from "./en/rules";
import { teamArea } from "./en/team";
import { runningArea } from "./en/running";
import { dayArea } from "./en/day";
import { shopArea } from "./en/shop";

export const en = {
  ...core,
  ...bookingsArea,
  ...careArea,
  ...moneyArea,
  ...petsArea,
  ...kennelArea,
  ...beyondArea,
  ...kitchenArea,
  ...appointmentsArea,
  ...rulesArea,
  ...teamArea,
  ...runningArea,
  ...dayArea,
  ...shopArea,
};

export type Messages = typeof en;
