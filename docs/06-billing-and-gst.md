# 6. Billing and GST

> Wagbook does arithmetic and keeps records. It does not give tax advice. Whether a kennel must register for GST, which
> rate and which service code apply to boarding, and what must appear on its invoices are questions for the kennel's
> own accountant. Every place this page says "ask your accountant" means it.

Everything here exists in the database and in `src/lib/core`, with tests, and has screens (milestone M4): Bills under
More, the bill page, Make bill on a booking, and the parent's bill at `/inv/{token}`.

**Who may issue what.** Any member may make a draft. Staff may issue only a bill whose lines are exactly what its
booking says, the stay at its booked rate, discount and tax and each extra at its own price; a bill that was changed
is issued by an owner or manager (`WB050`, decision D15). A booking has at most one live (draft or issued) bill.
Issuing takes in any advances recorded for the booking.

## The life of a bill

```
            add lines, edit freely
 (nothing) ───────────────────────> DRAFT ──── issue_invoice() ────> ISSUED ──── void_invoice(reason) ────> VOID
                                      │                                 │           (same month only, for a
                                   delete                        cannot be edited    tax invoice; WB095, WB096)
                               (owner, drafts only)              cannot be deleted
                                                                        │
                                                          issue_credit_note(reason, lines)
                                                                        │
                                                          CREDIT NOTE (CN/YY-YY/NNNN), the bill stays issued
```

**Draft.** No number. Any member can create one and change its lines. It is a working copy.

**Issued.** `issue_invoice(invoice_id)` does all of this in one transaction:

1. Locks the invoice so nothing can change underneath it.
2. Refuses if it is not a draft (`WB035`).
3. Checks every line against its quantity, unit price, discount and tax rate, and the invoice's totals against its
   lines, and refuses a mismatch (`WB037`). For prices that include tax it allows the one paisa of give described
   under "The arithmetic". The subtotal is not checked; it is recomputed and overwritten. The database does not trust
   the arithmetic it was given.
4. Refuses if there are no lines (`WB036`), and checks the round off is exactly what the kennel's rounding setting
   gives.
5. Takes the next number for the kennel and financial year.
6. Copies the kennel's details (name, legal name, address, tax number, state, UPI ID) into `seller` and the parent's
   into `buyer`, as they are at that moment.
7. Sets the date to today in the kennel's time zone, and the status to issued.

**Frozen.** From then on, triggers refuse every update and delete of the invoice and its lines (`WB030`, `WB032`). This
holds for owners too. If a bill is wrong, void it and issue a new one.

**Void.** `void_invoice(invoice_id, reason)`: owners and managers only (`WB002`), reason required (`WB039`). The number
is not reused, so the series has no gap that cannot be explained. A tax invoice issued in an earlier month cannot be
voided (`WB095`): it may already be in a return, so it is credited instead. Nor can a bill that has a credit note
(`WB096`).

## Credit notes

A credit note takes back all or part of an issued bill (D34). The bill stays exactly as it was issued; the credit note
is a document of its own, counted in the month it is made.

- **Who and why.** Owners and managers (`WB002`), on the bill page, with a reason printed on it (`WB091`).
- **What.** The whole bill, while nothing has been credited: its own lines, to the paisa. Or part of it: one line of an
  amount (before tax when the bill's prices were, including tax when they included it) at one of the bill's tax rates
  (`WB093`).
- **Its tax** is worked out as on the bill when the bill was issued: the seller's tax mode and state frozen on the bill,
  and whether its prices included tax (`invoices.prices_include_tax`, frozen at issue). `issue_credit_note()` checks
  every line with the same function as a bill (`check_bill_line`, `WB037`).
- **Never more than is left** on the bill, in all or in value taxed (`WB092`).
- **Its number** is the next in its own series for the financial year, `CN/27-28/0001`, from the same counter table as
  bills (`invoice_counters.series`). A bill prefix cannot be `CN`. Nobody can change or delete a credit note.
- **What is owed** on a bill is its total, less credit notes, less payments (`invoice_balances`). Below zero, the parent
  paid more than the bill now comes to: record a refund.
- **The parent** sees the bill's credit notes listed on its link, and each opens as its own printable page.
- **Reports** count each credit note in its own month, at minus: Billed is net of them, tax by rate subtracts their
  lines, and the bills download lists them with their own number and date and the bill they are against.

Section 34 lets a credit note reduce tax only until 30 November after the end of the year of the bill (or the annual
return, if earlier). Wagbook does not stop a later one; it is then a commercial credit note.

## Invoice numbers

Format: `PREFIX/YY-YY/NNNN`, for example `WB/27-28/0001`.

- `PREFIX` is the kennel's choice, 1 to 4 capital letters or digits.
- `YY-YY` is the financial year. With an April start, 14 April 2027 falls in `27-28`. A kennel whose year starts in
  January gets the calendar year, `2027`.
- `NNNN` counts from 1 each financial year, padded to four digits and growing past them if needed.

The design follows what is commonly required of Indian tax invoices: a consecutive serial number, unique within a
financial year, no longer than 16 characters, using only letters, digits, hyphen and slash. `formatInvoiceNumber()`
throws if a number would break that. Ask your accountant to confirm the format suits you before issuing the first one,
because the prefix should not change mid-year.

**Fixed after the first bill.** Once a kennel has issued a bill (including one later cancelled), the database refuses a
change to its currency or to the month its financial year starts (`WB052`). A new year start would begin a new label
and restart the count at 1 partway through a year, and a new currency would mix two currencies in every stored amount.
Settings shows both as fixed from then on.

**No gaps, no duplicates.** The next number comes from `invoice_counters`, one row per kennel and year, updated inside
the issuing transaction with a row lock. Two people issuing at the same moment queue up. If issuing fails, the
transaction rolls back and the number is not consumed. A plain Postgres sequence would not do: sequences skip numbers
when a transaction rolls back.

Nobody can read or write `invoice_counters` through the API. It has row level security on and no policies.

## Tax modes

Set on the kennel (`organizations.tax_mode`).

| Mode | For | On the bill |
| --- | --- | --- |
| `none` | A kennel not registered for tax | A plain bill. No tax lines. Not titled "Tax Invoice". |
| `gst_india` | A GST-registered Indian kennel | CGST and SGST when the place of supply is the kennel's state; IGST when it is another state |
| `simple` | Anywhere with one tax at one rate | One tax line, labelled with `tax_label` (for example VAT) |

Switching to `gst_india` requires a GSTIN and a state code (a database constraint). `isValidGstin()` checks the
15 character format and its check character before saving. Start with `none`; a new kennel is usually below the
registration threshold. Your accountant will tell you when that changes.

### Rates and codes

Wagbook does not ship a tax rate or a service accounting code (SAC) for boarding. It would be wrong to guess, and rates
change. The kennel enters what its accountant gives it (D35): a usual rate (`default_tax_rate_bp`, in basis points:
18% is `1800`); under Settings, a rate and a SAC code for boarding and for day boarding; and under Extras, a rate and a
code for each extra. An empty rate means the usual rate. They are copied onto each booking and extra when it is made,
and onto each bill line from there.

### The arithmetic

All in `src/lib/core/tax.ts`, mirrored by `issue_invoice()`.

For each line:

```
gross = round(quantity × unit price)

When prices exclude tax:
  taxable = gross − discount
  tax     = round(taxable × rate / 10000)

When prices include tax:
  taxable = round((gross − discount) × 10000 / (10000 + rate))
  tax     = (gross − discount) − taxable        so the parent pays exactly the listed price
```

Under `gst_india` within the state, the tax is split in two: CGST is half the rate applied to the taxable value, and
SGST equals CGST. If that leaves an odd paisa (prices including tax can), the taxable value absorbs it so that CGST and
SGST stay equal and the line still adds up to what the parent was quoted. Across states, the whole tax is IGST.

Each component is rounded to the paisa, half up, per line. Invoice totals are sums of the lines, never recomputed from
a total, so the bill always adds up line by line.

**Round off.** If `round_invoice_totals` is on (the default), the grand total is rounded to a whole rupee and the
difference is shown as its own "Round off" amount, always under one rupee either way.

**Worked example.** Three nights at ₹1,200, GST at 18%, prices excluding tax, kennel and parent both in Karnataka:

| | |
| --- | --- |
| Taxable value | 3 × 1,200.00 = 3,600.00 |
| CGST 9% | 324.00 |
| SGST 9% | 324.00 |
| Total | 4,248.00 |

The same stay with prices including tax (the parent pays ₹3,600 in all):

| | |
| --- | --- |
| Taxable value | 3,050.84 |
| CGST 9% | 274.58 |
| SGST 9% | 274.58 |
| Total | 3,600.00 |

(3,600 × 100 / 118 is 3,050.85; halving the tax leaves an odd paisa, so the taxable value gives it up to keep the two
halves equal.) `core.test.ts` covers the first case and a one night version of the second; add this exact one when
you build M4.

### Place of supply

For boarding, the service happens at the kennel, so the place of supply is normally the kennel's own state and the tax
is CGST plus SGST even when the parent lives elsewhere. Wagbook defaults `place_of_supply_state_code` to the kennel's
state and supports IGST for the cases where your accountant says otherwise.

## What is frozen on an invoice, and why

`seller` and `buyer` are JSON copies taken when the invoice is issued. If the kennel later moves, renames itself,
registers for GST or changes its UPI ID, invoices already issued still show what was true on their date. The pay link
on a bill uses the UPI ID frozen on it.

`is_tax_invoice` records whether the kennel was tax registered when it issued the bill, which decides the title.

## Payments

A payment is a record that money moved: amount, method, date received, an optional reference (a UPI transaction id),
and optionally the invoice it settles.

- An **advance** is a payment with no invoice yet. Tie it to the invoice later.
- A **refund** is a payment with `direction = 'out'`. The amount is always positive. Only owners and managers can
  record one, and only of money paid and not owed (D40): on a bill, up to what was paid over its total less its credit
  notes (`WB121`); on a stay with no bill, up to its advance (`WB122`); always against a bill or a stay (`WB120`). So a
  stay that got cheaper is credited first, and the return shows why the money went back.
- A **stay that changed** after its bill was issued (a pet billed only to today at an early check-out, dates shortened,
  a stay or a day cancelled) is credited, never re-billed: the bill page offers a credit note for what the bill is over
  what its stays now come to, one line for each tax rate on the bill, worked out under the bill's own tax treatment.
- `recorded_by` is stamped by the database.
- `invoice_balances` gives total, paid and due per invoice.

Wagbook never learns on its own that a UPI payment succeeded (see [07-whatsapp-and-upi.md](07-whatsapp-and-upi.md)).
A person checks their bank app and records it.

## Amount in words

`amountInWords()` writes an amount the Indian way: "Rupees Four Thousand Two Hundred Forty Eight Only", with lakh and
crore. It takes the names of the currency units as arguments for other currencies.

## Building a bill from a stay

What a stay costs is worked out in one place, `stay_charges()` in the database (D32). Usually it is one line, every
night (or day) at the booked rate. It splits in two cases:

- **A pet at the shared kennel price** (`alone_rate_minor` set): the nights its kennel holds a sibling at the shared
  price, and the nights it has the kennel to itself at the usual price. A sibling checked out early counts up to the
  day it went home.
- **Day boarding that turned into boarding** (`boarding_from` set): the days before the first night at the day price
  (`day_rate_minor`), then the nights at the booked rate.

The booking's discount goes on the stay's largest line. `stayLines()` in `src/lib/core/stay.ts` turns those charges
(or, without them, the whole stay at the booked rate) into lines with descriptions, then one per extra. `quoteStay()`
runs them through `computeInvoice()`. Make bill:

1. Reads the charges with `stay_charges()`, builds lines with `stayLines()` and totals with `computeInvoice()`, using
   the tax context from the kennel.
2. Inserts the draft invoice and its lines with exactly those numbers.
3. Calls `issue_invoice()`. If it raises `WB037`, the TypeScript and SQL arithmetic disagree: that is a bug to fix, not
   an error to show the user.

## The language of a bill

A bill is in English (D31). For a parent who asks, the parent page's Bills choice adds Hindi or Kannada: every heading
is followed by its translation in brackets ("Tax invoice (टैक्स इनवॉइस)"), and lines with amounts stay in English. We
found no rule on the language of a tax invoice in Rule 46 of the CGST Rules; English is what accountants and tax
officers read.

## What the law says, as far as we could find

Read on 21 October 2026 from public commentary on the CGST Act and Rules, not from an accountant and not from the
official texts (the CBIC site could not be reached from where this was written). Each point names where it came
from. Take them to your accountant; Wagbook still ships no rate and no code.

**Registering.** A business supplying services must register once its turnover passes ₹20 lakh in a year (₹10 lakh in
some north-eastern and hill states). A small service business may instead choose the composition scheme for services
(section 10(2A)): up to ₹50 lakh turnover in the year before, tax at 6% (3% CGST and 3% SGST) on turnover, no input
credit, and it issues a bill of supply, not a tax invoice
([BUSY](https://busy.in/gst/gst-for-traders-vs-service-providers-key-differences-in-2026/),
[TIOL](https://taxindiaonline.com/gst/news/details/NDQ5)). Wagbook has no composition mode: such a kennel uses "No
tax", and the words a bill of supply must carry are not printed yet.

**Rate and SAC for boarding.** Not settled in what we found. The explanatory notes to the services classification
put pet kennels, grooming and training with "other animal husbandry services", code 998612, like the UN code it comes
from ([taxreply](https://taxreply.com/gst-rate-service-hsn-99861),
[UN CPC 86129](https://unstats.un.org/unsd/classifications/Econ/Detail/EN/1074/86129)). One forum answer reads that as
nil rated; others say the exemption for animal husbandry does not cover pets and the rate is 18%, and one recent note
puts boarding under accommodation, 996311
([TaxTMI](https://www.taxmanagementindia.com/web/View_discussions_detail.asp?ID=117039),
[caclubindia](https://www.caclubindia.com/forum/pets-grooming-taxable--593165.asp),
[CA Sahuja](https://www.casahuja.com/2025/12/gst-classification-and-taxability.html)). Ask the accountant for the
rate and code, in writing.

**Invoice numbers.** Rule 46(b): a consecutive serial number, at most 16 characters, unique in the financial year,
using letters, digits, hyphen and slash; a business may run more than one series
([cleartax](https://cleartax.in/s/invoice-number),
[IRIS](https://irisgst.com/effective-1st-april-2026-reset-the-invoice-number-series/)). `PREFIX/YY-YY/NNNN` fits:
`WB/27-28/0001` is 13 characters, and `formatInvoiceNumber()` refuses one over 16.

**The buyer on the bill.** For a buyer who is not registered, the name, address and state go on the bill when it is
₹50,000 or more, or when the buyer asks (Rule 46(e) and (f),
[gimbooks](https://www.gimbooks.com/blog/gst-invoice-mandatory-fields-rule-46-checklist/)). Wagbook prints what it has.

**Cancelling an issued bill (questions 6 and 8).** Built since as credit notes (D34, above). As commonly practised: a bill not yet reported in the month's
GSTR-1 can be cancelled and reported as cancelled in the documents summary. Once reported, it is not cancelled but
undone with a credit note under section 34, declared in the return for the month the credit note is issued, by
30 November after the end of the financial year (or the annual return, if earlier). The earlier month's figure stays
as filed; the reduction shows in the month of the credit note
([TaxTMI](https://www.taxtmi.com/forum/issue?id=113574),
[taxguru](https://taxguru.in/goods-and-service-tax/adjustment-tax-liability-refund-gst-credit-note.html),
[fintaxblog](https://fintaxblog.com/section-34-of-cgst-act-2017-credit-and-debit-notes/)). Wagbook now follows that: a tax invoice from an
earlier month is credited, not cancelled, and reports count the credit note in its own month.

**Keeping records (question 7).** Section 36 of the CGST Act: 72 months from the due date of the annual return for the
year; longer while an appeal or proceeding is open
([KnowYourGST](https://www.knowyourgst.com/gstlaw/cgst-act/36-period-of-retention-of-accounts-36/)). This is why erasing
a parent keeps issued bills (D25).

## Questions to take to an accountant

Write the answers in your own records, not in this repository.

1. Do I need to register for GST yet? At what turnover will I?
2. Once registered, what rate applies to pet boarding, day boarding, grooming and items I sell?
3. Which SAC or HSN code goes on each?
4. Are my listed prices inclusive or exclusive of tax, and how should I show that to parents?
5. Is `PREFIX/YY-YY/NNNN` acceptable as my invoice series?
6. Wagbook cancels a tax invoice only in the month it was issued, and credits it after that (D34). If I file
   quarterly, may I cancel within the quarter instead?
7. What must I keep, and for how long?
8. Tax by rate counts bills by bill date and credit notes, at minus, by their own date. Is that the figure my return
   needs?
9. Bills are in English, with the headings also in Hindi or Kannada in brackets when a parent asks (D31). Is that
   acceptable on a tax invoice?
10. Which rate and SAC apply to boarding, day boarding and grooming (998612, 996311 or another), and is any of it
    exempt?
11. When a parent cancels and I keep their advance (a no-refund peak period, say), is the money kept a cancellation
    charge that needs its own bill, with tax? Wagbook records it as an advance on a cancelled stay, with no bill (D40).
12. A regular's day boarding is billed once a month for the month's days (D41). Is a bill at the end of the month, for
    days already given, issued in time?
13. If I cook and sell dog food (a trial, food by the kilo on a subscription delivered twice a week, birthday cakes),
    what are the HSN code and rate for it, and does a delivery charge take the food's rate or its own? A subscription
    is paid a week ahead: is that an advance, and when is the bill due (M29)?
14. Does a kitchen that sells cooked pet food need a licence or registration of its own, and must anything be printed
    on the pack label (M30)? (Not strictly tax; ask whom the accountant suggests.)
15. When a parent keeps the value of a cancelled stay as credit for 12 months (M38), is that an advance I hold, and is
    there tax when it is kept, when it is spent, or when it runs out unspent?

## GSTR-1 files

Reports offers a GST-registered kennel the month's GSTR-1 as the GST offline tool's CSV files (D38,
`src/lib/core/gstr1.ts`): b2b (bills to a buyer with a GSTIN, one row per bill and rate), b2cl (no GSTIN, another state,
over ₹1 lakh, the limit from 1 August 2024 under Rule 59(4)), b2cs (every other bill, added up by place of supply and
rate, less the month's credit notes on such bills), cdnr and cdnur (credit notes on b2b and b2cl bills), hsn (value
and tax by SAC and rate, less credit notes) and docs (the numbers used, with cancelled bills). Dates are written
14-Apr-2027, places of supply 29-Karnataka, and the files have no byte order mark. The column names were written from
the tool's templates as we know them: check them against the tool before the first upload. The HSN table's newer split
into B2B and B2C rows is not done.

## A month of a repeating series

The days of a repeating day boarding series are billed a calendar month at a time (D41): one bill for the month's days
that are not requests or cancelled (`invoices.series_id`, `series_month`), one line for each price, tax rate and code,
the days added up and listed, then each day's extras with its date. A day of a series is never billed on its own
(`WB055`), and a month has one live bill. A day on an issued month's bill cannot move into another month (`WB057`).

## Day boarding packs

A pack is sold on its own bill (one line: the pack, its days and dates, at its price, rate and code). Days paid from it
are at ₹0 on their own bills, described "from a pack" (D37).

## Not built

- Debit notes.
- E-invoicing and e-way bills.
- GST return exports. Reports gives tax by rate for a month and a CSV of bills, for the accountant to work from.
- Multiple tax rates on one stay line.
- Currencies other than the kennel's own on a single invoice.

If you need one of these, open an issue describing the kennel situation.
