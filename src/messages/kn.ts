/**
 * Every word Wagbook shows, in Kannada: a first draft, to be checked by a native
 * speaker (docs/HANDOFF.md). Same shape as en.ts, assembled from one file per
 * area; src/messages/messages.test.ts checks every key and placeholder.
 */
import type { Messages } from "./en";
import { core } from "./kn/core";
import { bookingsArea } from "./kn/bookings";
import { careArea } from "./kn/care";
import { moneyArea } from "./kn/money";
import { petsArea } from "./kn/pets";
import { kennelArea } from "./kn/kennel";
import { beyondArea } from "./kn/beyond";
import { kitchenArea } from "./kn/kitchen";
import { appointmentsArea } from "./kn/appointments";

export const kn: Messages = {
  ...core,
  ...bookingsArea,
  ...careArea,
  ...moneyArea,
  ...petsArea,
  ...kennelArea,
  ...beyondArea,
  ...kitchenArea,
  ...appointmentsArea,
};
