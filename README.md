# SunoFlow

[![CI](https://github.com/lx-0/SunoFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/lx-0/SunoFlow/actions/workflows/ci.yml)

A mobile-first web app for managing and generating music with the [Suno API](https://sunoapi.org). Features AI music generation, playlist management, lyrics editing, audio waveform playback, and a public sharing system.

## Features

- Mobile-responsive layout with bottom navigation and swipe gestures
- User registration and login (email/password + Google OAuth)
- Email verification, password reset, and notification system
- AI music generation via Suno API with a generation queue and progress tracking
- Song library with favorites, playlists, history, and discovery
- Audio waveform player, mashup studio, and audio upload
- Lyrics and prompt templates with LLM-powered generation
- Public song/playlist sharing via shareable slugs (`/s/[slug]`, `/p/[slug]`)
- Persona manager and style boost
- Admin dashboard: users, analytics, logs, error reports
- Swagger API docs at `/api/docs`
- Sentry error tracking, Pino structured logging, rate limiting

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Auth | NextAuth.js v5 + Prisma adapter |
| ORM | Prisma v5 |
| Database | PostgreSQL 16 |
| Email | Mailjet (falls back to console log) |
| LLM | OpenAI API (gpt-4o-mini) |
| Music API | sunoapi.org |
| Monitoring | Sentry |
| Logging | Pino |
| Testing | Vitest (unit) + Playwright (E2E) |
| Package manager | pnpm |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- PostgreSQL 16 (or use the Docker Compose stack below)

### 1. Clone and install

```bash
git clone https://github.com/lx-0/SunoFlow.git
cd SunoFlow
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — the minimum required vars are:

```env
SUNOFLOW_DATABASE_URL="postgres://user:password@localhost:5432/sunoflow"
DATABASE_URL="postgres://user:password@localhost:5432/sunoflow"
AUTH_SECRET="<generate with: npx auth secret>"
AUTH_URL="http://localhost:3000"
```

See [Environment Variables](#environment-variables) for the full reference.

### 3. Run the database and apply migrations

```bash
# Option A: use Docker Compose to spin up Postgres
docker compose up db -d

# Option B: use an existing Postgres instance — skip the above

pnpm exec prisma migrate deploy
```

### 4. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/login`. Click **Create one** to register.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values. All variables are documented inline in `.env.example`.

| Variable | Required | Description |
|---|---|---|
| `SUNOFLOW_DATABASE_URL` | **Yes** | Postgres connection URL (used by Prisma schema) |
| `DATABASE_URL` | **Yes** | Postgres connection URL (used by Next.js env validation) |
| `AUTH_SECRET` | **Yes** | Random secret for NextAuth — generate with `npx auth secret` |
| `AUTH_URL` | **Yes** | Public base URL of the app (e.g. `http://localhost:3000`) |
| `SUNOAPI_KEY` | No | API key from sunoapi.org for music generation |
| `OPENAI_API_KEY` | No | OpenAI API key for LLM features (lyrics, prompts) |
| `OPENAI_MODEL` | No | OpenAI model override (default: `gpt-4o-mini`) |
| `MAILJET_API_KEY` | No | Mailjet API key for transactional email |
| `MAILJET_SECRET_KEY` | No | Mailjet secret key |
| `EMAIL_FROM` | No | Sender address for transactional email |
| `AUTH_GOOGLE_ID` | No | Google OAuth client ID |
| `AUTH_GOOGLE_SECRET` | No | Google OAuth client secret |
| `NEXT_PUBLIC_SITE_URL` | No | Public-facing URL for OG tags and sitemaps |
| `ALLOWED_ORIGINS` | No | Comma-separated allowed CORS origins |
| `RATE_LIMIT_MAX_GENERATIONS` | No | Max AI generation requests per user per window (default: 10) |
| `LOG_LEVEL` | No | Pino log level: `trace\|debug\|info\|warn\|error\|fatal` (default: `info`) |
| `LOG_PRETTY` | No | Pretty-print logs in dev (`true`/`false`) |
| `SENTRY_DSN` | No | Sentry DSN for server-side error tracking |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for client-side error tracking |
| `SENTRY_AUTH_TOKEN` | No | Sentry auth token for source map uploads during build |
| `SENTRY_ORG` | No | Sentry organisation slug |
| `SENTRY_PROJECT` | No | Sentry project slug |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (`sk_test_…` / `sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | No | Stripe publishable key (`pk_test_…` / `pk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret (`whsec_…`) — required for `/api/webhooks/stripe` |
| `STRIPE_PRICE_STARTER` | No | Stripe Price ID for the Starter plan ($9.99/mo) |
| `STRIPE_PRICE_PRO` | No | Stripe Price ID for the Pro plan ($24.99/mo) |
| `STRIPE_PRICE_STUDIO` | No | Stripe Price ID for the Studio plan ($49.99/mo) |

> **Note:** Both `DATABASE_URL` and `SUNOFLOW_DATABASE_URL` must point to the same Postgres instance. This is a current quirk of the Prisma schema configuration.

---

## Development Guide

### Database setup

```bash
# Apply all pending migrations
pnpm exec prisma migrate deploy

# Create and apply a new migration during active development
pnpm exec prisma migrate dev --name <migration-name>

# Open Prisma Studio (GUI for browsing data)
pnpm exec prisma studio
```

### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with Turbopack (also runs `prisma migrate deploy`) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm test` | Run unit tests (Vitest) |
| `pnpm test:watch` | Watch mode unit tests |
| `pnpm test:e2e` | Run Playwright E2E tests |
| `pnpm test:e2e:headed` | Run E2E tests with visible browser |

### Linting and formatting

```bash
pnpm lint
```

ESLint is configured via `eslint.config.mjs`. Husky + lint-staged run `next lint` automatically on staged `.ts`/`.tsx` files before each commit.

### Running tests

**Unit tests (Vitest):**

```bash
pnpm test
# With coverage
pnpm exec vitest run --coverage
```

**E2E tests (Playwright):**

```bash
# Make sure the dev server is running first (pnpm dev)
pnpm test:e2e
```

Playwright config lives in `playwright.config.ts`. E2E tests are under `e2e/`.

### Stripe webhook forwarding (local development)

To test the Stripe billing integration locally you need the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward webhook events from Stripe to your local server.

**1. Install the Stripe CLI**

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Linux / WSL — download from https://github.com/stripe/stripe-cli/releases
# or via the shell installer:
curl -s https://packages.stripe.dev/api/security/keypair/stripe-cli-gpg/public | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe
```

**2. Log in to the Stripe CLI**

```bash
stripe login
```

**3. Forward webhook events to your local server**

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The CLI will print a webhook signing secret that begins with `whsec_`. Copy it into your `.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_<the-value-printed-by-stripe-listen>
```

**4. Trigger test events**

In a separate terminal you can fire any Stripe event against your local handler:

```bash
# Simulate a successful subscription creation
stripe trigger customer.subscription.created

# Simulate a failed payment
stripe trigger invoice.payment_failed

# Simulate cancellation
stripe trigger customer.subscription.deleted
```

All events are logged via Pino (`payment events` logger) and any errors are captured in Sentry if configured.

**5. Full end-to-end checkout test**

1. Start the dev server: `pnpm dev`
2. Start webhook forwarding: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
3. Open `http://localhost:3000/pricing` and click an upgrade button.
4. Use Stripe test card `4242 4242 4242 4242` with any future expiry and any CVC.
5. On success you are redirected to `/settings/billing?success=1` and the user's subscription record is updated.

> Stripe test card numbers: `4242 4242 4242 4242` (succeeds), `4000 0000 0000 9995` (payment fails / PAST_DUE).

### Project structure

```
src/
├── app/
│   ├── api/                      API route handlers
│   │   ├── auth/[...nextauth]/   NextAuth route handler
│   │   ├── health/               Health check endpoint
│   │   ├── songs/                Songs CRUD + discovery + favorites
│   │   ├── generate/             AI music generation
│   │   ├── playlists/            Playlist management
│   │   ├── lyrics/               Lyrics generation
│   │   ├── suno/                 Suno API proxy
│   │   ├── dashboard/            Dashboard stats
│   │   ├── admin/                Admin endpoints
│   │   └── v1/                   Public REST API (Swagger at /api/docs)
│   ├── generate/                 Generate page
│   ├── songs/                    Song library
│   ├── playlists/                Playlists
│   ├── library/                  Library browser
│   ├── discover/                 Discover page
│   ├── favorites/                Favorites
│   ├── history/                  Generation history
│   ├── inspire/                  Inspiration/prompts
│   ├── personas/                 Persona manager
│   ├── analytics/                Analytics view
│   ├── admin/                    Admin dashboard
│   ├── s/[slug]/                 Public song share page
│   ├── p/[slug]/                 Public playlist share page
│   ├── login/                    Login page
│   ├── register/                 Registration page
│   ├── profile/                  User profile
│   ├── settings/                 Settings (API key, theme, etc.)
│   └── page.tsx                  Dashboard / home
├── components/
│   ├── AppShell.tsx              Mobile layout shell + bottom nav
│   ├── GlobalPlayer.tsx          Persistent audio player
│   ├── GenerateForm.tsx          Music generation form
│   ├── SongsGalleryView.tsx      Song grid/list view
│   ├── PlaylistsView.tsx         Playlist browser
│   ├── AdminShell.tsx            Admin layout
│   └── ...                       Other UI components
├── hooks/                        Custom React hooks
└── lib/
    ├── auth.ts                   NextAuth config
    ├── prisma.ts                 Prisma client singleton
    ├── env.ts                    Env var validation (typed)
    ├── logger.ts                 Pino logger
    ├── llm.ts                    OpenAI client
    ├── email.ts                  Mailjet email helpers
    ├── rate-limit.ts             Rate limiting
    ├── credits.ts                Credit system
    ├── sunoapi/                  Suno API client
    └── ...
prisma/
└── schema.prisma                 DB schema
```

### Git hooks

[Husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) run `next lint` on staged `.ts`/`.tsx` files before each commit. Hooks install automatically via the `prepare` script when you run `pnpm install`.

If a commit is blocked by lint errors, fix them, re-stage, and commit again.

---

## Deployment Guide

### Docker (recommended)

**Using Docker Compose (local / staging):**

```bash
# Build and start both Postgres and the app
docker compose up --build

# Run in the background
docker compose up --build -d
```

The app will be available at [http://localhost:3000](http://localhost:3000).

**Using Docker directly (production):**

1. Build the image:

```bash
docker build -t sunoflow:latest .
```

2. Run with a Postgres instance:

```bash
docker run -d \
  --name sunoflow \
  -p 3000:3000 \
  -e SUNOFLOW_DATABASE_URL="postgres://user:password@db-host:5432/sunoflow" \
  -e DATABASE_URL="postgres://user:password@db-host:5432/sunoflow" \
  -e AUTH_SECRET="<your-auth-secret>" \
  -e AUTH_URL="https://yourdomain.com" \
  sunoflow:latest
```

The container automatically runs `prisma migrate deploy` on startup before starting the Next.js server (see `docker-entrypoint.sh`).

### Railway

The project is pre-configured for [Railway](https://railway.app) via `railway.toml`.

1. Create a new Railway project and add a **PostgreSQL** plugin.
2. Link the repo.
3. Set the required environment variables (see the table above) in the Railway dashboard.
4. Deploy — Railway will build using the `Dockerfile` and run `prisma migrate deploy` on startup.

**Required environment variables for Railway:**

```
SUNOFLOW_DATABASE_URL   # Set to your Railway Postgres URL
DATABASE_URL            # Same as above
AUTH_SECRET             # Generate with: npx auth secret
AUTH_URL                # Your Railway public URL (e.g. https://sunoflow.up.railway.app)
```

### Database migrations

Migrations run automatically on container startup (`docker-entrypoint.sh`). To run them manually:

```bash
# Against the production database
DATABASE_URL="postgres://..." pnpm exec prisma migrate deploy
```

To roll back a failed migration:

```bash
pnpm exec prisma migrate resolve --rolled-back <migration-name>
```

### Database backups

Production backups run automatically every day at **01:00 UTC** via
`.github/workflows/db-backup.yml`. Each run takes a `pg_dump`, restores it
into a sidecar Postgres to prove it is loadable, and uploads the `.pgdump` as
a GitHub artifact (30 / 90 / 365-day retention for daily / weekly / monthly).
Full restore procedure and disaster-recovery notes live in
[`docs/backup-runbook.md`](docs/backup-runbook.md).

To run a backup manually from your laptop:

```bash
DATABASE_URL="postgres://..." ./scripts/backup-db.sh
```

The script creates a compressed `pg_dump --format=custom` archive and applies automatic rotation:

| Tier    | Kept | Triggered when                |
|---------|------|-------------------------------|
| Daily   | 7    | Every day (except Sun / 1st)  |
| Weekly  | 4    | Sundays                        |
| Monthly | 3    | 1st day of the month          |

**Environment variables:**

| Variable    | Required | Description                                                      |
|-------------|----------|------------------------------------------------------------------|
| `DATABASE_URL` | Yes   | Postgres connection URL                                          |
| `BACKUP_DIR`   | No    | Local directory for backup files (default: `./backups`)         |
| `S3_BUCKET`    | No    | `s3://bucket/prefix` — when set, uploads each backup to S3      |
| `AWS_PROFILE`  | No    | AWS CLI profile (optional, used with `S3_BUCKET`)               |

#### Restoring a backup

```bash
# Restore to a temporary verification database, then drop it
DATABASE_URL="postgres://..." ./scripts/restore-db.sh ./backups/daily_20260329T010000Z.pgdump

# Restore to a named target database (drops & recreates it — use with care)
DATABASE_URL="postgres://..." ./scripts/restore-db.sh ./backups/daily_20260329T010000Z.pgdump \
  --target-db sunoflow_staging
```

The restore script:
1. Creates (or recreates) the target database.
2. Runs `pg_restore --no-owner --exit-on-error`.
3. Queries row counts on 15 key tables (`User`, `Song`, `Playlist`, `Subscription`, `CreditUsage`, …) and the `_prisma_migrations` table.
4. Prints a verification report and exits non-zero if any check fails.

#### Round-trip verification

```bash
# 1. Take a backup
DATABASE_URL="postgres://..." ./scripts/backup-db.sh

# 2. Identify the latest backup file
LATEST=$(ls -1t ./backups/*.pgdump | head -1)

# 3. Restore and verify
DATABASE_URL="postgres://..." ./scripts/restore-db.sh "$LATEST"
```

### Health check

The app exposes a health check endpoint:

```
GET /api/health
```

Returns `200 OK` with `{ "status": "ok" }` when the service is healthy. Used by Docker (`HEALTHCHECK`) and Railway (`healthcheckPath`).

### Production checklist

- [ ] `AUTH_SECRET` set to a strong random value (`npx auth secret`)
- [ ] `AUTH_URL` set to the public HTTPS URL of the app
- [ ] `SUNOFLOW_DATABASE_URL` and `DATABASE_URL` point to production Postgres
- [ ] `SUNOAPI_KEY` configured if music generation is needed
- [ ] `OPENAI_API_KEY` configured if LLM features are needed
- [ ] Mailjet configured if email is needed (see [docs/mailjet-setup.md](docs/mailjet-setup.md))
- [ ] Sentry DSN set for error tracking
- [ ] `NEXT_PUBLIC_SITE_URL` set for correct OG tags and share links
- [ ] HTTPS enforced at the reverse proxy / platform level
- [ ] Database backups configured

---

## CI/CD

GitHub Actions runs lint, type check, unit tests, build, and E2E tests on every push to `main` and on pull requests.

**Required GitHub secrets:**

| Secret | Description |
|---|---|
| `RAILWAY_TOKEN` | Railway API token for automated deploys |
| `DATABASE_URL` | (optional) Postgres URL for CI migrations (defaults to an ephemeral in-runner DB) |

---

## Email Setup

SunoFlow uses Mailjet for transactional email (verification, password resets). See [docs/mailjet-setup.md](docs/mailjet-setup.md) for full setup instructions including DNS records (SPF, DKIM, DMARC) and domain verification.

Without Mailjet configured, emails are logged to the server console.

---

## API Documentation

The public REST API is documented with Swagger/OpenAPI. After starting the server, visit:

```
http://localhost:3000/api/docs
```

---

## Contributing

1. Fork the repo and create a branch.
2. `pnpm install` (installs Husky hooks automatically).
3. Make changes, run `pnpm lint` and `pnpm test`.
4. Open a pull request — CI will run the full test suite.
