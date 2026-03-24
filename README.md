# SunoFlow

[![CI](https://github.com/lx-0/SunoFlow/actions/workflows/ci.yml/badge.svg)](https://github.com/lx-0/SunoFlow/actions/workflows/ci.yml)

Personal Suno Music Manager — a mobile-first web app integrating with sunoapi.org for personalized music management.

## Features

- Mobile-responsive layout with bottom navigation
- User registration and login (email + password)
- Auth state persisted across page reloads (JWT sessions)
- Dashboard with song stats
- Songs, Favorites, and Settings pages (ready for Suno API integration)

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **NextAuth.js v5** — authentication
- **Prisma v5** — ORM
- **PostgreSQL** — database
- **bcryptjs** — password hashing

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment (copy `.env` and update values):

```
DATABASE_URL="postgres://user:password@host:5432/sunoflow"
AUTH_SECRET="<generate with: openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"
```

3. Run database migrations:

```bash
npx prisma migrate deploy
```

4. Start the dev server:

```bash
npm run dev
```

Open http://localhost:3000. You'll be redirected to `/login`. Click "Create one" to register.

## Email Setup

SunoFlow uses Mailjet for transactional email (verification, password resets). See [docs/mailjet-setup.md](docs/mailjet-setup.md) for full setup instructions including DNS records (SPF, DKIM, DMARC) and domain verification.

Without Mailjet configured, emails are logged to the server console.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |

## CI/CD

GitHub Actions runs lint, type check, unit tests, build, and E2E tests on every push to `main` and on pull requests. The following GitHub repository secrets must be configured:

| Secret | Description |
|--------|-------------|
| `RAILWAY_TOKEN` | Railway API token for automated deploys |
| `DATABASE_URL` | (optional) Postgres URL used for CI migrations (defaults to an ephemeral in-runner DB) |

Sensitive values like `AUTH_SECRET` use CI-only placeholders — only `RAILWAY_TOKEN` must be set for the deploy step to work.

## Git Hooks

This project uses [husky](https://typicode.github.io/husky/) + [lint-staged](https://github.com/lint-staged/lint-staged) to run `next lint` on staged `.ts`/`.tsx` files before each commit. Hooks are installed automatically via the `prepare` script when you run `pnpm install`.

If a commit is blocked by lint errors, fix them and re-stage before committing.

## Project Structure

```
src/
├── app/
│   ├── api/auth/[...nextauth]/   NextAuth route handler
│   ├── api/register/             User registration endpoint
│   ├── login/                    Login page
│   ├── register/                 Registration page
│   ├── songs/                    Songs browser
│   ├── favorites/                Favorites
│   ├── settings/                 Settings
│   └── page.tsx                  Dashboard
├── components/
│   ├── AppShell.tsx              Mobile layout shell + bottom nav
│   └── SessionProvider.tsx       NextAuth session wrapper
├── lib/
│   ├── auth.ts                   NextAuth config
│   └── prisma.ts                 Prisma client singleton
└── middleware.ts                  Route auth guard
prisma/
└── schema.prisma                 DB schema (User, Account, Session)
```
