# Changelog

All notable changes to this project. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version numbers follow [Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/lx-0/SunoFlow/releases/tag/v0.2.0
[0.1.4]: https://github.com/lx-0/SunoFlow/releases/tag/v0.1.4
