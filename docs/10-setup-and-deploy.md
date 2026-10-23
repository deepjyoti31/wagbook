# 10. Setup and deployment

From nothing to a running Wagbook. Three parts: a Supabase project (the database), your own computer (to try it), and
a host (so your team can reach it).

> This guide was written alongside the code but **has not yet been followed end to end on a live project** (that is
> milestone M1). Supabase and Vercel also rename their menus from time to time. If a step does not match what you see,
> look for the nearest thing with the same meaning, and please fix this page.

## What you need

- A computer with [Node.js](https://nodejs.org) 22 or newer and git. (Version 22 is what is tested.)
- A free [Supabase](https://supabase.com) account.
- For deployment: a free [Vercel](https://vercel.com) account and the code in a GitHub repository.

## Part 1. Create the database

### 1.1 Make a project

1. Sign in to Supabase and create a new project.
2. **Region:** choose Mumbai (ap-south-1) if your kennel is in India. This cannot be changed later.
3. Set a strong database password and save it in a password manager. Wagbook itself never needs it; you need it for
   the command line and for backups.
4. Wait for the project to finish setting up.

### 1.2 Apply the migrations

The files in `supabase/migrations/` create every table and rule. Apply all nine, in name order. Choose one way.

**Way A: the Supabase command line (recommended).**

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF     # the ref is in your project's URL and settings
npx supabase db push
```

`db push` lists the nine files and asks before applying them. If the command line asks you to run `supabase init`
first, do so and keep the existing `migrations` folder.

**Way B: the SQL editor in the dashboard.**

Open the SQL editor. For each file in `supabase/migrations/`, in order from `…000100_foundation.sql` to
`…000900_storage.sql`: paste the whole file, run it, and check it says success before moving to the next. If one
fails, stop and read the error; do not carry on to the next file.

Way A records which migrations have been applied, so later updates are one command. With Way B you must keep track
yourself.

### 1.3 Check it worked

In the dashboard's table view you should see 23 tables in the `public` schema, every one showing row level security
enabled. In Storage there should be one private bucket called `pet-media`.

### 1.4 Set up sign-in

In Authentication settings:

1. **Site URL:** your public address, for example `https://book.yourkennel.in`. For now, while testing on your own
   computer, `http://localhost:3000`.
2. **Redirect URLs:** add `http://localhost:3000/auth/confirm**` and, later, `https://YOUR-DOMAIN/auth/confirm**`. The
   two stars at the end matter: they let the link say where to go next (a new password, an invitation).
3. **Email confirmation:** leave on. (For a quick private trial you may turn it off, then anyone can sign up with any
   address. Turn it back on before real use.)
4. **Email template (recommended).** In the "Confirm signup" template, make the link:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding
   ```

   The default template also works; this one sends the person straight to your own site.

5. **Reset password template (recommended).** In the "Reset Password" template, make the link:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/login/new-password
   ```

   With it, the link works on any phone, not only the one that asked for it. "Forgot your password?" on the sign-in
   page sends this email (M45).

Supabase's built-in email sender is for testing and allows only a few emails an hour. Before your team signs up,
connect your own email provider under the SMTP settings.

### 1.5 Copy two values

In the project's API settings, copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **publishable key** (starts with `sb_publishable_`). Older projects show an **anon** key instead; that works too.

Both are safe to put in a browser. **Do not copy the secret or service role key anywhere. Wagbook does not use it.**

## Part 2. Run it on your computer

```bash
git clone https://github.com/YOUR-ACCOUNT/wagbook.git
cd wagbook
npm install
cp .env.example .env.local
```

Open `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=
```

Then:

```bash
npm run dev
```

Open http://localhost:3000. If the values are missing, signing in or opening `/app` takes you to a page called
"Connect a database" that says what to do. If they are present but wrong, sign-in says it could not reach the server.

### First run

1. **Create an account**, then click the link in the confirmation email.
2. **Set up your kennel:** its name, a link name (this becomes your intake form address), and your name.
3. **Add your kennels:** a prefix, how many, and the first number. Sixty kennels with prefix K gives K01 to K60.
4. **More, then Settings:** your phone and WhatsApp number, usual prices, your UPI ID. Leave tax off unless your
   accountant has said otherwise.
5. **Pets, then Add a pet**, and **Book a stay**.
6. Try to book a second pet into the same kennel for the same nights. Wagbook should refuse. That refusal is the point
   of the whole thing.
7. **More, then Forms from parents:** open your intake link in a private window, fill it in as a parent would, then
   come back and accept it.
8. **More, then People:** invite a colleague (they need to create an account first).

### Try it with demo data first (needs Docker)

If you have Docker, you can run a whole Supabase on your own computer with a made-up kennel in it, before creating
anything online:

```bash
npx -y supabase@2.120.0 start
```

The first time downloads several gigabytes. It applies the migrations and `supabase/seed.sql`, then prints an API URL
and a publishable key. Put those two in `.env.local`, run `npm run dev`, and sign in as `owner@demo.wagbook.test`,
`manager@demo.wagbook.test` or `staff@demo.wagbook.test`, password `wagbook-demo`. `npx -y supabase@2.120.0 db reset`
puts the demo back as it was. Nothing here is real; never load the demo data into a real kennel's project.

## Part 3. Put it online

### 3.1 Vercel

1. Push the repository to GitHub.
2. In Vercel, import the repository. It detects Next.js; leave the build settings alone.
3. Add environment variables for Production (and Preview if you use it):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Your project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Your publishable key |
   | `NEXT_PUBLIC_SITE_URL` | Your public address, no trailing slash, for example `https://book.yourkennel.in` |

4. Deploy.
5. Add your domain in Vercel's domain settings if you have one.
6. Go back to Supabase (step 1.4) and set the Site URL and Redirect URL to the real address.

`NEXT_PUBLIC_` values are built into the app. After changing one, redeploy. To offer "Continue with Google", see "Sign
in with Google" below.

Vercel's free plan is meant for personal, non-commercial projects. Read their terms; a kennel running its business on
Wagbook may need their paid plan or another host.

### 3.2 Any other host

Wagbook is a standard Next.js server:

```bash
npm ci
npm run build      # with the three variables set
npm run start      # listens on port 3000
```

Put it behind HTTPS. Set `NEXT_PUBLIC_SITE_URL`; without it, production refuses to build links for parents rather
than guess the address. The proxy in front must set `X-Real-IP` (or `X-Forwarded-For`) to the visitor's address and
overwrite whatever the visitor sent, or the rate limits can be dodged. To run everything, Supabase included, on your
own server, see [14-self-hosting.md](14-self-hosting.md).

### 3.3 Install it on phones

Open the site in Chrome on Android or Safari on iPhone and choose "Add to Home screen". It then opens full screen like
an app.

## Looking after it

### Supabase's free plan

At the time of writing the free plan includes a 500 MB database, 50,000 monthly active users and two projects, and
**pauses a project after a week with no activity**. A kennel in daily use will not be paused, but a test project will.
A paused project is restored from the dashboard. The free plan has no automatic backups. Check
[supabase.com/pricing](https://supabase.com/pricing) for current terms.

For a kennel that depends on Wagbook, the paid plan (25 US dollars a month at the time of writing) gives daily backups
and no pausing, and is worth it.

### Backups

Whatever plan you are on, take your own copies of the database and of the `pet-media` bucket, and practise restoring
them. [15-backup-and-restore.md](15-backup-and-restore.md) has the commands and the drill.

### Rate limits

The app limits how often one address may sign in, send the intake form or join (`src/lib/rate-limit.ts`). Supabase Auth
has its own limits, which also hold for anyone who skips the app. In the dashboard, Authentication, Rate Limits, check
that sign-ins and sign-ups are at most 30 per 5 minutes per address, and token verifications (two-step codes) at most
30 per 5 minutes. On Vercel, where each copy of the app counts on its own, add a Firewall rate limit rule for `POST`
requests to `/login` and `/i/` as well.

### Sign in with Google

Optional (M45). People can then sign in with their Google account instead of a password; someone who already has a
Wagbook account with the same email lands in that account.

1. In the Google Cloud console, make a project, then APIs and Services, OAuth consent screen: an external app with your
   kennel's name and email. Then Credentials, Create credentials, OAuth client ID, type "Web application". Under
   "Authorised redirect URIs" add the callback address Supabase shows you in the next step (it looks like
   `https://YOUR-PROJECT.supabase.co/auth/v1/callback`).
2. In Supabase, Authentication, Sign In / Providers, Google: switch it on and paste the client ID and secret.
3. Set the environment variable `GOOGLE_SIGN_IN=on` for Wagbook (on Vercel, under Environment Variables), and redeploy.
   Without it the button is not shown, so nothing changes for a kennel that does not want it.

Two-step sign-in still applies after Google. Someone who only ever signed in with Google has no password; they can add
one with "Forgot your password?".

### Overnight jobs

The migrations switch on Supabase's `pg_cron` and schedule `run_nightly_jobs()` at 02:00 India time (20:30 UTC): it
makes food deliveries three weeks ahead for every subscription, and clears problems and job runs older than 90 days
(M46). More, Problems and overnight jobs shows when each last ran and whether it worked. To run them by hand, in the SQL
editor: `select public.run_nightly_jobs();`. Running them twice does nothing twice.

### Know when it breaks

`https://YOUR-DOMAIN/api/health` answers `{"status":"ok"}` while Wagbook can reach its database, and an error (503) when
it cannot (M48). Put that address in a free uptime service (UptimeRobot, Better Stack and others), checking every five
minutes, with an alert to the owner's phone or email. Errors the server meets while someone is signed in are listed for
owners under More, Problems and overnight jobs.

### Photos and space

Supabase's free plan includes 1 GB of file storage. Photos are made smaller on the phone (about 1,600 pixels), so a
photo is usually 200 to 400 KB: a few thousand photos fill the free plan. More, Photos and space shows how much each
month takes. When space runs short, an owner downloads an old month as a ZIP (keep it on Google Drive or a computer)
and then removes that month's photos from Wagbook; a small copy of each stays (M49, D49). Nothing is removed by itself.

### Two-step sign-in

Supabase turns authenticator apps (TOTP) on by default; check under Authentication, Sign In / Providers, Multi-Factor.
Each person turns it on for themselves in Wagbook under More. If someone loses their phone, an administrator removes
their factor: in the dashboard, Authentication, Users, open the person, and delete the factor under "Multi-factor
authentication". They can then sign in with the password and set it up again. Do this only after checking it really
is them (a call on a number you already have).

Until then, a person who saved their recovery codes (More, Two-step sign-in) can still work: "Use a recovery code
instead" on the code page lets that one sign-in in, once per code (D43). A code cannot remove the lost phone from
their account; that stays with you, as above. Removing the factor also voids every recovery code made for it.

### Check the browser protections after deploying

```bash
curl -sI https://YOUR-DOMAIN/login | grep -i content-security-policy
```

The answer must contain `script-src 'self' 'nonce-` followed by `'sha256-`. If it has no `script-src`, the server could
not read `.next/build-manifest.json` and says so in its log (D23); pages still work, with weaker protection.

### Updating Wagbook

```bash
git pull
npm install
npx supabase db push        # applies any new migrations
```

Then redeploy. Always apply migrations before deploying the app that expects them.

### Your own database is yours

It is plain Postgres. You can connect any reporting tool to it, export it, or move to another Postgres host. If you
query it directly, remember you are bypassing Wagbook's access rules: treat the database password like the keys to the
kennel.

## When something goes wrong

| What you see | Likely cause | Fix |
| --- | --- | --- |
| "Connect a database" page | Variables missing, or the key is shorter than expected | Check `.env.local` or the host's variables; restart or redeploy |
| "Could not reach the server" at sign-in | Wrong project URL, project paused, or no internet | Check the URL; restore the project in the dashboard |
| Confirmation email never arrives | Built-in sender's hourly limit, or spam folder | Wait, check spam, or set up SMTP |
| Confirmation link goes to an error | Redirect URL not in the allow list, or Site URL wrong | Step 1.4 |
| The password reset link opens the home page, or says the link expired | Redirect URL without the two stars, or the link opened on another phone with the default template | Step 1.4, items 2 and 5 |
| "Continue with Google" says it did not work | Google client's redirect URI or Supabase's Google provider not set | "Sign in with Google" above |
| More, Problems says the overnight jobs have not run | pg_cron not on (self-hosted), or the first night has not come | "Overnight jobs" above; `docs/14-self-hosting.md` |
| After sign-in you always land on "Set up your kennel" | You have no kennel yet, or your invitation is not accepted | Create one, or accept the invitation shown there |
| "You do not have permission to do that" | Your role does not allow it | Ask an owner or manager |
| A migration fails with "already exists" | It was applied before | With Way A this cannot happen; with Way B, skip files already run |
| A migration fails otherwise | A difference between real Supabase and the test stand-in | Open an issue with the file name and the full error |
| Parents' links point to the wrong address | `NEXT_PUBLIC_SITE_URL` wrong or unset at build time | Set it and redeploy |
