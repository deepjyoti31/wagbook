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

| Code | Message | Raised in |
| --- | --- | --- |
| `WB001` | sign in first | `20261008000100_foundation.sql` |
| `WB002` | only an owner or manager can invite people<br>only an owner can invite another owner<br>only an owner can change an owner<br>only an owner or manager can void an invoice | `20261008000100_foundation.sql`<br>`20261008000500_billing.sql` |
| `WB003` | invoice not found<br>submission not found | `20261008000500_billing.sql`<br>`20261008000600_intake_and_public_pages.sql` |
| `WB004` | this cannot be moved to another kennel | `20261008000100_foundation.sql` |
| `WB010` | unknown time zone "%" | `20261008000100_foundation.sql` |
| `WB011` | a kennel must keep at least one active owner | `20261008000100_foundation.sql` |
| `WB012` | you already own the maximum number of kennels | `20261008000100_foundation.sql` |
| `WB014` | enter the person's name | `20261008000100_foundation.sql` |
| `WB015` | that invitation is no longer open | `20261008000100_foundation.sql` |
| `WB020` | no space on % (% booked, % kennels) | `20261008000300_kennels_and_bookings.sql` |
| `WB021` | that kennel is out of service | `20261008000300_kennels_and_bookings.sql` |
| `WB030` | an issued invoice cannot be deleted. Void it instead. | `20261008000500_billing.sql` |
| `WB031` | a void invoice cannot be changed | `20261008000500_billing.sql` |
| `WB032` | an issued invoice cannot be edited. Void it and issue a new one.<br>lines of an issued invoice cannot be changed<br>a line cannot be moved to another invoice | `20261008000500_billing.sql` |
| `WB033` | a draft cannot be voided. Delete it instead. | `20261008000500_billing.sql` |
| `WB034` | use issue_invoice() to issue an invoice<br>an invoice starts as a draft. Use issue_invoice() to issue it. | `20261008000500_billing.sql` |
| `WB035` | this invoice has already been issued | `20261008000500_billing.sql` |
| `WB036` | an invoice needs at least one line | `20261008000500_billing.sql` |
| `WB037` | a discount is larger than its line<br>a line that carries no tax has tax or the wrong amount<br>a line's tax does not match its price and rate<br>a line's taxable value does not match its price<br>a line's CGST and SGST do not match its taxable value and rate<br>a line's IGST does not match its taxable value and rate<br>a line's tax does not match its taxable value and rate<br>invoice totals do not match its lines<br>the round off is not what the kennel's rounding setting gives | `20261008000500_billing.sql` |
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
