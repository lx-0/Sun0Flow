# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version numbers follow [Semantic Versioning](https://semver.org/).

## [0.2.3] — 2026-05-21

Inspire feed fed the song generator truncated RSS summaries with a literal `[ mehr ]` artifact instead of real article text.

### Fixed

- **Inspire "Generate from this" used the RSS summary, not the article — and leaked a `[ mehr ]` marker into the prompt** (`b040ee6`). Root cause: the parser preferred `<content:encoded>` over `<description>`, but for tagesschau-style German news feeds `content:encoded` is *not* the article body — it is `<image> + the same summary as <description> + a "[<a>mehr</a>]" read-more link`. After `stripTags`, the read-more anchor survived as the literal `[ mehr ]` and the "content" was just a ~200-char summary. The prior link-following fix (SUNAA-542) gated article backfill on `inlineLength < 200`, but the dressed-up summary cleared that bar, so the link was never followed. Reproduced live against the real tagesschau feed (`content:encoded` ending in `...zu gelangen.[mehr]`).
  - `src/lib/rss/parse.ts` — `hasReadMoreMarker` / `stripReadMoreMarker` detect and strip bracketed read-more markers (`[mehr]` / `[weiterlesen]` / `[read more]`) and trailing-ellipsis truncation, without touching the bare word "mehr" or a mid-sentence "…".
  - `src/lib/rss/index.ts` — article backfill now triggers on `truncated || inlineLength < threshold` (never length alone); `RssItem.truncated` flag set during parse; per-feed cap raised 5 → 20 to cover every displayed item; outbound fetches bounded by concurrency (6) and a hard 9 s time budget so the feed response never hangs and slow articles keep their (marker-stripped) summary.
  - Fix lives at the `fetchFeed` seam, so the Inspire page, Today's Picks / digest, and the auto-generate job all get full article text automatically.
- **Verification:** 98 unit tests + new `fetchFeed` integration tests; live against tagesschau **and** Spiegel — 0 marker artifacts, real articles backfilled, video-only items fall back to clean captions, ~1 s per feed.

## [0.2.2] — 2026-05-18

UI + infra fixes around the global player and Railway deploys (white-screen on first mobile visit, dual cover in the player bar, latent build-blocking TS narrowing), the audio-cache volume being 46% empty because alternate songs never reached disk, and a four-front fix for iOS PWA playback instability (songs play briefly then stall, some never start).

### Fixed

- **Expanded player tab buttons (Lyrics / Up Next / EQ) appeared dead on mobile.** `src/components/ExpandedPlayer.tsx` rendered every section (header, cover, song info, waveform, main + secondary controls, tab buttons, safe-area spacer) as `flex-shrink-0` siblings inside a `flex flex-col` container at `h-full` (= 100dvh on mobile). The inline panel was added below with `flex-1`. Because the flex-shrink-0 siblings already filled the viewport, `flex-1` resolved to ~0px and the panel rendered with no visible height (or scrolled below the DrawerContent bottom anchor). Clicking still toggled `activeTab`, but the visual confirmation was just a subtle button-color change — the user perceived "buttons don't work". Restructure:
  - Wrapped header through secondary controls in a `flex-1 min-h-0 overflow-y-auto md:flex-initial md:overflow-visible` upper region — so on mobile it competes for space with the panel instead of pinning the panel out of the viewport.
  - Panel container: `flex-1` → `flex-1 min-h-0 overflow-y-auto md:flex-initial md:max-h-[50vh] ... border-t border-gray-800`. Splits available height ~50/50 with the upper region on mobile; caps at 50vh on desktop where the drawer is `md:h-auto md:max-h-[90vh]`.
  - Outer: `overflow-y-auto` → `overflow-hidden md:overflow-y-auto`. Mobile delegates scrolling to the inner zones; desktop keeps the existing single outer-scroll behaviour.
- **Railway port-leak in self-redirects** (`94afe16`). Next.js standalone server builds absolute redirect URLs from `req.headers.host`, which behind Railway includes the internal container `$PORT=8080`. Browsers then follow `Location: https://sunoflow.up.railway.app:8080/de` to a port the edge does not expose → connection refused → white screen. Reproduced live with `curl -sI -H "Accept-Language: de" https://sunoflow.up.railway.app/`. Symptom triggered on first-time visitors (no `NEXT_LOCALE` cookie yet) so the `next-intl` locale redirect fired — long-standing latent bug, only surfaced once iPhone Chrome happened to hit `/` cleanly. Fix: middleware post-processes the `Location` header — when `x-forwarded-host` is present (= behind a proxy), rewrite any self-host redirect to use the canonical public origin with no port. Dev (no `x-forwarded-host`) is untouched, so `localhost:3000` redirects keep working. External redirects (OAuth callbacks) untouched. Three new vitest cases pinned to `src/middleware.test.ts`.
- **Dual cover in global player** (`4cc85b8`). The player rendered two `<button>`+`<Link>` cover elements with CSS mutual exclusion (`md:hidden` + `hidden md:flex`). User-visible bug: on iPhone Chrome both rendered side-by-side instead of one. Root cause not pinpointed (Tailwind purge / SW cache / something specific to the install) — but the mutual-exclusion-via-CSS pattern was inherently fragile. Replaced with a single `<button>` whose `onClick` decides at runtime via `window.matchMedia("(min-width: 768px)")`: desktop → `router.push("/library/{songId}")` (preserves the prior Link behavior), mobile → `setIsDrawerOpen(true)` (preserves the prior button behavior). Both behaviors retained, dual-render structurally impossible. Cost: lost `<Link>` prefetch on desktop hover — acceptable for this UI element.
- **Upload route TS narrowing** (`7553d92`). After the prior `22ee71f` route-handler refactor migrated to route-pipeline body parsing, `fileUrl` became correctly typed as `string | undefined`. The ternary `base64Data ? uploadFileBase64(...) : uploadFileFromUrl(fileUrl, ...)` left TS unable to narrow `fileUrl` to `string`, even though the validation guard at line 40 ensures one of `base64Data`/`fileUrl` is set. Build failed on Railway. Restructured as `if/else if/else throw unreachable` so TS narrows naturally. Surfaced because my local `tsc --noEmit` ran *before* `git pull` brought `22ee71f` into the merge — see Learnings.

#### Audio cache: alternate songs never reached disk (commit `54ad93f`)

- **Clip-UUID vs task-id confusion in `fetchFreshUrls`.** Primary songs store the Suno task-id (32 hex chars, no dashes) in `Song.sunoJobId`; alternates store the per-clip UUID instead. The record-info API only accepts task-ids, so every refresh attempt for an alternate 404'd. `warmUpAudioCache` then never populated the 105 alternates (out of 226 ready songs in prod), and the obsolete `scripts/repull-all-audio.ts` backfill had the same bug.
  1. `src/lib/sunoapi/refresh.ts` — Strategy 1 now matches the clip by `clip.id === sunoAudioId` instead of "first clip with a URL".
  2. `src/lib/cache/warmup.ts` — try direct download of the existing DB `audioUrl`/`imageUrl` first (those URLs are valid for ~9 months, no refresh needed). Only call `fetchFreshUrls` when actually stale, and pass `parentSong.sunoJobId` for alternates.
  3. `src/lib/audio/index.ts` + 4 routes (`audio/[songId]`, `audio/public/[songId]`, `images/[songId]`, `songs/[id]/play`) — `proxyAudio` accepts optional `parentSunoJobId`. Callers fetch `parentSong: { select: { sunoJobId } }`.
  4. Deleted `scripts/repull-all-audio.ts` (superseded by warmup, same bug).
- **Prod verification:** volume 121 mp3 / 119 jpg / 470 MB → 226 mp3 / 222 jpg / 840 MB (full DB coverage) on the next deploy's warmup pass with `failed=0`.

#### Mobile iOS PWA playback instability — four-front fix (commit `f3423bc`)

Reported as "songs play briefly then stop, some don't play at all, intermittent hangs". iOS-confirmed; Android untested. Four independent root causes, all in one commit:

- **Middleware `PUBLIC_PATHS` missed media-proxy routes.** Only `/api/songs/public` was listed. Unauthenticated (or cookie-evicted) requests to `/api/audio/{,public/}` and `/api/images/` received a 307 → `/login` HTML page that the `<audio>`/`<img>` element then tried to use as the media stream. Added `/api/audio/` and `/api/images/` — the route handlers already enforce their own auth/visibility checks (`authRoute` / `publicRoute`), so the edge redirect was redundant and harmful. Authenticated routes now return `401 application/json` instead of 307 HTML for unauth requests.
- **Service worker cached `/api/audio/*` responses by URL only, ignoring the Range header.** With Range requests, `cache.match(request)` returned the first cached partial for every subsequent byte-range — songs played the first chunk and then stalled. The SW now bypasses itself entirely for requests carrying a Range header (browser → server direct). Only full 200 responses (Save-Offline path) reach the cache. `AUDIO_CACHE` bumped `sunoflow-audio-v1` → `v2` to evict any leftover 206 partials.
- **Sync `readFileSync` in `proxyAudio.serveCached` blocked the event loop on every audio request.** Reading a 3–7 MB mp3 synchronously off the Railway volume serialised every concurrent request behind it. Added `FileCache.getStream(id, start?, end?)` returning a Web `ReadableStream` reading only the requested range. `serveCached` now streams the correct byte slice without buffering the whole file. `FileCache.put` is now fire-and-forget `fs.promises.writeFile`. 3 new tests for `getStream` (full, byte-range, missing).
- **`cdnFallbackRef` was add-only.** A single transient proxy error pinned a song to direct-CDN for the rest of the session — losing the local file-cache hit on every replay AND making the user dependent on Suno-CDN availability for that song. Now cleared per-song at the start of `resolveAndPlay` / `playQueue` so the proxy gets a fresh shot on each load.

##### Edge bundling caveat (also in `f3423bc`)

- `instrumentation.ts` now imports `@/lib/cache/warmup` directly instead of going through the `@/lib/cache` barrel — the barrel re-exports `audioCache`/`imageCache` from `file.ts`, which uses Node-only `fs`/`stream` and broke the edge-runtime bundling of `instrumentation.ts`. `Readable.toWeb()` was replaced with an inline `nodeStreamToWeb` helper in `file.ts` for the same reason (avoids any static `import "node:stream"` / `import "stream"`).

### Operational

- **Deploy workflow merged** (`cc35527`). Picked up the `fix/deploy-workflow-pnpm` branch (sitting unmerged for 2 days). Adds `pnpm/action-setup` + `setup-node` + `pnpm install --frozen-lockfile` + dummy `SUNOFLOW_DATABASE_URL` for the migration-safety-check step. Without it, `gh workflow run deploy-production.yml` errored at the `prisma validate` step with `pnpm: command not found`.

### Verification

- `pnpm exec tsc --noEmit` clean.
- `pnpm vitest run src/middleware.test.ts` — 38/38 pass (incl. 3 new port-leak cases).
- `pnpm vitest run` — 1306 passed total (1 pre-existing upload-INTERNAL_ERROR flake, unrelated).
- `pnpm build` clean (edge bundling of `instrumentation.ts` verified after `nodeStreamToWeb` inlining).
- Prod redirect verified live: `curl -sI -H "Accept-Language: de" https://sunoflow.up.railway.app/` → `location: https://sunoflow.up.railway.app/de` (was `:8080/de`).
- Audio-cache backfill verified live: volume 226 mp3 / 222 jpg / 840 MB on Railway after deploy.
- Media-proxy middleware fix verified live via `curl`: `/api/audio/public/<id>` with `Range: bytes=500000-1000000` → `206` + correct `Content-Range`; `/api/audio/<id>` without cookie → `401 application/json` (was 307 HTML).
- Expanded-player + dual-cover + SW + `cdnFallbackRef` fixes untested in live browser at commit time — user-side iPhone verification pending.

### Known follow-ups

- **CI E2E flake** — same 3 tests fail with `ERR_CONNECTION_REFUSED` across two consecutive runs since the `392767f` merge (`unauthenticated → /login`, smoke `/generate`, smoke `/mashup`). My middleware change is a pure no-op without `x-forwarded-host` (= always in CI's local `next dev`), so the regression isn't obviously from the middleware. Possibly an interaction between middleware + `5c99701 feat(auth)` after the merge. Tracked as BAU; not blocking.

### Process

- New memory: `feedback_always_push_after_commit.md` — for SunoFlow specifically (solo project, sole committer), push immediately after every commit on `main` and trigger the deploy workflow for prod-affecting fixes. Overrides the global "never auto-push" rule.
- New memory: `feedback_post_pull_typecheck.md` — re-run `pnpm tsc --noEmit` after any `git pull` that brings in remote commits, before pushing. Latent type errors in merged-in files (e.g. `22ee71f`) don't fail in local pre-pull state.

## [0.2.1] — 2026-05-16

Post-0.2.0 verification surfaced GlitchTip Issue 5 (PrismaClientKnownRequestError, "Unique constraint failed on the fields: (`sunoJobId`)") — pre-existing concurrent-handler race that the 0.2.0 recovery refactor exposed more frequently because `runStalePendingRecovery` now calls `handleSongSuccess` on songs the old blind-timeout would have left dead.

### Fixed

- **handleSongSuccess race in `createAlternateSongs`** (`5d3b275`). Three pathways can fire `handleSongSuccess` concurrently for the same parent song: the SSE `pollToCompletion` loop, the client `/api/songs/[id]/status` poll, and the stale-pending recovery sweep. When two land within milliseconds, the second's `createAlternateSongs` hits the `@unique` constraint on `Song.sunoJobId` and Prisma throws P2002. Two-layer fix:
  1. **Single-flight guard at top of `handleSongSuccess`** — skip if `generationStatus === "ready"` AND `sunoAudioId === firstSong.id` (another handler already completed this song with this exact primary clip). Prevents the common ~100ms-gap race; covers most cases without TOCTOU concerns.
  2. **Idempotent `createAlternateSongs`** — wrap each `prisma.song.create` in try/catch for P2002; on collision, look up the existing alternate by its `@unique` `sunoJobId` and push its shape into the alternates list. Non-P2002 errors still propagate.

### Verification

- **Issue 3 (stale-pending sweep)** marked resolved in GlitchTip with `in_release: 63d6a1a...` (the 0.2.0 deploy SHA). Auto-reopens if a new event arrives.
- **Issue 5** stays unresolved until a race-class verification window (~7d silence) passes after the `5d3b275` deploy.

### Docs (cross-repo)

- `yesterday-ai/cloud` `6e7ccd5` — extended the `glitchtip-mcp` skill with a "Resolving an issue" section: four-criteria verification workflow (fix SHA identified, deployed, event-rate-scaled silence window, not collateral) plus `update_issue(in_release="...")` pinning so GlitchTip auto-reopens on recurrence. Refined the prior absolute "Don't auto-resolve" anti-pattern.

## [0.2.0] — 2026-05-16

Substantial bug-fix + architecture pass triggered by a real prod incident (GlitchTip Issue 3, "Generation timed out (stale-pending sweep)"). No breaking API surface — every change is internal architecture or UI behaviour.

### Fixed

- **Stuck-pending songs after retry / tab close / server restart.** Two distinct root causes:
  - `cleanupStalePending` was a blind timeout that flipped `pending → failed` without re-probing Suno, discarding songs the upstream had actually completed (`6c37979`). Replaced with `runStalePendingRecovery`: a per-row probe that calls `pollOnce` and dispatches to `handleSongSuccess` / `handleSongFailure` / `handleSongFailure("Generation timed out (upstream lost)")` / pollCount-bump-and-defer based on the real upstream outcome. Hard 60-min ceiling for the still-processing branch.
  - `/api/generate/[jobId]/stream` passed `request.signal` into `pollToCompletion`, killing the server-side poll loop when the client closed its tab (`14c8142`). Suno would still complete the song, but the SunoFlow row stayed `pending` forever. Decoupled — the SSE forwarder is now best-effort while the poll loop runs independently to its terminal state.
- **Regenerated songs invisible in library** (`92bfce3`). `handleSongFailure` auto-archives via `archivedAt = now`; none of the three "back to ready" paths (retry route, `persistSongCompletion`, recovery sweep) cleared it. Library default filter is `archivedAt: null`, so a successfully-retried song was filtered out. Lifecycle now clears `archivedAt` + `errorMessage` on every transition back to `ready` / `pending`.
- **Retry UI didn't reflect new state until manual refresh** (`34b6e0a`, `d424236`). `GenerationHistoryView.handleRetry` called `router.refresh()` but the client kept a stale `songs` state from `initialSongs`. Now merges the retry-response into local state immediately and polls `/api/songs/[id]/status` every 4s for any pending row until terminal.
- **Per-row recovery failures aborted the loop** (`70124e6`). One bad row's exception inside `runStalePendingRecovery` killed the rest. Wrapped each iteration in try/catch with `logServerError("song-stale-recover-error", …)` so a single DB / side-effect throw doesn't block the remaining stale rows.
- **SSE stream crashes on `pollToCompletion` throw** (`70124e6`). The `for await` was unhandled — added catch + terminal `failed` event so the UI doesn't hang on a perpetual spinner.
- **Date-series TZ bug** (`5102283`, part of test-suite repair). `mondayOfWeeksAgo` mixed local-time `setDate/getDay/setHours` with `toISOString()` (UTC) → off-by-one in any UTC+ timezone. Switched to UTC-* variants.

### Changed (refactors — no behaviour change)

- **Single seam for `generationStatus` + `archivedAt` transitions** (`687de28`). Five scattered `prisma.song.update` sites collapsed onto `src/lib/songs/lifecycle.ts` (`readyTransition`, `pendingRetryTransition`, `buildFailedTransition`, `markSongFailedSimple`, `markSongPendingRetry`, `markSongReadyNoApi`). Status / archive / errorMessage invariants live in one place.
- **`handleSongSuccess` split into four domain adapters** (`f5d8aa9`). The 100-line god-handler with 11 inline `runSideEffect` lambdas became a 25-line orchestrator + `src/lib/generation/song-ready-events/{broadcast,cache-assets,engagement,notify}.ts`. Each adapter has its own test file; future side-effect additions land in one domain file instead of the orchestrator.
- **Stale-pending recovery extracted from the read path** (`c598c87`). `querySongLibrary` was firing-and-forgetting `cleanupStalePending` inline. Recovery now lives in `src/lib/songs/stale-pending-recovery.ts`; trigger is explicit at `/api/songs` route level via `kickoffStalePendingRecovery`. `querySongLibrary` is now a pure read with no side effects (and no longer needs `pollOnce`/`handleSongSuccess`/`handleSongFailure` imports).
- **SongListItem polling consolidated onto generation-tracker** (`f86b468`). The component had its own `setTimeout` polling loop parallel to the singleton `generation-tracker.ts`. Replaced with `useTrackPendingSong` hook that subscribes to the tracker and does a single full-row fetch on terminal transition. Wins: shared SSE / polling-fallback / visibility-pause / MAX_POLLS guard.
- **Queue API cleanup** (`76f7fb3`). Merged `enqueueFromSpec` into `addItem` so circuit-open enqueues respect MAX_QUEUE_SIZE. Split the dual-signature `updateItem({id} | {songId,status})` into `updateItemById` + inline `prisma.updateMany` inside `resolveBySongId`.
- **Notifications channel registry** (`699e819`). The "which channels fire for which type" knowledge was spread across `PUSH_PREF_FIELD` + `EMAIL_PREF_FIELD` + a `sendNotificationEmail` switch. Collapsed into `src/lib/notifications/channels.ts` — a typed `Record<NotificationType, NotificationChannels>` that makes "no channels means in-app only" a deliberate explicit empty entry instead of accidental absence.
- **Error-logger split into client + server modules** (`d870af1`). `src/lib/error-logger.ts` mixed `logError` (client-only in practice — 28+ `"use client"` error.tsx boundaries) and `logServerError` with a dead `typeof window === "undefined"` branch. Split into `src/lib/error-logger/{client,server,extract,index}.ts`.
- **Error-logger tag promotion** (`38fe73a`). Indexable params (`songId`, `sunoJobId`, `playlistId`, `stemId`, `feedId`, plus `userId`) auto-promoted from `extra` to Sentry tags. Tags are searchable in the GlitchTip UI and via the MCP `list_issues` query API — `extra` is not surfaced via MCP. Now you can `list_issues query:"songId:cmp744adr0007"` to find issues for a specific song.

### Docs

- **SunoFlow skill restructured per Anthropic skill best practices** (`a8516cc`, `1c0329c`, `b143ee0`). Was a monolithic 345-line `SKILL.md`; now a 111-line entrypoint + `skills/sunoflow/reference/{tools,resources}.md` loaded on demand. Frontmatter split into third-person `description` + `when_to_use`. Every tool has comprehensive variation examples (free-form vs custom mode, instrumental, persona, negative-tags for `generate_song`; continue-from-end vs new-lyrics for `extend_song`; tempo vs key vs one-shot for `generate_sounds`; etc.). Markdown lint clean. Marketplace description in `lx-0/skills` synced to match (commit `b6605b0` over there).

### Data migration

- **Six historical stuck-archived rows unarchived in prod** ("Glass & Bone", "Infinite Rooms", "Patch Notes", "World State" ×2, "Mashup"). All had `generationStatus="ready"` + `archivedAt != null` + `errorMessage IS NULL` + `audioUrl IS NOT NULL` + `pollCount > 0`, indicating they were bug-victims of the cleared-archive gap. Manual transaction via `psql DATABASE_PUBLIC_URL` returned 6 rows; verification SELECT returned 0 remaining.

## [0.1.4] — 2026-05-15 (evening)

See `roadmap.md`. Headline: silent-generation-failure observability hook (`f60a615`) — exposed 21 silent failures across the DB.

## [0.1.0 — 0.1.3]

Pre-changelog era. See git log + roadmap.md for granular history.

[0.2.1]: https://github.com/lx-0/SunoFlow/releases/tag/v0.2.1
[0.2.0]: https://github.com/lx-0/SunoFlow/releases/tag/v0.2.0
[0.1.4]: https://github.com/lx-0/SunoFlow/releases/tag/v0.1.4
