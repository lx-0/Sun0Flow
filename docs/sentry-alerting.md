# Sentry Alerting Configuration

> **Backend:** The Sentry SDK (`@sentry/nextjs`) is compatible with both Sentry SaaS and self-hosted, Sentry-protocol-compatible backends such as **GlitchTip**. Only the DSN host differs. GlitchTip accepts error + performance envelopes but **rejects Session Replay**, so `replayIntegration()` is intentionally omitted from `sentry.client.config.ts`. Trace sampling stays at 10%. The CSP `connect-src` origin is derived from `NEXT_PUBLIC_SENTRY_DSN` at build time (see `next.config.mjs`), so swapping backends only requires changing the DSN.

## Setup

Set these environment variables to enable Sentry:

| Variable | Required for | Description |
|---|---|---|
| `SENTRY_DSN` | Server error tracking | DSN from Sentry project settings |
| `NEXT_PUBLIC_SENTRY_DSN` | Client error tracking | Same DSN, exposed to browser |
| `SENTRY_AUTH_TOKEN` | Source maps upload | Auth token from Sentry account |
| `SENTRY_ORG` | Source maps upload | Sentry organization slug |
| `SENTRY_PROJECT` | Source maps upload | Sentry project slug |

When `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` are unset, Sentry is disabled with zero overhead.

## Verify Sentry Is Working

After deploying with a DSN configured, call the admin verification endpoint:

```
GET /api/admin/sentry-test
```

This captures a `SentryVerificationError` with `level: info` and returns the Sentry event ID. Check the Sentry Issues dashboard to confirm it arrived.

## Recommended Alert Rules

Create these in **Sentry → Alerts → Create Alert Rule**:

### 1. Error spike

- **Type:** Issue alert
- **Condition:** An issue is seen more than **10 times** in **1 hour**
- **Filter:** Environment: production
- **Action:** Notify via email or webhook

### 2. Unhandled exception (new issue)

- **Type:** Issue alert
- **Condition:** A new issue is created
- **Filter:** Environment: production; Issue category: error
- **Action:** Notify immediately

### 3. Slow transactions

- **Type:** Metric alert
- **Dataset:** Transactions
- **Metric:** p95(transaction.duration) > 3000ms
- **Time window:** 10 minutes
- **Action:** Notify when above threshold for 2 consecutive windows

### 4. High error rate

- **Type:** Metric alert
- **Dataset:** Errors
- **Metric:** count() > 50 errors per 5 minutes
- **Environment:** production
- **Action:** Notify immediately (critical severity)

## Performance Monitoring

The generate endpoint (`POST /api/generate`) is instrumented with a `suno.generateSong` span.
In Sentry → Performance, filter by transaction `/api/generate` to see p50/p95/p99 latency.

Sample rates (configured in `sentry.*.config.ts`):

| Config | `tracesSampleRate` | `replaysSessionSampleRate` | `replaysOnErrorSampleRate` |
|---|---|---|---|
| Client | 10% | 10% | 100% |
| Server | 10% | — | — |
| Edge | 10% | — | — |

Increase `tracesSampleRate` to `1.0` in staging for full visibility.

## Log Levels

Controlled by `LOG_LEVEL` env var (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).

- **production:** default `info` (set `LOG_LEVEL=warn` to reduce volume)
- **development:** default `debug`; set `LOG_PRETTY=true` for human-readable output

Key structured log events:

| Event | Level | Fields |
|---|---|---|
| Sign-in success | `info` | `userId`, `provider` |
| Sign-in failure (wrong password) | `warn` | `userId` |
| Sign-in failure (user not found) | `warn` | `email` |
| Account disabled sign-in attempt | `warn` | `userId` |
| Generation started | `info` | `userId`, `title`, `instrumental` |
| Generation API call succeeded | `info` | `userId`, `taskId`, `durationMs` |
| Generation API error | `error` | `userId`, `correlationId` |
| Credit usage recorded | `info` | `userId`, `action`, `creditCost`, `songId` |
| APM metrics flush | `info` | `metrics` snapshot (every 60s) |
