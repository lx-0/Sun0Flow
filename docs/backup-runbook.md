# Database Backup Runbook

## TL;DR

Automated `pg_dump` backups run daily against production via GitHub Actions
(`.github/workflows/db-backup.yml`). Each run restores the dump into a sidecar
Postgres and checks key-table row counts before the backup is uploaded as a
GitHub artifact. See [schedule + retention](#schedule--retention) below.

## Architecture

```
┌──────────────────────┐        pg_dump (TLS)         ┌─────────────────────┐
│  GitHub Actions      │ ──────────────────────────▶  │  Railway Postgres   │
│  db-backup.yml        │                              │  (production)       │
│  (daily 01:00 UTC)    │                              └─────────────────────┘
│                       │
│  ┌─────────────────┐  │  pg_restore
│  │ sidecar         │  │     ↓
│  │ postgres:16     │  │  verify (row counts, _prisma_migrations presence)
│  └─────────────────┘  │     ↓
│                       │  upload-artifact (30 / 90 / 365 day retention)
└──────────────────────┘
```

Why GitHub Actions and not an in-Railway cron?

- **Off-platform durability.** If Railway has an incident, the backups are
  still reachable through GitHub, not trapped behind the same outage.
- **Verified restorability.** The sidecar restore step proves each dump is
  actually loadable — a silent dump corruption would be caught immediately.
- **Cost.** No extra Railway service, no volume mount — uses GitHub-hosted
  runner minutes already paid for by the project.

## Schedule + retention

The backup script (`scripts/backup-db.sh`) auto-selects a tier based on UTC
date. The workflow then chooses artifact retention from that tier:

| Tier    | Selected when       | Artifact retention | Local rotation (inside the runner) |
|---------|---------------------|--------------------|------------------------------------|
| daily   | every day           | 30 days            | keep last 7                        |
| weekly  | UTC Sunday          | 90 days            | keep last 4                        |
| monthly | 1st of the month    | 365 days           | keep last 3                        |

Runner rotation is irrelevant in CI (the runner is thrown away after every
run), but the same script runs locally during disaster-recovery drills where
rotation matters.

## Required secrets

Add these under **GitHub → Repo → Settings → Secrets and variables → Actions**:

| Name                       | Value                                                                     |
|----------------------------|---------------------------------------------------------------------------|
| `PRODUCTION_DATABASE_URL`  | Railway Postgres **public** proxy URL (see below).                        |

### How to get the public DB URL from Railway

1. Open the Railway project → **Postgres** service → **Variables** tab.
2. Copy the value of `DATABASE_PUBLIC_URL` (e.g. `postgresql://postgres:…@xxx.proxy.rlwy.net:12345/railway`).
3. Paste it into the `PRODUCTION_DATABASE_URL` GitHub secret.

> **Do not** use `DATABASE_URL` (the `postgres.railway.internal` hostname) —
> that only resolves from inside Railway's private network and will fail from
> a GitHub-hosted runner.

## Restoring from a backup

### 1. Download the artifact

```bash
# Option A — GitHub UI:
#   Actions → Database Backup → pick a run → Artifacts → download.
#
# Option B — gh CLI:
gh run list --workflow=db-backup.yml --limit 10
gh run download <run-id> --name sunoflow-db-backup-daily-<run-id> --dir ./backups
```

### 2. Restore to a local verification database

```bash
# Requires: pg_restore, psql, a local Postgres (docker-compose up db works).
export DATABASE_URL="postgres://sunoflow:sunoflow@localhost:5432/sunoflow"
./scripts/restore-db.sh ./backups/daily_<timestamp>.pgdump
```

By default this creates a throwaway `sunoflow_restore_verify` database, runs
the dump into it, prints row counts for every key table, and drops the temp
database on exit. Exit code `0` means the backup is good.

### 3. Restore to a named target (drops and recreates it)

```bash
./scripts/restore-db.sh ./backups/daily_<timestamp>.pgdump --target-db sunoflow_recovery
```

### 4. Restore into production (disaster recovery only)

This is only for the "Railway Postgres lost the data" scenario. Running it
against a live production DB will drop and recreate it.

```bash
# 1. Confirm with the CEO and record the incident in docs/incident-response.md.
# 2. Stop the SunoFlow service on Railway so no writes come in while restoring.
railway service down SunoFlow

# 3. Use the Railway public URL — omit --target-db or set it to the production DB name.
export DATABASE_URL="<Postgres public URL with admin rights>"
./scripts/restore-db.sh ./backups/<tier>_<timestamp>.pgdump --target-db railway

# 4. Verify row counts and _prisma_migrations look sane in the output.
# 5. Bring the SunoFlow service back up.
railway service up SunoFlow
```

## Manual backup

If you need a fresh backup outside the daily schedule (e.g. before a risky
migration):

```bash
# GitHub Actions (preferred — dump lands in an artifact):
gh workflow run db-backup.yml
gh run watch $(gh run list --workflow=db-backup.yml --limit 1 --json databaseId -q '.[0].databaseId')

# Or locally against production (the resulting file lives on your machine):
export DATABASE_URL="<Railway public URL>"
./scripts/backup-db.sh
```

## Observability

- **Success/failure**: visible in GitHub Actions. GitHub emails the repo actor
  on failure by default, and the workflow sets a summary on every run.
- **Backup size + tier**: printed in the job step summary.
- **Restore verification**: the `restore-db` step will fail the job if any
  key table is missing or unqueryable, or if `_prisma_migrations` is absent.

## Known limits

- **Max artifact size** is 2 GB per file on GitHub's free tier. The SunoFlow
  schema is metadata-only (no audio blobs in Postgres), so this has plenty of
  headroom, but watch the printed size over time.
- **Backups contain user data** (email addresses, Stripe customer IDs, auth
  tokens). Artifacts are scoped to the repo — keep the repo private and
  restrict who can download artifacts.
- **This workflow does not back up the audio cache volume** at
  `/data/audio-cache`. Audio files are recoverable from Suno's CDN via the
  repull script — see [SUNAA-358](/SUNAA/issues/SUNAA-358) for the mirror
  health plan.

## Disaster recovery drill

At least once per quarter, pick a recent daily artifact and run step 2
("Restore to a local verification database") above. Record the date + result
in the `docs/incident-response.md` log so we have evidence the restore path
still works end-to-end.
