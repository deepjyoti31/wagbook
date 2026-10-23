# Error codes

> GENERATED FILE. Do not edit by hand. Run `npm run gen:db` after changing anything in `supabase/migrations`.

Every error the database raises on purpose starts with a code like `WB020`. The app shows the text after the code to the
person (see `src/lib/errors.ts`); the code is for searching logs, tests and issues. A `%` in a message is filled in with a
value when the error is raised.

Rules: a code is never reused or renumbered. A new error takes the next free number in its range.

| Range | Area |
| --- | --- |
| WB001 to WB009 | Signing in, permission and not found |
| WB010 to WB019 | Organisations and people |
| WB020 to WB029 | Bookings and capacity |
| WB030 to WB039 | Invoices |
| WB040 to WB049 | The public intake form |
| WB050 to WB059 | Bills and payments (continued) |
| WB060 to WB069 | Reports and expenses |
| WB070 to WB079 | A parent's details: export and erase |
| WB080 to WB089 | Daily care and incidents |
| WB090 to WB099 | Credit notes |
| WB100 to WB109 | Booking requests from parents |
| WB110 to WB119 | Day boarding packs |
| WB120 to WB129 | Refunds |
| WB130 to WB139 | Stock |
| WB140 to WB149 | Recipes and portions |
| WB150 to WB159 | Food subscriptions, deliveries and their bills |
| WB160 to WB169 | Batches and packing |
| WB170 to WB179 | Delivery runs, riders and problems |
| WB180 to WB189 | Food orders from the website and parents' links |
| WB190 to WB199 | Appointments |
| WB200 to WB209 | Appointments: bills, courses and packages |
| WB210 to WB219 | Health at the door, credit, pick-up and drop |
| WB220 to WB229 | The team: rota, leave and attendance |
| WB230 to WB239 | Kennels in and out of service |
| WB240 to WB249 | Running for real: import and the photo archive |
| WB250 to WB259 | The day: cleaning, house jobs, a pet that passed away, costs as expenses, vet visits |
| WB260 to WB269 | Stay reports |

| Code | Message | Raised in |
| --- | --- | --- |
| `WB001` | sign in first | `20261008000100_foundation.sql` |
| `WB002` | only an owner or manager can invite people<br>only an owner can invite another owner<br>only an owner can change an owner<br>only an owner or manager can change a parent's phone number<br>only an owner or manager can hide a pet or parent, or show one again<br>only an owner or manager can void an invoice<br>only an owner or manager can make a credit note<br>only an owner or manager can merge parents<br>only an owner or manager writes a repair's cost as an expense<br>only an owner or manager writes an expense<br>only an owner or manager can bring in parents and pets<br>only an owner or manager can download photos<br>only an owner or manager can see the space photos take | `20261008000100_foundation.sql`<br>`20261008000200_clients_and_pets.sql`<br>`20261008000300_kennels_and_bookings.sql`<br>`20261008000500_billing.sql`<br>`20261008000570_the_day.sql`<br>`20261008000750_operations.sql` |
| `WB003` | booking not found<br>package not found<br>invoice not found<br>that item was not found<br>that subscription was not found<br>that recipe was not found<br>that stop was not found<br>that could not be found<br>that stay could not be found<br>submission not found<br>parent not found<br>that order was not found | `20261008000450_appointments.sql`<br>`20261008000500_billing.sql`<br>`20261008000550_kitchen.sql`<br>`20261008000570_the_day.sql`<br>`20261008000600_intake_and_public_pages.sql`<br>`20261008001100_privacy.sql` |
| `WB004` | this cannot be moved to another kennel | `20261008000100_foundation.sql` |
| `WB005` | enter the code from your authenticator app first | `20261008000100_foundation.sql` |
| `WB006` | turn on two-step sign-in first | `20261008000100_foundation.sql` |
| `WB007` | that recovery code is not right, or it has been used | `20261008000100_foundation.sql` |
| `WB010` | unknown time zone "%" | `20261008000100_foundation.sql` |
| `WB011` | a kennel must keep at least one active owner | `20261008000100_foundation.sql` |
| `WB012` | you already own the maximum number of kennels | `20261008000100_foundation.sql` |
| `WB013` | that language is not offered yet. | `20261008000100_foundation.sql` |
| `WB014` | enter the person's name | `20261008000100_foundation.sql` |
| `WB015` | that invitation is no longer open | `20261008000100_foundation.sql` |
| `WB016` | that invitation link has expired or was already used. Ask for a new one. | `20261008000100_foundation.sql` |
| `WB017` | you already work at this kennel | `20261008000100_foundation.sql` |
| `WB018` | choose two different parents of this kennel | `20261008000500_billing.sql` |
| `WB019` | this has a stay in the kennel now or still to come. Check it out or cancel it first.<br>this pet's parent is hidden. Show the parent again first. | `20261008000300_kennels_and_bookings.sql` |
| `WB020` | no space on % (% booked, % kennels) | `20261008000300_kennels_and_bookings.sql` |
| `WB021` | that kennel is out of service | `20261008000300_kennels_and_bookings.sql` |
| `WB022` | only an owner or manager can change the price or the kind of stay<br>only an owner or manager can change a price | `20261008000300_kennels_and_bookings.sql`<br>`20261008000450_appointments.sql`<br>`20261008000460_trips_and_health.sql`<br>`20261008000550_kitchen.sql` |
| `WB023` | only an owner or manager can book at a price that is not on your price list | `20261008000300_kennels_and_bookings.sql` |
| `WB024` | bookings made together must all be for one parent | `20261008000300_kennels_and_bookings.sql` |
| `WB025` | only an owner or manager can change what an extra costs | `20261008000300_kennels_and_bookings.sql`<br>`20261008000450_appointments.sql` |
| `WB026` | a pet cannot be moved into or out of a family booking. Book it on its own instead. | `20261008000300_kennels_and_bookings.sql` |
| `WB027` | a kennel holds two pets at most, both of one parent | `20261008000300_kennels_and_bookings.sql` |
| `WB030` | an issued invoice cannot be deleted. Void it instead. | `20261008000500_billing.sql` |
| `WB031` | a void invoice cannot be changed | `20261008000500_billing.sql` |
| `WB032` | an issued invoice cannot be edited. Void it and issue a new one.<br>lines of an issued invoice cannot be changed<br>a line cannot be moved to another invoice | `20261008000500_billing.sql` |
| `WB033` | a draft cannot be voided. Delete it instead. | `20261008000500_billing.sql` |
| `WB034` | use issue_invoice() to issue an invoice<br>an invoice starts as a draft. Use issue_invoice() to issue it. | `20261008000500_billing.sql` |
| `WB035` | this invoice has already been issued | `20261008000500_billing.sql` |
| `WB036` | an invoice needs at least one line | `20261008000500_billing.sql` |
| `WB037` | a discount is larger than its line<br>a line that carries no tax has tax or the wrong amount<br>a line's tax does not match its price and rate<br>a line's taxable value does not match its price<br>a line's CGST and SGST do not match its taxable value and rate<br>a line's IGST does not match its taxable value and rate<br>a line's tax does not match its taxable value and rate<br>invoice totals do not match its lines<br>the round off is not what the kennel's rounding setting gives<br>credit note totals do not match its lines | `20261008000500_billing.sql` |
| `WB038` | use void_invoice() to void an invoice<br>only an issued invoice can be voided | `20261008000500_billing.sql` |
| `WB039` | say why the invoice is being voided | `20261008000500_billing.sql` |
| `WB040` | this form is not accepting submissions | `20261008000600_intake_and_public_pages.sql` |
| `WB041` | the form could not be read | `20261008000600_intake_and_public_pages.sql` |
| `WB042` | please tick the consent box | `20261008000600_intake_and_public_pages.sql` |
| `WB043` | please enter your name | `20261008000600_intake_and_public_pages.sql` |
| `WB044` | please enter a valid mobile number | `20261008000600_intake_and_public_pages.sql` |
| `WB045` | please add between one and six pets | `20261008000600_intake_and_public_pages.sql` |
| `WB046` | every pet needs a name | `20261008000600_intake_and_public_pages.sql` |
| `WB047` | the stay dates are not valid<br>check-out is before check-in | `20261008000600_intake_and_public_pages.sql` |
| `WB048` | too many submissions right now. Please try again in a while.<br>we already have your form. The kennel will be in touch. | `20261008000600_intake_and_public_pages.sql` |
| `WB049` | this form has already been dealt with<br>this form was declined and cannot be accepted | `20261008000600_intake_and_public_pages.sql` |
| `WB050` | only an owner or manager can issue a bill that differs from its booking | `20261008000500_billing.sql` |
| `WB051` | only a draft bill can be changed | `20261008000500_billing.sql` |
| `WB052` | the currency and the month the financial year starts cannot change once a bill has been issued | `20261008000500_billing.sql` |
| `WB053` | this pet was booked together with others. Bill the family together. | `20261008000500_billing.sql` |
| `WB054` | that family booking was not found for this parent | `20261008000500_billing.sql` |
| `WB055` | this day is part of a repeating booking. Bill the month's days together. | `20261008000500_billing.sql` |
| `WB056` | that repeating booking was not found for this parent | `20261008000500_billing.sql` |
| `WB057` | this day is on its month's bill. Cancel it and book the new day instead. | `20261008000500_billing.sql` |
| `WB060` | Reports are for owners and managers. | `20261008001000_reports.sql` |
| `WB061` | Choose a period of a year or less, with the start before the end. | `20261008001000_reports.sql` |
| `WB070` | only an owner or manager can export or erase a parent's details | `20261008001100_privacy.sql` |
| `WB071` | a pet of this parent is in the kennel now. Check it out first. | `20261008001100_privacy.sql` |
| `WB072` | this parent has stays still to come. Cancel them first. | `20261008001100_privacy.sql` |
| `WB073` | this parent's details have already been erased | `20261008001100_privacy.sql` |
| `WB074` | only an owner can erase a parent's details | `20261008001100_privacy.sql` |
| `WB075` | this parent has food deliveries still to come. Cancel them first. | `20261008001100_privacy.sql` |
| `WB076` | this parent has appointments still to come. Cancel them first. | `20261008001100_privacy.sql` |
| `WB080` | only an owner or manager can change what an incident says | `20261008000400_daily_care.sql` |
| `WB081` | only an owner can take a photo off an update | `20261008000400_daily_care.sql` |
| `WB090` | a credit note is made against an issued bill | `20261008000500_billing.sql` |
| `WB091` | say why the bill is being credited, in under 500 characters | `20261008000500_billing.sql` |
| `WB092` | a credit note cannot take back more than is left on the bill | `20261008000500_billing.sql` |
| `WB093` | a credit note line must use a tax rate that is on the bill | `20261008000500_billing.sql` |
| `WB094` | a credit note needs at least one line | `20261008000500_billing.sql` |
| `WB095` | this bill was issued in an earlier month. Make a credit note instead of cancelling it. | `20261008000500_billing.sql` |
| `WB096` | this bill has a credit note. Credit what is left instead of cancelling it. | `20261008000500_billing.sql` |
| `WB100` | this link is not taking requests | `20261008000600_intake_and_public_pages.sql` |
| `WB101` | the request could not be read | `20261008000600_intake_and_public_pages.sql` |
| `WB102` | choose one or more of your pets | `20261008000600_intake_and_public_pages.sql` |
| `WB103` | those dates cannot be asked for. Check them and try again. | `20261008000600_intake_and_public_pages.sql` |
| `WB104` | the kennel is not taking requests for that kind of stay | `20261008000600_intake_and_public_pages.sql` |
| `WB105` | that is a lot of requests for one day. The kennel will be in touch. | `20261008000600_intake_and_public_pages.sql` |
| `WB110` | a day boarding pack is for day boarding of the parent who bought it | `20261008000500_billing.sql` |
| `WB111` | the pack is for % to %, and these days are outside it | `20261008000500_billing.sql` |
| `WB112` | the pack has % days left | `20261008000500_billing.sql` |
| `WB120` | a refund is made against a bill or a stay | `20261008000500_billing.sql` |
| `WB121` | a refund can only give back what was paid over what the bill now comes to. Make a credit note first if the stay costs less. | `20261008000500_billing.sql` |
| `WB122` | a refund can only give back the advance paid for this stay | `20261008000500_billing.sql` |
| `WB130` | there is not enough % in stock (% left). Count it first if the shelf says otherwise. | `20261008000550_kitchen.sql` |
| `WB131` | only an owner or manager records what was bought | `20261008000550_kitchen.sql` |
| `WB140` | % must never be in a recipe<br>% must never be in a recipe, and a recipe uses it. Make a new version without it first. | `20261008000550_kitchen.sql` |
| `WB141` | a recipe version never changes. Make a new version instead. | `20261008000550_kitchen.sql` |
| `WB142` | only an owner or manager changes a recipe | `20261008000550_kitchen.sql` |
| `WB143` | a recipe needs at least one ingredient | `20261008000550_kitchen.sql` |
| `WB144` | this recipe has been cooked. Retire it instead. | `20261008000550_kitchen.sql` |
| `WB145` | costs are for owners and managers | `20261008000550_kitchen.sql` |
| `WB146` | only an owner or manager sets a portion by hand | `20261008000550_kitchen.sql` |
| `WB150` | that food is not sold that way | `20261008000550_kitchen.sql` |
| `WB151` | this delivery is past its cut-off and is being cooked. A manager can cancel it with a reason. | `20261008000550_kitchen.sql` |
| `WB152` | this delivery is on a bill. Cancel it instead. | `20261008000550_kitchen.sql` |
| `WB153` | a cancelled delivery stays cancelled. Make a new one.<br>this delivery has been to the door. Report a problem instead. | `20261008000550_kitchen.sql` |
| `WB154` | bill a subscription's deliveries with the subscription, and an order of this parent on its own | `20261008000550_kitchen.sql` |
| `WB155` | some of these days are on another bill of this subscription | `20261008000550_kitchen.sql` |
| `WB156` | a made-to-order item needs % hours' notice. Choose a later day. | `20261008000550_kitchen.sql` |
| `WB160` | this delivery is not that batch's recipe | `20261008000550_kitchen.sql` |
| `WB161` | batch % is used by %, and this delivery goes on % | `20261008000550_kitchen.sql` |
| `WB170` | the rider must be working at this kennel | `20261008000550_kitchen.sql` |
| `WB171` | a delivery goes on a run of its own day and slot | `20261008000550_kitchen.sql` |
| `WB172` | this run is not today's | `20261008000550_kitchen.sql` |
| `WB173` | a rider marks a stop on the way, delivered, nobody home or refused | `20261008000550_kitchen.sql` |
| `WB174` | a problem is reported within % hours of the delivery | `20261008000550_kitchen.sql` |
| `WB180` | this kennel is not taking food orders here | `20261008000600_intake_and_public_pages.sql` |
| `WB181` | the order could not be read | `20261008000600_intake_and_public_pages.sql` |
| `WB182` | fill in your name, phone, dog's name, address and PIN code, and agree to the notice | `20261008000600_intake_and_public_pages.sql` |
| `WB183` | give the dog's weight in kilos | `20261008000600_intake_and_public_pages.sql` |
| `WB184` | we already have your order. The kennel will be in touch. | `20261008000600_intake_and_public_pages.sql` |
| `WB185` | choose the delivery days and the grams a day | `20261008000600_intake_and_public_pages.sql` |
| `WB186` | choose one of your food subscriptions | `20261008000600_intake_and_public_pages.sql` |
| `WB187` | those dates or amounts cannot be asked for. Check them and try again. | `20261008000600_intake_and_public_pages.sql` |
| `WB188` | this order has already been dealt with | `20261008000600_intake_and_public_pages.sql` |
| `WB190` | that service cannot be booked. Choose another. | `20261008000450_appointments.sql` |
| `WB191` | that place is out of service | `20261008000450_appointments.sql` |
| `WB192` | % is open from % to %. Choose a time inside its hours. | `20261008000450_appointments.sql` |
| `WB193` | this appointment is not on a day of the pet's stay | `20261008000450_appointments.sql` |
| `WB194` | check the pet's vaccination certificates first | `20261008000450_appointments.sql` |
| `WB195` | say who supervised the swim and whether the dog wore a life jacket | `20261008000450_appointments.sql` |
| `WB196` | check the guest dog's vaccination certificates first | `20261008000450_appointments.sql` |
| `WB197` | a party takes % people at most | `20261008000450_appointments.sql` |
| `WB198` | a cancelled appointment stays cancelled. Book a new one. | `20261008000450_appointments.sql` |
| `WB199` | this service is priced on quote. An owner or manager sets the price before it is confirmed. | `20261008000450_appointments.sql` |
| `WB200` | a boarder's appointment goes on its stay's bill, and a course's sessions on the course's | `20261008000500_billing.sql` |
| `WB201` | the course has % sessions left | `20261008000450_appointments.sql` |
| `WB202` | a course is for its own pet and its own kind of session | `20261008000450_appointments.sql` |
| `WB203` | that is not an add-on. Choose one from the list. | `20261008000450_appointments.sql` |
| `WB204` | that package is for another kind of stay | `20261008000450_appointments.sql` |
| `WB205` | a package goes only on a stay still to come or in the kennel, booked on its own price and not billed yet | `20261008000450_appointments.sql` |
| `WB206` | only an owner or manager sets the price of a package priced on request | `20261008000450_appointments.sql` |
| `WB207` | the stay's package does not include that, or it is booked already | `20261008000450_appointments.sql` |
| `WB210` | this pet lacks what the kennel requires at the door: %. An owner or manager can let it in with a note. | `20261008000460_trips_and_health.sql` |
| `WB211` | there is only % of credit left to spend | `20261008000560_credit.sql` |
| `WB212` | a payment from or into credit is not changed. Remove it and record it again. | `20261008000560_credit.sql` |
| `WB213` | credit from a cancellation comes from a refund kept as credit | `20261008000560_credit.sql` |
| `WB215` | choose an address of this parent<br>that address is not in the areas you serve. An owner or manager sets the price. | `20261008000460_trips_and_health.sql` |
| `WB216` | a cancelled trip stays cancelled. Add a new one. | `20261008000460_trips_and_health.sql` |
| `WB220` | that shift is off the list | `20261008000470_team.sql` |
| `WB221` | only owners, managers and staff working here now are on the rota and clock in | `20261008000470_team.sql` |
| `WB222` | % is on leave that day | `20261008000470_team.sql` |
| `WB223` | only an owner or manager grants or refuses leave | `20261008000470_team.sql` |
| `WB224` | someone else answers your own leave | `20261008000470_team.sql` |
| `WB225` | leave is asked for, or put in as granted<br>this leave has been answered. Ask again for new days.<br>granted leave keeps its days. Withdraw it and ask again.<br>this leave has been answered. Withdraw it and ask again. | `20261008000470_team.sql` |
| `WB226` | only an owner or manager writes a clock time by hand | `20261008000470_team.sql` |
| `WB227` | say why when writing a clock time by hand | `20261008000470_team.sql` |
| `WB228` | a clock time cannot be later than now | `20261008000470_team.sql` |
| `WB230` | a kennel goes in or out of service today or on a day before | `20261008000300_kennels_and_bookings.sql` |
| `WB231` | that is before the kennel's last change, on % | `20261008000300_kennels_and_bookings.sql` |
| `WB240` | bring in at most 2000 rows at a time | `20261008000750_operations.sql` |
| `WB241` | photos are archived a month at a time, for a month that has ended | `20261008000750_operations.sql` |
| `WB242` | only an owner removes photos from Wagbook | `20261008000750_operations.sql` |
| `WB243` | download this month's photos first, then remove them | `20261008000750_operations.sql` |
| `WB250` | this kennel was cleaned already | `20261008000570_the_day.sql` |
| `WB251` | only an owner or manager marks a pet as passed away | `20261008000570_the_day.sql` |
| `WB252` | the day a pet passed away is today or a day before | `20261008000570_the_day.sql` |
| `WB253` | a pet's passing is undone or changed only within a week of marking it | `20261008000570_the_day.sql` |
| `WB254` | % has passed away | `20261008000570_the_day.sql` |
| `WB255` | write what it cost first<br>the cost is nothing or more | `20261008000570_the_day.sql` |
| `WB256` | a vet visit is written on its day or after | `20261008000570_the_day.sql` |
| `WB260` | a stay report is for a pet in the kennel or gone home | `20261008000570_the_day.sql` |
| `WB261` | pick the report's photos from this stay's updates to the parent | `20261008000570_the_day.sql` |
| `WB270` | only an appointment still to come can be moved | `20261008000450_appointments.sql` |
| `WB271` | move it to a time still to come | `20261008000450_appointments.sql` |
| `WB272` | choose one of the kennel's appointments | `20261008000600_intake_and_public_pages.sql` |
| `WB273` | that time is not free. Pick one of the free times. | `20261008000600_intake_and_public_pages.sql` |
| `WB274` | the kennel already knows about a problem with that delivery | `20261008000600_intake_and_public_pages.sql` |
