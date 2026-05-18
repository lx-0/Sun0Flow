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

- **`flex-1` next to all `flex-shrink-0` siblings in a fixed-height column collapses to 0 on mobile.** `ExpandedPlayer.tsx` had eight `flex-shrink-0` children (header, cover, song info, waveform, main + secondary controls, tab buttons, safe-area spacer) in a `flex flex-col h-full` container at `h-full` (100dvh on mobile). When `activeTab !== "none"` added a `flex-1` panel below, the panel got ~0px because the flex-shrink-0 siblings already consumed 100dvh — and the bottom edge of the column sat at or below the DrawerContent's anchored bottom. Visible symptom: "tab buttons don't work" (panel rendered, just invisible / off-viewport; button bg toggled violet but was too subtle to register as feedback). Rule: when adding a flex-1 zone that needs *guaranteed* visible space, the siblings that should "yield" to it must also be flex-1 (or have `min-h-0` + `overflow` on a wrapping flex-1 region). Pattern that works on both viewports: split into "upper flex-1 scrollable" + "tab buttons flex-shrink-0" + "panel flex-1 (mobile) / max-h capped (desktop)". Commit `f177579` / `0.2.2`; file `src/components/ExpandedPlayer.tsx`.

- **Suno's `sunoJobId` is dual-typed across the parent/alternate boundary.** For a *primary* Song row, `sunoJobId` is the task-id (32 hex chars, no dashes) — the same key that `/generate/record-info?taskId=` accepts. For an *alternate* Song row (the second clip of the same generation), `sunoJobId` is the per-clip UUID (same as `sunoAudioId`). The record-info endpoint silently 404s on clip UUIDs, so any code that calls record-info using `self.sunoJobId` works for primaries and silently breaks for alternates. Always derive the effective task-id as `parentSong?.sunoJobId ?? self.sunoJobId`. When matching within the record-info response, match by `clip.id === sunoAudioId`, not by "first clip with a URL" (that gives the primary's URL to the alternate). Discovered when 105/226 ready songs (= all April-vintage alternates) were missing from the Railway audio-cache volume. Commit `54ad93f` / `0.2.2`; files `src/lib/sunoapi/refresh.ts`, `src/lib/cache/warmup.ts`, `src/lib/audio/index.ts`, plus 4 routes.

- **Service-Worker `cache.match(request)` ignores the Range header by default — caching a 206 response poisons all subsequent ranges on the same URL.** The audio element sends `Range: bytes=N-` requests; per spec `cache.put` rejects 206s with TypeError, but in WebKit's iOS PWA the behaviour is inconsistent enough that the user-visible symptom matched exactly: "songs play briefly then stop". Two rules going forward: (1) for any URL pattern that legitimately serves Range responses, the SW should bypass itself when `request.headers.has("range")` and only cache responses where `status === 200`; (2) when a cache strategy changes incompatibly, bump the explicit version suffix on the cache name (we keep `AUDIO_CACHE` outside the deploy-coupled BUILD_ID naming because Save-Offline entries should survive deploys). Commit `f3423bc` / `0.2.2`; files `public/sw.js`.

- **`readFileSync` in any `/api/audio/[id]`-class hot path stalls the event loop and serialises all concurrent requests.** Even on a fast Railway volume, a sync 3–7 MB read takes long enough that mobile audio elements (which often pipeline multiple requests) experience hangs and timeouts. `FileCache.get` exists for cold paths (admin, warmup). Use `FileCache.getStream(id, start?, end?)` for any HTTP response that serves audio bytes — it returns a Web `ReadableStream` reading only the requested range, never buffering the full file. `FileCache.put` is now fire-and-forget `fs.promises.writeFile` so callers that flush large buffers don't stall the loop either. Commit `f3423bc` / `0.2.2`; files `src/lib/cache/file.ts`, `src/lib/audio/index.ts`. (CLAUDE.md global rule: "Sync-Operationen blockieren Event Loop".)

- **Middleware `PUBLIC_PATHS` must list every media-proxy route the `<audio>`/`<img>` element hits, even when the route handler does its own auth.** Otherwise the middleware's edge redirect fires first and returns `307 → /login`; the media element follows the redirect, fetches the HTML login page, and treats that as the audio/image stream → silent breakage on share pages and after any JWT-cookie eviction in iOS PWAs. The route handler still enforces auth correctly — it just never gets the chance because the redirect terminates the request at the edge. Symmetric rule: after adding any new `/api/<resource>/{public/,}[id]`-style media proxy, audit `PUBLIC_PATHS` in `src/middleware.ts`. Commit `f3423bc` / `0.2.2`; file `src/middleware.ts`.

- **`cdnFallbackRef`-style "remember this errored, use fallback forever"-sets must be self-healing.** The original semantics — "add on error, never remove" — meant one transient proxy hiccup pinned the song to direct-CDN for the rest of the session, both losing the local file-cache hit on every replay AND coupling the user to Suno-CDN availability for that song. Reset the per-id entry at the start of each new load attempt (e.g. in `resolveAndPlay` / `playQueue`), or — equivalently — clear on the `playing` event. The proxy gets a fresh shot, and if it really IS broken the next error re-adds the entry. Commit `f3423bc` / `0.2.2`; file `src/components/QueueContext.tsx`.

- **Next.js `instrumentation.ts` is bundled for BOTH Node and Edge runtimes, regardless of `if (process.env.NEXT_RUNTIME === "nodejs")` guards.** Webpack statically resolves every transitive import in the dependency graph, so any barrel re-export that pulls Node-only modules (`fs`, `stream`, `child_process`) into `instrumentation.ts`'s graph breaks the edge build with `Module not found` / `UnhandledSchemeError`. Two countermeasures applied in `f3423bc`: (a) import the server-only entry point directly (`@/lib/cache/warmup`) instead of going through a barrel (`@/lib/cache`) that re-exports `audioCache`/`imageCache`; (b) avoid even a *static* `import "stream"` / `import "node:stream"` in any module reachable from instrumentation — inline the small helper (we reimplemented `Readable.toWeb()` as `nodeStreamToWeb` in `src/lib/cache/file.ts`). Generalisable rule: any module reachable from `instrumentation.ts` must be edge-safe at the *static-import* level, even if runtime-guarded behind a Node-only check.

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

## Concurrent-handler races (Issue 5 lesson)

- **`handleSongSuccess` has three concurrent triggers**: SSE `pollToCompletion` (server-side), client polling via `/api/songs/[id]/status`, and the stale-pending recovery sweep on `/api/songs`. Any two firing within milliseconds for the same parent song will both run `createAlternateSongs`, and the second one's `prisma.song.create` hits the `@unique` constraint on `Song.sunoJobId` → P2002 propagates as a 500.
- **Two-layer defence** (commit `5d3b275`):
  1. Single-flight guard at top of `handleSongSuccess` — skip if `generationStatus === "ready"` AND `sunoAudioId === firstSong.id`. Covers the common ~100ms-gap race.
  2. Idempotent `createAlternateSongs` — catch P2002, look up by the unique `sunoJobId`, return the existing alternate's shape so downstream broadcasts + cache writes still see it.
- **The single-flight guard is TOCTOU-racy by construction.** It's a fast filter for the common case; the P2002 handler is the real backstop. Don't drop either layer.
- **Pre-existing bugs surface after architectural refactors.** The old `cleanupStalePending` blindly flipped pending → failed, never calling `handleSongSuccess`. My 0.2.0 `runStalePendingRecovery` re-probes Suno and dispatches → exposed the race more frequently. Lesson: when a refactor enables new code paths, the bug surface for downstream functions widens. Audit downstream invariants (idempotency, race-safety) BEFORE shipping the refactor.

## GlitchTip issue resolution workflow

- **Resolution is evidence-based, not PR-merge-based.** Pushed by the change to `yesterday-ai/cloud/skills/glitchtip-mcp/SKILL.md` (commit `6e7ccd5`). Four conditions must hold before marking an issue resolved:
  1. Specific fix commit identified (cite SHA in the resolution).
  2. That commit is the currently deployed release SHA (verify via `railway status` / health endpoint).
  3. Event-rate-scaled silence window passed: 6h for high-frequency (≥1/hour), 24h for routine (events/day), 7d for race / corner-case (events/week).
  4. Silence isn't collateral (fewer users, codepath not exercised) — sanity-check related activity.
- **Always pin `in_release`** when resolving: `update_issue(id, "resolved", in_release="<full-fix-sha>")`. GlitchTip uses this for regression attribution and auto-reopens if a new event lands with the same fingerprint.
- **`ignored` ≠ `resolved`.** Use `ignored` for deliberate noise (deploy-time chunk-load errors, expected upstream 5xx, dependency churn). Always document the ignore-reason in KNOWLEDGE.md.

## Next.js standalone behind a reverse proxy (Railway port leak)

- **`req.headers.host` includes the upstream port.** Next.js standalone `server.js` reads `host` to construct absolute redirect URLs. Railway forwards Host with `$PORT=8080` appended (or the standalone server falls back to its listening port). Result: any `NextResponse.redirect(new URL("/x", request.url))` — including `next-intl`'s locale redirect — emits `Location: https://sunoflow.up.railway.app:8080/de`. Browser follows → connection refused (`:8080` not exposed on edge) → white screen. The bug is long-standing; only surfaced once a first-time mobile visitor (no `NEXT_LOCALE` cookie) happened to trip the locale redirect cleanly. Repro: `curl -sI -H "Accept-Language: de" https://<host>/`.
- **Fix (commit `94afe16` in `src/middleware.ts`):** post-process the `Location` header at the end of the middleware pipeline. When `x-forwarded-host` is present (= behind a proxy in prod), rewrite self-host redirects to the canonical public origin and strip the port. Dev (no `x-forwarded-host`) is untouched so `localhost:3000` redirects keep working. External redirects (OAuth) bypass via hostname-comparison. Detection is purely header-based — no env var, no hardcoded public host. Tested in vitest by simulating Playwright with explicit `x-forwarded-host`.
- **Next.js standalone has NO trust-proxy mode.** There is no equivalent to Express `app.set("trust proxy", true)`. Post-processing the response Location header is the cleanest known workaround. The same pattern works on Vercel / Cloudflare / any reverse-proxied deployment — only the trigger header may differ (`x-forwarded-host` is the de-facto standard).

## Deploy verification: `railway up --detach` ≠ deploy succeeded

- **The GH Action `Deploy to production` step turns green after `railway up --detach` uploads the tarball, NOT after Railway builds + the new container starts.** Build + container swap takes another 3–10 min. If the build fails (TS error, missing dep, OOM), the GH workflow stays green and the old container keeps serving. Symptom: 15+ min of polling `/api/health` watching `uptime` keep climbing on the OLD container.
- **Verify via Railway CLI** (locally authenticated as `alex@yesterday-ai.de`):
  - `cd /tmp && railway link --project SunoFlow --service SunoFlow` (one-time per session)
  - `railway status` — shows `● Online · Deploy failed (Nm)` or `Initializing (Ns)` or healthy
  - `railway deployment list` — top row state: `SUCCESS` | `FAILED` | `INITIALIZING` | `WAITING` | `SKIPPED` | `REMOVED`
  - `railway logs --build <DEPLOY_ID>` — build-time stderr (TS errors, docker errors)
  - `railway logs --deployment` — runtime logs of currently-Online container
- **Live-swap signal for polling:** `curl /api/health` → `uptime < 300s` means the new container is serving. Old container keeps serving full-uptime until Railway's traffic-shift completes.

## Post-pull typecheck (build break from upstream-only file)

- **Latent type errors in upstream commits can break the build even though everything was clean locally.** Incident 2026-05-18: my middleware fix `tsc --noEmit` clean. Then `git pull` brought in `22ee71f` (route-handler refactor) which had a `string | undefined` narrowing error in `src/app/api/upload/route.ts:90` that the reviewer's CI must have missed. My push deployed → Railway build failed → two wasted deploy cycles before discovering the silent failure. The fix was 8 lines (`if/else` instead of ternary, commit `7553d92`); the diagnostic cost was disproportionate.
- **Rule:** after every `git pull` that introduces upstream commits, re-run `pnpm tsc --noEmit` (and ideally `pnpm vitest run`, `pnpm lint`) before `git push`. For Railway-deployed projects this is mandatory because `railway up --detach` won't catch the build error.

## CSS mutual-exclusion is fragile; prefer single-render with runtime decision

- **`md:hidden` + `hidden md:flex` for two click-handlers is an antipattern.** The GlobalPlayer rendered a `<button>` (mobile, opens drawer) and a `<Link>` (desktop, navigates to song detail) with mutually-exclusive responsive classes. On one user's iPhone Chrome BOTH rendered side-by-side. Cause never pinpointed (Tailwind purge / SW cache / something specific to the install) — but the pattern is inherently fragile: any class-purge bug, cached old build, or specificity override breaks the invariant silently.
- **Fix (commit `4cc85b8` in `src/components/GlobalPlayer.tsx`):** single `<button>` element. `onClick` decides at runtime via `window.matchMedia("(min-width: 768px)").matches` between `router.push("/library/{songId}")` (desktop) and `setIsDrawerOpen(true)` (mobile). Dual-render is now structurally impossible. Cost: lost `<Link>` prefetch on desktop hover — acceptable for this UI element since the click target isn't a primary navigation.
- **When the CSS pattern IS OK:** two visually-different layouts (e.g. mobile bottom-nav vs desktop sidebar) — they're not "the same control with different click handlers", they're different elements. For "single visual element + bifurcated behavior", always use the runtime decision pattern.
- **Regression-test hint:** if you must keep two render paths, add a Playwright assertion that exactly one is visible: `await expect(page.getByRole("button", { name: "Open song details" })).toHaveCount(1)`. The next "both rendered" incident then fails CI instead of failing prod silently.
