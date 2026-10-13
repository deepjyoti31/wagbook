# 6. Billing and GST

> Wagbook does arithmetic and keeps records. It does not give tax advice. Whether a kennel must register for GST, which
> rate and which service code apply to boarding, and what must appear on its invoices are questions for the kennel's
> own accountant. Every place this page says "ask your accountant" means it.

Everything here exists in the database and in `src/lib/core`, with tests. None of it has a screen yet (milestone M4).

## The life of a bill

```
            add lines, edit freely
 (nothing) ───────────────────────> DRAFT ──── issue_invoice() ────> ISSUED ──── void_invoice(reason) ────> VOID
                                      │                                 │
                                   delete                        cannot be edited
                               (manager, drafts only)            cannot be deleted
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
is not reused, so the series has no gap that cannot be explained.

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
change. The kennel enters the rate its accountant gives it (`default_tax_rate_bp`, in basis points: 18% is `1800`), and
optionally a rate and SAC on each service in the rate card. They are copied onto each booking and each invoice line.

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
  record one.
- `recorded_by` is stamped by the database.
- `invoice_balances` gives total, paid and due per invoice.

Wagbook never learns on its own that a UPI payment succeeded (see [07-whatsapp-and-upi.md](07-whatsapp-and-upi.md)).
A person checks their bank app and records it.

## Amount in words

`amountInWords()` writes an amount the Indian way: "Rupees Four Thousand Two Hundred Forty Eight Only", with lakh and
crore. It takes the names of the currency units as arguments for other currencies.

## Building a bill from a stay

`stayLines()` in `src/lib/core/stay.ts` turns a booking into lines: one for the nights or days at the booked rate
(less any discount), then one per extra. `quoteStay()` runs them through `computeInvoice()`. The M4 screen should:

1. Build lines with `stayLines()` and totals with `computeInvoice()`, using the tax context from the kennel.
2. Insert the draft invoice and its lines with exactly those numbers.
3. Call `issue_invoice()`. If it raises `WB037`, the TypeScript and SQL arithmetic disagree: that is a bug to fix, not
   an error to show the user.

## Questions to take to an accountant

Write the answers in your own records, not in this repository.

1. Do I need to register for GST yet? At what turnover will I?
2. Once registered, what rate applies to pet boarding, day boarding, grooming and items I sell?
3. Which SAC or HSN code goes on each?
4. Are my listed prices inclusive or exclusive of tax, and how should I show that to parents?
5. Is `PREFIX/YY-YY/NNNN` acceptable as my invoice series?
6. Does a voided invoice need a credit note instead once I am registered? (Wagbook does not produce credit notes yet.)
7. What must I keep, and for how long?

## Not built

- Credit notes and debit notes.
- E-invoicing and e-way bills.
- GST return exports.
- Multiple tax rates on one stay line.
- Currencies other than the kennel's own on a single invoice.

If you need one of these, open an issue describing the kennel situation.
