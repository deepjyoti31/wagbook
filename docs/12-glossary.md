# 12. Glossary

The words Wagbook uses, on screen and in code. Use these and no synonyms: a worker who learns "Check in" should never
meet "Admit" or "Arrive" meaning the same thing.

## People

| On screen | In code | Meaning |
| --- | --- | --- |
| Parent | `clients` | The person who brings a pet and pays. Never "owner" on screen: that word means the kennel's owner. Never "customer". |
| Pet | `pets` | The animal staying. Usually a dog. "Dog" is fine in a sentence about dogs; labels say "Pet". |
| Owner | `member_role = 'owner'` | A person with full control of a kennel business. |
| Manager | `member_role = 'manager'` | Runs the kennel day to day, including prices and settings. |
| Staff | `member_role = 'staff'` | Looks after the pets and the bookings. |
| People | `memberships` | Everyone who works at a kennel. |
| Invitation | a membership with no `accepted_at` | An offer to join a kennel, waiting for the person's answer. |

## Places

| On screen | In code | Meaning |
| --- | --- | --- |
| Kennel (the business) | `organizations` | One kennel business. In code and docs, "organisation" when it must be told apart from the next row. |
| Kennel (the room) | `kennels` | The unit one pet sleeps in. Shown as a door tag: K07. |
| In service, out of service | `kennels.is_active` | Whether a kennel can be booked. |
| Yard | `play_yards` | A play area used by one pet at a time. |

## Stays

| On screen | In code | Meaning |
| --- | --- | --- |
| Booking | `bookings` | One pet's reserved stay. |
| Stay | a booking, from the parent's side | Used on parent pages: "Bruno's stay". |
| Boarding | `kind = 'boarding'` | Overnight. Charged per night. |
| Day boarding | `kind = 'daycare'` | Daytime only. Charged per day. Never "daycare" on screen. |
| Night | `end_date - start_date` | The unit of boarding. 14th to 17th is three nights. |
| Check-in date, check-out date | `start_date`, `end_date` | Dates at the kennel. |
| Requested | `status = 'requested'` | Asked for, not confirmed. Holds no space. |
| Confirmed | `status = 'confirmed'` | Space is held. |
| In house | `status = 'checked_in'` | The pet is here now. |
| Checked out | `status = 'checked_out'` | Gone home. |
| Cancelled | `status = 'cancelled'` | |
| Did not arrive | `status = 'no_show'` | |
| Check in, Check out | `checkIn`, `checkOut` | The actions. Two words as a verb, hyphenated as a noun or adjective ("check-in date"). |
| Arriving | confirmed and due today or earlier | The list on Today. |
| Was due, Was due to leave | late arrival, overstay | Red badges on Today. |
| Capacity | count of kennels in service | The most pets that can be in house on one day. |
| Peak period | `peak_periods` | Named dates when special rules apply, such as a festival week. |
| Extra | `services.kind = 'addon'`, `booking_items` | Something added to a stay: a groom, a vet visit. |
| Usual price | `services.is_default` | The price filled in on a new booking. |
| Belongings | `bookings.belongings` | What came with the pet and must go home with it. |

## Care

| On screen | In code | Meaning |
| --- | --- | --- |
| Routine | `care_items` | Something done every day: for every pet, or for one. |
| Task | `care_tasks` | A routine for one pet on one day, to be ticked. |
| Done, Skipped | `task_status` | A skipped task has a note saying why. |
| Play session | `play_sessions` | One pet, one yard, one stretch of time. |
| Solo play | the exclusion constraints on play sessions | Pets are never in a yard together. |
| Update | `stay_updates` | A note, with or without photos, about a pet's day. |
| Incident | `incidents` | Something that went wrong, recorded with what was done about it. |
| Staff should know | `pets.flags` | Short red warnings: escape risk, bite history, and so on. |

## Money

| On screen | In code | Meaning |
| --- | --- | --- |
| Bill | `invoices`, for a kennel with tax off | What the parent owes. |
| Tax invoice | `invoices.is_tax_invoice` | The same, from a tax-registered kennel. |
| Draft | `invoice_status = 'draft'` | A bill being prepared. No number. |
| Issued | `invoice_status = 'issued'` | Numbered and frozen. |
| Void | `invoice_status = 'void'` | Cancelled after issue. The number stays used. |
| Payment | `payments` | Money received. Wagbook records it; it does not move it. |
| Advance | a payment with no invoice | Paid before the bill exists. |
| Refund | `payments.direction = 'out'` | Money given back. The amount is still a positive number. |
| Due | `invoice_balances.due_minor` | Total less what has been paid. |
| Round off | `round_off_minor` | The few paise that make a total a whole rupee. |
| UPI ID | `upi_vpa` | Like `name@bank`. "VPA" is never shown on screen. |

## Parents' pages

| On screen | In code | Meaning |
| --- | --- | --- |
| Intake form, "your intake link" | `/i/{slug}`, `intake_submissions` | The form a parent fills in before a first stay. |
| Forms from parents | the review screen | Submissions waiting for staff. |
| Link name | `organizations.slug` | The last part of the intake link. |
| Stay page | `/s/{token}` | What a parent sees about one stay. |
| Junk | `intake_status = 'spam'` | |

## Technical words used in these docs

| Word | Meaning |
| --- | --- |
| Row level security (RLS) | Postgres rules deciding which rows each user can see and change. |
| Policy | One such rule. |
| Tenant | One organisation's data, kept apart from every other's. |
| Migration | A SQL file that changes the database's structure. |
| Minor units | Paise (or cents). ₹1,200.00 is 120000. |
| Basis points | Hundredths of a percent. 18% is 1800. |
| E.164 | The international phone format: `+919876543210`. |
| Server Action | A function on the server that a form calls. |
| Exclusion constraint | A Postgres rule that no two rows may overlap in some way. How double booking is prevented. |
| `security definer` | A function that runs with its author's rights instead of the caller's. Used sparingly. |
| Publishable key | Supabase's public key identifying a project. Safe in a browser. Older name: anon key. |
| Service role key | Supabase's all-powerful key. Wagbook never uses it. |
| PGlite | Postgres running inside the test process. |

## Words Wagbook does not use on screen

Customer, client, guest, animal, admit, discharge, occupancy, inventory, SKU, VPA, tenant, organisation, record,
entity, dashboard.
