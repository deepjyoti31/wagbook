# 14. Running Wagbook on your own server

Wagbook does not need Vercel or Supabase's hosted service. Both halves are open source: this page runs Supabase's own
self-hosting setup and Wagbook side by side on one Linux server with Docker, behind Caddy, which gets HTTPS
certificates by itself.

Choose this if the kennel's data must stay on a machine you control, or to run Wagbook for several kennels. If you
only want Wagbook working, [10-setup-and-deploy.md](10-setup-and-deploy.md) (hosted Supabase and Vercel) is less
work: someone else looks after the database server, its updates and its backups. On your own server, that someone is
you.

## What you need

- A Linux server with at least 2 CPUs, 4 GB of memory and 40 GB of disk, Docker and Docker Compose. In India, choose a
  Mumbai or Hyderabad data centre.
- Two names pointing at the server, for example `book.yourkennel.in` (Wagbook) and `api.book.yourkennel.in`
  (Supabase). Ports 80 and 443 open; nothing else.
- An email account that can send mail by SMTP (for sign-up confirmation and invitations by email).
- This repository on the server, and Node.js 22 (for the Supabase command line tool that applies migrations).

## The layout

```
            browser
               |  https
            [ Caddy ]  deploy/compose.yml, deploy/Caddyfile
             /     \
   book.example.in   api.book.example.in
       |                  |
  [ Wagbook ]  ------> [ Kong ] -> Auth, PostgREST, Storage -> [ Postgres ]
  (Dockerfile)          Supabase's docker/ folder
```

Wagbook's server reaches Supabase at the same `api.` address the browser uses: inside Docker, that name points
straight at Caddy (a network alias in `deploy/compose.yml`), so the request never leaves the machine.

## Part 1. Supabase

Follow Supabase's own guide, "Self-Hosting with Docker" (supabase.com/docs/guides/self-hosting/docker). In short:

```bash
git clone --depth 1 https://github.com/supabase/supabase
mkdir -p /srv/supabase && cp -r supabase/docker/* /srv/supabase/ && cp supabase/docker/.env.example /srv/supabase/.env
cd /srv/supabase
```

In `/srv/supabase/.env`, before the first start:

| Setting | Value |
| --- | --- |
| `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` | New secrets, made as Supabase's guide says. Never the examples. |
| `SITE_URL` | `https://book.yourkennel.in` |
| `ADDITIONAL_REDIRECT_URLS` | `https://book.yourkennel.in/auth/confirm` |
| `API_EXTERNAL_URL`, `SUPABASE_PUBLIC_URL` | `https://api.book.yourkennel.in` |
| `ENABLE_EMAIL_SIGNUP` | `true` |
| `ENABLE_EMAIL_AUTOCONFIRM` | `false` (people confirm their email) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_ADMIN_EMAIL`, `SMTP_SENDER_NAME` | Your mail account |

The `SERVICE_ROLE_KEY` stays in this file and nowhere else. Wagbook never uses it.

Supabase's compose file publishes its API gateway on port 8000 and Postgres on 5432. Caddy will front the gateway,
so close both to the outside world (a firewall that allows only 22, 80 and 443), or remove those `ports:` lines.

Two-step sign-in with authenticator apps is on in Supabase Auth by default. If your version has it off, add
`GOTRUE_MFA_TOTP_ENROLL_ENABLED: "true"` and `GOTRUE_MFA_TOTP_VERIFY_ENABLED: "true"` to the `auth` service's
`environment`.

Start it: `docker compose up -d`. Note the name of its network (`docker network ls`; usually `supabase_default`).

## Part 2. Wagbook's database

From the repository, apply every migration (the connection string uses Supabase's pooler, as its guide describes):

```bash
cd /srv/wagbook
npx -y supabase@2.120.0 db push --db-url 'postgresql://postgres.your-tenant-id:POSTGRES_PASSWORD@localhost:5432/postgres'
```

Do not load `supabase/seed.sql`: it is the invented demo kennel.

## Part 3. Wagbook and Caddy

```bash
cp deploy/.env.example deploy/.env
```

Fill in `deploy/.env`: the two names, the two `https://` addresses, `SUPABASE_PUBLISHABLE_KEY` (Supabase's `ANON_KEY`),
`SUPABASE_UPSTREAM=kong:8000` and `SUPABASE_NETWORK` (from Part 1). Then:

```bash
docker compose -f deploy/compose.yml --env-file deploy/.env up -d --build
```

The `NEXT_PUBLIC_` values are built into the app: after changing one, run the same command again. If the server is
behind a network that inspects HTTPS and `npm ci` fails on certificates, build with
`docker build --secret id=ca,src=/path/to/ca-bundle.crt` (see the `Dockerfile`).

Caddy sets `X-Real-IP` and `X-Forwarded-For` from the connection and drops what a visitor sends, which the rate limits
depend on ([05-security-and-privacy.md](05-security-and-privacy.md)).

## Part 4. Check it

1. `curl -sI https://book.yourkennel.in/login | grep -i content-security-policy` shows `script-src 'self' 'nonce-`
   followed by `'sha256-`.
2. Open `https://book.yourkennel.in`, create your account, confirm the email, create the kennel. Then follow
   [10-setup-and-deploy.md](10-setup-and-deploy.md) from "Part 2" onwards (kennels, prices, team).
3. Turn on two-step sign-in for yourself under More.
4. Set up backups before the first real booking: [15-backup-and-restore.md](15-backup-and-restore.md). On your own
   server, nobody else takes them.

## Updating

[16-releasing.md](16-releasing.md), "Updating an installation". Update Supabase's containers as its own guide says,
and the server itself (security updates) regularly.

## The public demo

A demo anyone can try: the invented kennel of `supabase/seed.sql`, with its three accounts shown on the sign-in page,
put back every night. Run it on its **own** server and Supabase, never beside a real kennel.

1. Parts 1 to 3 as above, with `ENABLE_EMAIL_AUTOCONFIRM=true` in Supabase's `.env` (visitors cannot confirm email)
   and `WAGBOOK_DEMO=1` in `deploy/.env`. The app then says on every screen that it is a demo, lists the accounts on
   the sign-in page, and refuses two-step sign-in (one visitor must not lock the shared accounts).
2. Load the demo once, and every night at 03:00 India time, with `deploy/demo-reset.sh`. It deletes every kennel and
   account (including any password a visitor changed), removes the files visitors added, and runs
   `supabase db reset`, which applies the migrations and the seed again. It refuses to run against a database that has
   a kennel more than three days old, which the demo never has.

   ```cron
   30 21 * * *  DEMO_DB_URL='postgresql://postgres...' SUPABASE_DIR=/srv/supabase /srv/wagbook/deploy/demo-reset.sh >> /var/log/wagbook-demo-reset.log 2>&1
   ```

3. Link to it from the README once it is up.

Between resets, visitors can see what other visitors typed. The sign-in page says so; nothing real belongs there.

## What has been verified

| Thing | How | Confidence |
| --- | --- | --- |
| The `Dockerfile` builds, and the image serves Wagbook with its script policy (the build manifest is in the image) | Built and run on 15 October 2026 | High |
| `deploy/compose.yml` and `deploy/Caddyfile`: both addresses through Caddy, the app reaching Supabase by the network alias, sign-in, Today, Care, Bookings, Pets, More and two-step sign-in with no browser errors, the demo notices | Run on one computer against the local Supabase from the CLI (`SUPABASE_UPSTREAM=supabase_kong_wagbook:8000`, `SUPABASE_NETWORK=supabase_network_wagbook`, `http://wagbook.localhost` and `http://api.wagbook.localhost`) | High for that setup |
| Rate limits behind Caddy cannot be dodged by sending your own `X-Real-IP` or `X-Forwarded-For` | 22 sign-in tries, each with a different forged address: the 21st onwards were slowed down | High |
| `deploy/demo-reset.sh` | Run against the local Supabase: a visitor's account and the files folder were removed, the demo kennel and its three accounts came back | Medium: locally `supabase db reset` recreates the whole database; against a remote one it resets the schemas it manages |
| Supabase's own self-hosting setup (Part 1), HTTPS certificates, SMTP, `db push` through its pooler | Not done here: needs a server with public names | The CLI's local Supabase runs the same services; settings and names in Part 1 may differ by Supabase version |

To try it on one computer, the way it was verified: start the local Supabase (`npx -y supabase@2.120.0 start`), put
the values above in `deploy/.env` with `WAGBOOK_DOMAIN=http://wagbook.localhost` and
`SUPABASE_DOMAIN=http://api.wagbook.localhost` (browsers send every `*.localhost` name to the computer itself), and
open `http://wagbook.localhost`.
