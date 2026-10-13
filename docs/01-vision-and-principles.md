# 1. Vision and principles

## Why Wagbook exists

Most pet boarding kennels are small. One family, a few helpers, somewhere between five and sixty dogs. They run on a
paper register, a phone full of WhatsApp chats, and the owner's memory. That works until the day two dogs are promised
the same kennel during Diwali week, or nobody can say whether the old Labrador had his evening tablet.

Software that fixes this exists, but it tends to be priced per month in a way a ten-kennel business cannot justify, or
it is built for another country: card payments, email reminders, sales tax.

Wagbook is free, open source kennel software that any kennel can use, however small. It is maintained by a kennel that
builds it for its own use.

## Who it is for

**The kennel owner.** Often also the manager, the receptionist and the accountant. Wants to know at a glance that
today is under control, and at month end what was earned.

**The kennel worker.** On their feet, phone in one hand, a leash in the other. May be more comfortable in Kannada, Hindi
or Tamil than English. Needs big buttons, few words, and no way to make a mistake that matters.

**The pet parent.** Never installs anything and never makes an account. Gets a WhatsApp message with a link, and the
link shows how their dog is doing.

## The promise

1. **Free for every kennel, for ever.** No paid tier, no per-kennel limit, no "contact sales".
2. **A kennel owns its data.** Anyone can run their own copy. Nothing locks a kennel in.
3. **It cannot double book.** Not "it warns you". It cannot.
4. **A new worker can use it in ten minutes** without being trained.

## Principles

When two good ideas conflict, the one higher in this list wins.

### 1. The phone in the yard comes first

Every screen is designed at 360 pixels wide, for a thumb, in sunlight. Desktop is the same screen with more room. If a
feature needs a wide table to make sense, it needs redesigning.

### 2. The database says no

Rules that protect dogs, money or privacy are enforced by the database itself, where no screen, script or future
contributor can forget them. The app is allowed to be simple because the database is strict.

### 3. Use what the kennel already has

A kennel already has WhatsApp, a UPI ID and a phone. Wagbook opens WhatsApp with the message written and opens the UPI
app with the amount filled in. It does not ask anyone to apply for a WhatsApp Business API account, sign up with a
payment gateway, or pay a fee per message.

### 4. Parents never log in

A parent's time with Wagbook is one link at a time. A link shows one stay or one bill and nothing else.

### 5. India first, the world welcome

Defaults are Indian: rupees, UPI, GST, April financial year, lakh and crore, Asia/Kolkata. Each of those is a setting
on the kennel, not an assumption in the code, so a kennel in Nairobi or Lisbon can change them.

### 6. Fewer features, finished

A feature is finished when a tired person can use it correctly at the end of a twelve hour day. Wagbook would rather do
eight things like that than forty things halfway.

### 7. Boring technology

Postgres, server-rendered pages, HTML forms. No client state library, no ORM, no component kit. Fewer moving parts means
a volunteer or a coding agent can understand all of it.

### 8. Say true things

Wagbook never tells a parent something that did not happen. Updates are written or confirmed by a person. Counts come
from tasks that were ticked. There are no generated "Bruno had a great day!" messages.

## What Wagbook will not do

| It will not | Because |
| --- | --- |
| Take a cut of payments or process cards | Principle 3. Money goes straight from parent to kennel. |
| Have a paid plan or hold features back | The promise. |
| Show adverts or sell data | The promise. |
| Run a marketplace where parents compare kennels | It serves the kennel, not a platform. |
| Put tracking or analytics scripts on parent pages | Parents did not agree to that. |
| Make parents create an account | Principle 4. |
| Diagnose or advise on a pet's health | It records what the parent and vet said. |
| Give tax advice | It does arithmetic. Your accountant decides the rate. |

## How it differs from typical kennel software

- **One dog, one kennel, guaranteed.** Many systems track a count of free rooms. Wagbook also tracks which dog is in
  which kennel, and the database refuses an overlap.
- **Solo play is a first class thing.** Kennels that never mix dogs need a timetable of who is in which yard when.
  Wagbook can plan it and can tell an owner how many yards their promise requires.
- **Bills that survive an audit.** Issued invoices are frozen, numbered consecutively per financial year, and every
  change to money is in an audit log.
- **No vendor.** There is no company to go out of business. A kennel that self-hosts keeps running.

## The name

A wag, and a book: the kennel's register, kept by people who like dogs.
