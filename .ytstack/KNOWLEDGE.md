# Knowledge

Patterns, rules, and lessons learned while building SunoFlow. Future sessions read this first.

## Primary sources (read these, don't duplicate them)

- [`README.md`](../README.md) — setup, env-var reference, quick start
- [`FEATURE-MAP.md`](FEATURE-MAP.md) — bounded contexts, generation/playback flows, hot-spots, cross-cutting concerns (shape of the system; complements the inventory)
- [`docs/feature-inventory.md`](../docs/feature-inventory.md) — exhaustive feature list with file pointers (flat catalog)
- [`docs/deployment-runbook.md`](../docs/deployment-runbook.md) — Railway deploy flow, rollback, smoke checks
- [`docs/backup-runbook.md`](../docs/backup-runbook.md) — DB backup + restore via `scripts/backup-db.sh` / `restore-db.sh`
- [`docs/incident-response.md`](../docs/incident-response.md) — escalation playbook
- [`docs/sentry-alerting.md`](../docs/sentry-alerting.md) — error-budget thresholds + alert routing
- [`docs/uptime-monitoring.md`](../docs/uptime-monitoring.md) — uptime checks
- [`docs/secrets-rotation-runbook.md`](../docs/secrets-rotation-runbook.md) — quarterly rotation
- [`docs/MCP.md`](../docs/MCP.md) — MCP server entry (`mcp/server.ts`, `pnpm mcp`)

## Conventions

- **Package manager:** pnpm (Node 20+)
- **Framework:** Next.js 15 App Router, all routes under `src/app/[locale]/…`
- **Auth:** NextAuth.js v5 with Prisma adapter (`src/lib/auth.ts`)
- **ORM:** Prisma v5 against PostgreSQL 16
- **Validation:** Zod
- **Logging:** Pino (no `console.log` in production paths)
- **Errors:** Sentry — server runtime + `onRequestError` + replay stripping (see recent commits `fbae46a`, `f9ce935`)
- **i18n:** locale segment in URL (`[locale]`)
- **Public sharing:** opaque slugs at `/s/[slug]` (songs) and `/p/[slug]` (playlists)

## Lessons learned

- **Sentry Session Replay must be stripped when pointing at GlitchTip.** GlitchTip is Sentry-protocol-compatible but rejects Replay payloads. Drop `replayIntegration()` from any client config. (Memory: `reference_glitchtip_sentry_compat.md`)
- **Player async paths need a load-generation token.** Race conditions between rapid track switches caused stale-audio bugs — guarded by a generation token (commit `7511d20`).
- **Waveform peak math belongs in a Web Worker.** Main-thread blocking on long tracks; moved to worker (commit `45023a6`).
- **PostHog init deferred via `requestIdleCallback`.** Eager init hurts first-paint metrics (commit `c66bc2f`).
- **`User.lastLoginAt` is "lastFreshSignIn", not "lastSeenAt".** With NextAuth `session.strategy="jwt"` + default 30d JWT TTL, the field is only written in the credentials `authorize()` callback and the OAuth-first-use branch of the `jwt` callback. Active users with valid tokens stay invisible to any `lastLoginAt`-based metric or targeting query for up to 30 days. Use `src/lib/active-users` (UNION over `Activity.createdAt` ∪ `PlayHistory.playedAt`) for any "active in last X days" semantic. Bug discovered while auditing alex's profile (commit `ab1fa19`).
- **Streak triggers must fire on every activity write path, not the first one you build.** Original `recordDailyActivity` only fired in `song-completion`, so the streak counter froze for users who only listened. Added triggers in `lib/history/index.ts` (PlayHistory create) and `lib/songs/favorites.ts` (addFavorite). Pattern: any time you add a new "user did X" surface and have a streak/engagement signal, audit every write path that should count.
- **Failed-Song archival must happen at every `generationStatus="failed"` write site, not just the orchestrator.** There were 5: `markSongFailed`, `createSongRecord("failed")` in core, `cleanupStalePending` (updateMany), and 2 stream/status routes that mark orphaned no-suno-task-ID songs failed. Missing one leaves library leaks. `markSongFailed` uses `archivedAt: existing?.archivedAt ?? new Date()` to preserve user's earlier manual archive timestamp.
- **`RateLimitEntry` is dual-purpose: rate-limit slots AND a usage log.** `/api/dashboard/usage` reads `generate` entries up to 30d back AND counts `totalAllTime`. Cleanup job (`rate-limit-cleanup`, daily 02:30 UTC) deletes entries older than 7d but **excludes `generate`** — otherwise the usage dashboard breaks. Refactor candidate: split slot tracking from usage logging into separate tables.
- **TS `tsconfig` target is below ES2020 → BigInt literals (`42n`) fail typecheck.** `pnpm test` runs Vitest which transpiles, but `pnpm typecheck` (= `tsc --noEmit`) trips. Use `BigInt(42)` in tests when mocking Prisma `$queryRaw` rows. Always re-run `pnpm typecheck` after writing test files, not only after implementation. (Incident: `d31671c` failed CI typecheck, fixed by `23116cc`.)
- **"Business-logic failures" still need to reach error tracking.** A code path that flips a row's `status="failed"` after talking to an external API is structurally identical to an unhandled exception from the operator's perspective — but the natural code looks like "update DB + broadcast + return", with no `logServerError` / `Sentry.captureException` anywhere. Symptom: a healthy-looking GlitchTip with 0 events while prod has 21 failed records (14× stale-timeouts, 5× upstream "Internal Error", 2× content-policy rejects). Audit every `generationStatus="failed"` write site for parity with the orchestrator's exception path. Distinguish noise-grade *user-content rejects* (content policy, copyright, artist name) from operator-grade *system failures* (timeouts, upstream 5xx) via a small regex whitelist; only the latter belong in the error inbox. Stale-cleanup bulk-`updateMany` is the worst offender — switch to `findMany → updateMany → for-each logServerError` so each stale entity surfaces individually with full context (songId/sunoJobId/pollCount/ageMs). Cluster of `pollCount=0` timeouts in one window is the smoking gun for *server-restart-during-generation*. (Commit `f60a615` / `0.1.4`; files `src/lib/generation/song-completion.ts`, `src/lib/songs/library.ts`.)

## Gotchas

- **Two DB URLs are required**: `SUNOFLOW_DATABASE_URL` AND `DATABASE_URL`. Prisma reads `DATABASE_URL`; the app reads `SUNOFLOW_DATABASE_URL` for connection pooling.
- **Docker build needs `NEXT_PUBLIC_SENTRY_DSN` as a build ARG** (commit `f9ce935`) — env-only injection is too late for the client bundle.
- **`prisma migrate deploy` runs as part of `pnpm dev`** — local dev assumes a reachable Postgres.
- **Audio + image caches** live under `AUDIO_CACHE_DIR` / `IMAGE_CACHE_DIR` — must be persistent volumes in production (Railway).
- **Production deploys are tag-driven** (`v*.*.*` push to `main` triggers `.github/workflows/deploy-production.yml` → Railway). Don't expect deploys on plain merges.
- **Paperclip company SUNAA tracks issue-level work separately** — see project memory `project_sunoflow_paperclip_company.md`. Don't double-track milestones here AND there for the same scope.

## Architecture (0.2.0 refactor pass)

- **Song lifecycle transitions belong on one seam.** `src/lib/songs/lifecycle.ts` owns the `readyTransition` / `pendingRetryTransition` constants + `buildFailedTransition` helper + `markSong*` full-transition functions. Five sites used to drift independently — adding `archivedAt: null` to four of them but missing the fifth is exactly what caused the "regenerated song hidden from library" bug. Direct `prisma.song.update({ generationStatus: ... })` is now treated as a smell — go through lifecycle.
- **"Song became ready" is a fan-out event, not a god-handler.** `handleSongSuccess` orchestrates four domain adapters (`broadcastSongReady`, `cacheSongAssets`, `recordSongReadyEngagement`, `notifyAboutReadySong`) via `Promise.all` under a shared `runSideEffect` try/catch. New side-effect = new file in `src/lib/generation/song-ready-events/`. Adding a new "song-ready" effect (e.g. webhook fanout) should land there, not in the orchestrator.
- **Reads must not write.** `querySongLibrary` used to fire-and-forget `cleanupStalePending` inline — a write hidden inside a read. The function was hard to test (needed `pollOnce`/`handleSongSuccess`/`handleSongFailure` mocks for what should be a pure query) and the recovery trigger was invisible to route-layer readers. Recovery now lives in `src/lib/songs/stale-pending-recovery.ts`; trigger is explicit at `/api/songs/route.ts` via `kickoffStalePendingRecovery`. A future cron endpoint can import `runStalePendingRecovery` directly without the read entanglement.
- **One client-side polling strategy, not three.** `generation-tracker.ts` is the singleton — SSE preferred, polling fallback, visibility-pause, MAX_POLLS shared across observers. `useTrackPendingSong` is the React-side adapter. `GenerationHistoryView` keeps its own multi-song fresh-data poll because its use case (display intermediate fields like title-as-Suno-reveals) is genuinely different — don't force consolidation when use cases diverge.
- **`addItem` is the single enqueue seam.** `enqueueFromSpec` used to bypass `MAX_QUEUE_SIZE` because it was the circuit-open path — that gap let unlimited entries pile up while the circuit was open. Merged. `enqueueGeneration` now handles the `QUEUE_FULL` case explicitly by returning `{ status: "denied", response: 503 }`.
- **`updateItem({id}|{songId,status})` dual-signature was unfinished abstraction.** Split into `updateItemById` + inline `prisma.updateMany` inside `resolveBySongId`. Don't bundle two operations behind one name when callers can't keep them straight.
- **Notification channels are a typed registry, not parallel partial maps.** `src/lib/notifications/channels.ts` is a `Record<NotificationType, NotificationChannels>` — adding a new notification type without thinking about channels produces a TS error. Email-template choice closes over the channel config (no more global switch statement).
- **Client logger ≠ server logger.** `src/lib/error-logger/{client,server,extract,index}.ts`. The previous `typeof window === "undefined"` branch in a single `logError` was dead code on the server (no server callers) and obscured the runtime context.
- **GlitchTip surfaces tags, not `extra`.** The MCP only returns indexed tags via `list_issues` queries. `logServerError` auto-promotes `songId` / `sunoJobId` / `playlistId` / `stemId` / `feedId` (+ `userId` from context) from `params` to Sentry tags. Now you can `list_issues query:"songId:abc"` to find a song's history.

## SSE poll lifecycle

- **Server-side poll loops must not be bound to client-connection lifecycle.** `/api/generate/[jobId]/stream` used to pass `request.signal` into `pollToCompletion` — closing the tab killed the poller without flipping the song to a terminal state. Suno would still complete the generation, but no one on our side noticed. The SSE forwarder is now best-effort (its `sendEvent` may throw if controller closed, which is caught); the poll loop runs independently to completion and `handleSongSuccess`/`handleSongFailure` persist the result regardless of who's listening.

## Skill authoring (sunoflow plugin)

- **Anthropic skill best practices, distilled.** Sources: <https://code.claude.com/docs/en/skills>, <https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices>.
  - `description` in third person, includes WHAT; `when_to_use` (separate field) carries the trigger phrases. Combined cap 1,536 chars; description hard cap 1,024.
  - No non-standard frontmatter fields (`license` etc.). `metadata` block is tolerated but unusual.
  - Progressive disclosure is the load-bearing pattern: `SKILL.md` is an entrypoint with navigation + workflows; per-tool details + examples live in `reference/*.md` loaded on demand. "Under 500 lines" is not a license to keep it monolithic when the bulk is detail-for-one-tool-at-a-time.
  - References one level deep from `SKILL.md` only — Claude may partial-read deeply nested files.
  - Tool index in `SKILL.md` should include cost / category columns so Claude can pick a tool without loading the reference file.
  - Markdown lint: all table separator rows in aligned style (`| --- | --- | --- |`) to match aligned-spacing headers (avoids MD060). Blank line before every list (MD032).

## Plugin marketplace ("latest" pattern)

- **The lx-0/skills marketplace tracks main automatically.** `source: { source: "github", repo: "lx-0/SunoFlow" }` with **no `ref` field** = pull from default branch. Adding `ref: "v0.2.0"` would pin; absence = latest. Don't add a redundant `ref: "main"` — it's already implicit.
- **Top-level `marketplace.json` is hand-edited; `.compiled/marketplace.json` is generated by `compile.mjs`.** `.claude-plugin/marketplace.json` and `.cursor-plugin/marketplace.json` are symlinks to the compiled output. To update: edit `marketplace.json` → run `node compile.mjs` → commit both.
- **Plugin cache path encodes the version at install time** (`~/.claude/plugins/cache/lx-0-public-plugins/sunoflow/0.1.0/`). On `/plugin update sunoflow` the cache directory shifts to the new version (`0.2.0`). Old cache path doesn't auto-prune — fine, but explains why "looking at the cache" can mislead about what's currently active.

## Historical data fixes

- **6 stuck-archived rows in prod, unarchived 2026-05-16.** "Glass & Bone" + 5 older songs ("Infinite Rooms", "Patch Notes", 2× "World State", "Mashup") had `generationStatus="ready"` + `archivedAt != null` + `errorMessage IS NULL` + `audioUrl IS NOT NULL` + `pollCount > 0`. WHERE-filter SQL `UPDATE "Song" SET "archivedAt" = NULL WHERE ...` distinguished bug-victims from user-archived (user-archived songs lacked `audioUrl` or had `pollCount=0`). One-off; don't re-run. The 0.2.0 lifecycle fix prevents future occurrences.
