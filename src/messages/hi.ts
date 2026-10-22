/**
 * Every word Wagbook shows, in Hindi: a first draft, to be checked by a native
 * speaker (docs/HANDOFF.md). Same shape as en.ts, assembled from one file per
 * area; src/messages/messages.test.ts checks every key and placeholder.
 */
import type { Messages } from "./en";
import { core } from "./hi/core";
import { bookingsArea } from "./hi/bookings";
import { careArea } from "./hi/care";
import { moneyArea } from "./hi/money";
import { petsArea } from "./hi/pets";
import { kennelArea } from "./hi/kennel";
import { beyondArea } from "./hi/beyond";
import { kitchenArea } from "./hi/kitchen";
import { appointmentsArea } from "./hi/appointments";
import { rulesArea } from "./hi/rules";
import { teamArea } from "./hi/team";

export const hi: Messages = {
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
};
