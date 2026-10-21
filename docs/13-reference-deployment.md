# 13. Reference deployment

A worked example: the **public operating rules** of one dog boarding kennel in Bengaluru, and how each maps onto
Wagbook. It is here for other kennels to copy from and as a set of real requirements for contributors. Wagbook is an
independent project, not tied to any one kennel, and this example is never named.

It holds only what a parent could learn by asking at the gate. Nothing else about any real business belongs in this
repository (see `CLAUDE.md`, rule 25).

Your kennel will differ. Every rule below is a setting, not something built into the code.

## The kennel

| Rule | In Wagbook |
| --- | --- |
| 60 kennels, one dog in each, or two dogs of one family | 60 rows in `kennels` (More, Kennels: prefix K, 60, from 1). Capacity is then 60 kennels and the database refuses a 61st kennel on any day. Two dogs of one parent may share a kennel and use one of the 60 (D27). |
| Dogs of different families are never mixed | Only pets of one parent share a kennel on a night (exclusion constraint), two at most. Play is solo, or with siblings (below). |
| A second dog sharing a kennel costs less | Settings, Prices: "Second pet sharing a kennel". The kennel sets the price. |
| Boarding at ₹1,200 a night, the same for every dog | Settings, Prices: boarding 1200. One default `services` row of kind `boarding`. |
| Day boarding at 60% of the night rate | Settings, Prices: day boarding 720. |
| Grooming at ₹2,000 | An add-on in the rate card (screen in M2; the table exists). |
| No extra charge for early drop-off or late pick-up | Nothing to configure. Wagbook has no time-based fees. The usual times in Settings are shown to parents and not enforced. |
| No higher prices at festivals | Nothing to configure. Peak periods in Wagbook never change the price. |
| No refunds for cancellations at peak times | A `peak_periods` row with `no_refund` set. Wagbook warns when such a booking is cancelled (M2); it does not move money either way. |

## The day

| Rule | In Wagbook |
| --- | --- |
| Three meals, at 9:00, 14:00 and 19:00 | Three house routines in `care_items`: kind `meal`, with those times. Every dog in house gets three meal tasks a day. |
| Two solo play sessions a day, 20 minutes each | Settings, Solo play: 2 sessions, 20 minutes. |
| On peak days, play sessions are 15 minutes | `peak_periods.play_session_minutes = 15` for those dates. |
| A dog's own food and medicines as the parent instructs | Free text on the pet (food, medical notes) plus per-pet routines for anything on a clock. |

## What solo play really requires

This is the kind of question Wagbook's scheduler exists to answer.

Two sessions of 20 minutes for each of 60 dogs is:

```
60 dogs × 2 sessions × 20 minutes = 2,400 yard-minutes = 40 yard-hours a day
```

A yard holds one dog at a time (or two siblings who share a kennel, which needs fewer sessions still). With yards in
use for ten hours a day:

| Session | Changeover between dogs | Yard-hours needed | Yards needed |
| --- | --- | --- | --- |
| 20 minutes | none | 40 | 4 |
| 20 minutes | 5 minutes | 50 | 5 |
| 15 minutes (peak) | none | 30 | 3 |
| 15 minutes (peak) | 5 minutes | 40 | 4 |

So a full house on a normal day needs four yards running without a break for ten hours, and five once you allow five
minutes to walk one dog out and the next one in. It also needs people: each yard in use needs someone watching it.

These numbers come from `yardsNeeded()` in `src/lib/core/play-schedule.ts`. Try your own: fewer hours in the heat of
summer (two windows, morning and evening) raise the count quickly.

```ts
yardsNeeded({
  dogCount: 60,
  sessionsPerDog: 2,
  sessionMinutes: 20,
  changeoverMinutes: 5,
  windows: [{ start: "08:00", end: "18:00" }],
}); // 5
```

A kennel should run this before it promises parents a play schedule. Milestone M3 puts the calculator on a screen.

## Money and parents

The rest follows Wagbook's defaults, with nothing special to configure:

| Need | In Wagbook |
| --- | --- |
| Take payment without a gateway | The kennel's UPI ID in Settings. Bills carry a pay link and, from M4, a QR code. Staff record each payment. |
| Tax | Left off until an accountant says otherwise. See [06-billing-and-gst.md](06-billing-and-gst.md). |
| Message parents from the kennel's own number | Click to chat links. See [07-whatsapp-and-upi.md](07-whatsapp-and-upi.md). |
| Get a new dog's details before arrival | The intake link, sent on WhatsApp. |
| Let parents see how their dog is doing | The stay page link. |

## Beyond boarding

The same kennel's public rules for everything else it offers, as a parent reads them. Milestones M25 to M44 in `08`
build them (D44).

| Rule | Milestone |
| --- | --- |
| Open at every hour; drop off and collect any time, with no handover fee | Nothing to configure. |
| Pick-up and drop from anywhere in the city, priced by location and quoted when the booking is confirmed | M39 |
| Grooming: bath, brush, drying, tidy-up, booked as its own service | M34, M35 |
| Swimming: 90 minutes, one dog at a time, supervised, life jacket provided, same vaccination rules as boarding | M34, M36 |
| Training: puppy basics, leash manners, recall; priced by the trainer and confirmed after booking | M36 |
| Birthday parties: three hours in the yard, the birthday dog plus one dog friend it already knows, up to five people | M36 |
| Birthday cakes: dog-safe, the dog's name on top, ordered at least 24 hours ahead, delivered across the city for a charge by area | M28, M36 |
| A longer "holiday" stay with extra play, a pool session and a groom before going home, priced on request | M37 |
| Boarders eat food from the kennel's own kitchen | M30 |
| Food for dogs at home: a one-time trial, then a subscription priced per kilo, portioned to the dog's weight, delivered chilled twice a week at a chosen time, each delivery covering three to four days | M28, M29 |
| Four recipes rotating, a new one each delivery, repeating every two weeks; recipes balanced by a pet dietician with a vitamin and mineral mix; never onion, garlic, grapes, raisins, chocolate, cooked bones, added sugar or preservatives | M27 |
| Portions of about 3%, 2.5% and 2% of body weight a day for small, medium and large dogs, adjusted after the first week | M28 |
| Ordering food online: enter an address and be told at once whether it is delivered to; pay by UPI in advance; subscriptions paid a week at a time | M32 |
| Pause or cancel food any time with 24 hours' notice before the next delivery; prepaid deliveries not yet cooked are refunded | M29 |
| A damaged, late or wrong delivery reported within 24 hours with a photo is replaced or refunded | M31 |
| Weekday stays, grooming, swims, training and parties are fully refunded with 24 hours' notice | M38 |
| Weekend and holiday nights (Saturdays, Sundays, the state's public holidays and long weekends around them) are not refunded once confirmed, but kept as credit; so is a weekday cancelled with less than 24 hours' notice. Each night of a stay follows its own rule | M38 |
| Credit is spent on any stay or service within 12 months of the cancelled date | M38 |
| When the kennel cancels, the parent chooses a full refund or credit | M38 |
| Refunds go back to the UPI account that paid, within 7 working days | Recorded as a refund (M20). |
| At the door: DHPPiL, anti-rabies and kennel cough vaccines within 12 months, deworming and tick treatment up to date, and every dog over 12 months spayed or neutered | M40 |
| Booking any service online: send the dates, the kennel calls to confirm, nothing is charged online | M41 |
| Caretakers on site day and night | M43 |

## What this kennel needs that is not built yet

In the order it needs them. This is why the roadmap is in the order it is.

1. Everything verified against a real database (M1).
2. A calendar of 60 kennels, family bookings, extending a stay (M2).
3. The meal round and the play timetable on a phone (M3).
4. Bills and payments (M4).
5. Photos to parents (M5).
6. The kitchen and food subscriptions (M25 to M33), then appointments (M34 to M37), then the rest of the rules above
   (M38 to M43).
