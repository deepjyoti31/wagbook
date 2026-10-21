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

| Code | Message | Raised in |
| --- | --- | --- |
| `WB001` | sign in first | `20261008000100_foundation.sql` |
| `WB002` | only an owner or manager can invite people<br>only an owner can invite another owner<br>only an owner can change an owner<br>only an owner or manager can change a parent's phone number<br>only an owner or manager can hide a pet or parent, or show one again<br>only an owner or manager can void an invoice<br>only an owner or manager can make a credit note<br>only an owner or manager can merge parents | `20261008000100_foundation.sql`<br>`20261008000200_clients_and_pets.sql`<br>`20261008000300_kennels_and_bookings.sql`<br>`20261008000500_billing.sql` |
| `WB003` | invoice not found<br>submission not found<br>parent not found | `20261008000500_billing.sql`<br>`20261008000600_intake_and_public_pages.sql`<br>`20261008001100_privacy.sql` |
| `WB004` | this cannot be moved to another kennel | `20261008000100_foundation.sql` |
| `WB005` | enter the code from your authenticator app first | `20261008000100_foundation.sql` |
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
| `WB022` | only an owner or manager can change the price or the kind of stay | `20261008000300_kennels_and_bookings.sql` |
| `WB023` | only an owner or manager can book at a price that is not on your price list | `20261008000300_kennels_and_bookings.sql` |
| `WB024` | bookings made together must all be for one parent | `20261008000300_kennels_and_bookings.sql` |
| `WB025` | only an owner or manager can change what an extra costs | `20261008000300_kennels_and_bookings.sql` |
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
| `WB060` | Reports are for owners and managers. | `20261008001000_reports.sql` |
| `WB061` | Choose a period of a year or less, with the start before the end. | `20261008001000_reports.sql` |
| `WB070` | only an owner or manager can export or erase a parent's details | `20261008001100_privacy.sql` |
| `WB071` | a pet of this parent is in the kennel now. Check it out first. | `20261008001100_privacy.sql` |
| `WB072` | this parent has stays still to come. Cancel them first. | `20261008001100_privacy.sql` |
| `WB073` | this parent's details have already been erased | `20261008001100_privacy.sql` |
| `WB074` | only an owner can erase a parent's details | `20261008001100_privacy.sql` |
| `WB080` | only an owner or manager can change what an incident says | `20261008000400_daily_care.sql` |
| `WB090` | a credit note is made against an issued bill | `20261008000500_billing.sql` |
| `WB091` | say why the bill is being credited, in under 500 characters | `20261008000500_billing.sql` |
| `WB092` | a credit note cannot take back more than is left on the bill | `20261008000500_billing.sql` |
| `WB093` | a credit note line must use a tax rate that is on the bill | `20261008000500_billing.sql` |
| `WB094` | a credit note needs at least one line | `20261008000500_billing.sql` |
| `WB095` | this bill was issued in an earlier month. Make a credit note instead of cancelling it. | `20261008000500_billing.sql` |
| `WB096` | this bill has a credit note. Credit what is left instead of cancelling it. | `20261008000500_billing.sql` |
