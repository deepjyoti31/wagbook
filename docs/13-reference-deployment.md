# 13. Reference deployment

Wagbook is maintained by a dog boarding kennel in Bengaluru that builds it for its own operations. This page describes
that kennel's **public operating rules** and how each maps onto Wagbook, as a worked example for other kennels and as a set of real
requirements for contributors.

It holds only what a parent could learn by asking at the gate. Nothing else about that business belongs in this
repository (see `CLAUDE.md`, rule 25).

Your kennel will differ. Every rule below is a setting, not something built into the code.

## The kennel

| Rule | In Wagbook |
| --- | --- |
| 60 kennels, one dog in each | 60 rows in `kennels` (More, Kennels: prefix K, 60, from 1). Capacity is then 60 and the database refuses a 61st dog on any day. |
| Dogs are never mixed | One booking per kennel per night (exclusion constraint). Play is solo (below). |
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

A yard holds one dog at a time. With yards in use for ten hours a day:

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

## What this kennel needs that is not built yet

In the order it needs them. This is why the roadmap is in the order it is.

1. Everything verified against a real database (M1).
2. A calendar of 60 kennels, family bookings, extending a stay (M2).
3. The meal round and the play timetable on a phone (M3).
4. Bills and payments (M4).
5. Photos to parents (M5).
