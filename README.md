# 心灵星空 (working title) — Starry Mind

An anonymous, login-free confession/wish web app. No accounts: users post a
"pain bubble" or a "wish shooting star", pick their own passphrase (a random
4-digit suffix is appended for uniqueness), and anyone worldwide can read and
reply in any language. All users share one global sky, built per the product
requirements doc in this repo's history.

## Stack

- **Cloudflare Pages** — serves `public/` as the static frontend (no build
  step; plain HTML/CSS/JS, ES modules).
- **Cloudflare Pages Functions** (`functions/`) — the API, colocated with the
  Pages project so there's a single deploy.
- **Cloudflare D1** — SQLite-compatible storage for bubbles and replies (see
  `migrations/0001_init.sql`).
- **`cron-worker/`** — a small standalone Worker (Pages Functions can't be
  cron-triggered) that deletes content older than `RETENTION_DAYS`.

## Local setup

```bash
npm install
wrangler login

# Create the D1 database, then paste the printed database_id into both
# wrangler.toml and cron-worker/wrangler.toml.
npm run db:create

# Apply the schema locally and remotely.
npm run db:migrate:local
npm run db:migrate:remote

# Local dev server (Pages + Functions + local D1).
npm run dev
```

## Deploy

```bash
npm run deploy                 # deploys the Pages project (frontend + API)
cd cron-worker && npx wrangler deploy   # deploys the retention-cleanup Worker
```

The cron Worker's `wrangler.toml` already declares a daily trigger
(`0 3 * * *`); Cloudflare schedules it automatically once deployed.

### Or: deploy via GitHub Actions

`.github/workflows/deploy.yml` runs the same steps on GitHub's runners —
useful when you don't want to run `wrangler` locally. It creates the D1
database if missing, migrates it, and deploys both the Pages project and the
cleanup Worker. Add two repository secrets under **Settings → Secrets and
variables → Actions**:

- `CLOUDFLARE_API_TOKEN` — a token with Account-level `Cloudflare Pages: Edit`,
  `D1: Edit`, and `Workers Scripts: Edit` permissions, scoped to your account.
- `CLOUDFLARE_ACCOUNT_ID` — found on the right sidebar of any page in the
  Cloudflare dashboard.

Then run the workflow from the **Actions** tab (or push to this branch).

## API surface

| Method | Path                          | Purpose                                   |
|--------|-------------------------------|--------------------------------------------|
| GET    | `/api/bubbles`                | List recent, non-hidden bubbles for the sky |
| POST   | `/api/bubbles`                | Create a bubble (`type`, `content`, `code`, `lang`) |
| GET    | `/api/bubbles/:id`             | Fetch one bubble + its replies (click-to-read) |
| GET    | `/api/bubbles/by-code/:code`   | Owner lookup by passphrase                 |
| POST   | `/api/bubbles/:id/replies`     | Add a reply/blessing                       |
| POST   | `/api/report`                  | Report a bubble or reply (`targetType`, `targetId`); auto-hides at 3 reports |

Content safety (`src/filters.js`, shared by all endpoints):
- Abusive/attack language is **blocked** outright.
- Suicide-method / crisis phrasing is **not blocked** — it's flagged
  (`crisis_flag`) so the client can show an extra crisis-line reminder; the
  static crisis banner on the "pain" compose sheet is always shown regardless.
- Phone numbers, emails, and IM handles (WeChat/WhatsApp/Telegram/Line/
  Kakao/Instagram/Snapchat/Signal/QQ/Zalo/Viber/Skype…) are auto-masked with
  `***`, not blocked — publishing still succeeds.

Coverage is zh/en only for now, per the PRD; the report/auto-hide mechanism
is the backstop for everything else.

## Open items (from the PRD's "to confirm" list)

- Final product name.
- Retention period: currently defaults to 180 days (`RETENTION_DAYS` in
  `cron-worker/wrangler.toml`) — PRD says "6–12 months, TBD".
- Sensitive-word list is a minimal zh/en seed; expand as needed.
- No CAPTCHA/anti-spam beyond a honeypot field + a client-side "too fast to
  be human" submit-timing check — revisit if spam becomes a problem.
- `public/icons/icon.svg` is a placeholder; real visual design/icons are
  still pending per the PRD.
- Coffee-donation link in `public/index.html` (`#coffee-link`) points to a
  placeholder Ko-fi URL — swap for the real one before launch.
