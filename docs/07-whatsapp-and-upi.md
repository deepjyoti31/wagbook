# 7. WhatsApp and UPI

Wagbook talks to parents through the two apps every Indian phone already has, and it does so without any account,
approval, API key or fee. This page explains how, what the trade-offs are, and where the limits lie.

## WhatsApp: click to chat

### How it works

Wagbook builds a link like this:

```
https://wa.me/919876543210?text=Hi%20Asha%2C%20Bruno%27s%20stay%20is%20confirmed...
```

Tapping it opens WhatsApp on the staff member's own phone, in the chat with that parent, with the message already
typed. The person reads it, changes it if they like, attaches photos, and taps Send.

`whatsappLink(text, phone)` in `src/lib/core/whatsapp.ts` builds the link. With no phone number it opens WhatsApp's
chat picker, which suits sending to a group.

### Why not the WhatsApp Business API

| | Click to chat (what Wagbook does) | Business API |
| --- | --- | --- |
| Setup | None | Business verification, a provider, template approval |
| Cost | Nothing | A charge per conversation or message |
| Who the parent sees | The kennel's own number, the one they already saved | A business number, often new to them |
| Replies | Land in the kennel's normal WhatsApp | Need an inbox built for them |
| Sends by itself | No. A person taps Send. | Yes |
| Works for the smallest kennel | Yes | Rarely worth it |

The one real cost is that nothing is automatic. Wagbook cannot send a reminder at 8 pm by itself. For a kennel of a few
dozen dogs, a person tapping Send is a feature: every message has been read by a human before it goes.

A kennel that grows large enough to want automation can add it later without changing anything here. See "If you
outgrow this", below.

### The messages

Each is a function that returns plain text, so they can be tested and translated.

| Function | When | Contains |
| --- | --- | --- |
| `intakeInviteMessage` | Before a first stay | A greeting and the kennel's intake form link |
| `bookingConfirmedMessage` | When a booking is confirmed | Dates, nights, optional estimate, the stay link |
| `dailyUpdateMessage` | During a stay | A note and the stay link |
| `billMessage` | At check-out | Invoice number, amount due, bill link, UPI pay link |

Rules for writing these:

- Short. A parent reads it in a notification.
- One link at most where possible. WhatsApp previews the first.
- No medical details. The message sits on a lock screen.
- Only true things (see principle 8 in [01-vision-and-principles.md](01-vision-and-principles.md)).

### Where they are used today

- More, then Forms from parents: "Send on WhatsApp" sends the intake link.
- Today, In house: "Send update" opens the parent's chat with the stay link.

Planned: a confirmation button after booking (M2), updates with photos (M5), the bill at check-out (M4).

### Limits to know

- The phone number must be in international form with the country code. Wagbook stores all phones as E.164
  (`normalizePhone()` assumes India when no country code is typed).
- Very long messages can be cut off by the link length some browsers allow. Keep messages under about 1,000 characters.
- On a desktop the link opens WhatsApp Web or the desktop app, if the kennel is signed in there.
- Wagbook does not know whether the message was sent. It does not mark anything as "sent".

## UPI: pay links and QR codes

### How it works

```
upi://pay?pa=happytails%40okhdfcbank&pn=Happy%20Tails&am=4248.00&cu=INR&tn=WB%2F27-28%2F0001&tr=WB27280001
```

On a phone, tapping this opens the parent's UPI app (whichever they use) with the kennel's UPI ID, the amount and a
note filled in. They enter their PIN and the money goes from their bank to the kennel's bank. Drawn as a QR code, the
same string can be scanned at the counter.

`upiLink()` in `src/lib/core/upi.ts` builds it. Fields: `pa` the kennel's UPI ID, `pn` the name shown to the payer,
`am` the amount in rupees with two decimals, `cu` always INR, `tn` a note, `tr` a reference with letters and digits only.

The kennel enters its UPI ID once in Settings. When an invoice is issued the UPI ID is frozen onto it, so an old bill's
pay link never silently starts paying a different account.

### Why not a payment gateway

| | UPI link (what Wagbook does) | Payment gateway |
| --- | --- | --- |
| Setup | Type your UPI ID | Company documents, bank verification, integration |
| Fees | None from Wagbook; whatever your bank charges, usually nothing | A percentage of every payment |
| Money arrives | Straight into the kennel's account, at once | After settlement, typically a day or more |
| Wagbook knows it was paid | No | Yes |
| Cards, net banking, EMI | No | Yes |

### The trade-off, plainly

**Wagbook is never told that a payment happened.** There is no callback from a UPI link. So:

1. The parent pays.
2. The kennel sees the credit in its bank or UPI app.
3. A person records the payment in Wagbook, with the transaction reference if they want.

Until step 3 the bill shows as unpaid. The M4 screens must make step 3 two taps: "Mark as paid", confirm the amount.
Never show a parent "Payment received" based on them tapping a link.

### Limits to know

- `upi://` links open only on a phone with a UPI app. On a desktop, show the QR code instead.
- Some apps ignore the pre-filled amount or let the payer change it. Always check the amount received.
- Banks and apps cap the size of a single UPI payment. A long stay for several dogs can exceed a parent's limit; they
  may need to pay in parts, which is why payments are separate records and an invoice can have several.
- Whether a personal UPI ID may be used for business receipts, and at what volume a merchant account is expected, is
  between the kennel and its bank. Ask them.
- UPI is Indian. For a kennel elsewhere, leave the UPI ID empty and the pay button does not appear. The bill still
  works, and payments are recorded the same way.

### QR codes

Built in M4. The parent's bill page draws the QR code on the server as one SVG path from the `upiLink()` string
(`qrMatrix()` and `qrSvgPath()` in `src/lib/core/qr.ts`, using `qrcode-generator`; see D17 in
[09-decisions.md](09-decisions.md)). A test decodes the drawn code and gets the exact link back. No third-party QR
image service is called: that would send every bill's payment details to someone else's server.

## If you outgrow this

Both choices are deliberately replaceable.

- **Automatic WhatsApp messages.** Add a provider behind the same message functions: the text is already built in one
  place. It needs a secret, a server-side sender and a queue, so it also needs the decision in
  [09-decisions.md](09-decisions.md) about secrets revisited. It must stay optional, and click to chat must keep working
  without it.
- **Confirmed payments.** A gateway or a bank's collect API can record payments automatically. Same conditions:
  optional, and the plain UPI link stays the default.

Neither is on the roadmap. Wagbook's promise is that the smallest kennel needs nothing but a phone.
