---
project: SunoFlow
slug: SunoFlow
last_updated: 2026-05-15T19:45:00Z
current_milestone: none
active_slice: none
active_task: none
status: brownfield-imported
---

# State

**Status:** brownfield import complete. No active milestone yet — execution is happening on Paperclip (SUNAA) via per-routine sub-issues, not via ytstack milestones.

## Next action

The user decides:

- If a discrete *initiative* needs structured planning (e.g. "rewrite the player", "add stem separation"), run `ytstack:plan-milestone` for that scope.
- For continuous BAU work (bug triage, routine features), keep using Paperclip SUNAA routines + sub-issues. Don't double-track.

## Open decisions

- Whether to migrate ongoing Paperclip-tracked work into ytstack milestones, or keep them as parallel layers. Currently parallel: ytstack for big-picture decisions/knowledge, Paperclip for issue-level execution.

## Recent summaries

(Empty — no T##-SUMMARY.md yet. Will populate once `ytstack:plan-milestone` + `summarize-task` start running.)

## Recent commits (2026-05-15 evening)

PWA / mobile stability + observability batch:

- `b78deb7` feat(sw): per-deploy cache busting + safer auto-reload UX
- `5579658` fix(deploy): wire NEXT_PUBLIC_BUILD_ID through CI → Railway → Docker build
- `f4fb70e` fix(sw): bump cache versions to evict stale Next.js bundles (interim manual bump, superseded by b78deb7)
- `c66bc2f` perf(analytics): defer PostHog init to requestIdleCallback
- `7511d20` fix(player): guard async audio paths with a load-generation token
- `45023a6` perf(audio): move waveform peak math into a Web Worker
- `868765f` fix(realtime): singleton generation tracker, visibility-aware SSE
- `de224c7` feat(query): migrate RecentlyPlayed + HistoryView to React Query
- `7b81fa3` feat(query): migrate LibraryView to useSongsList + useTagsList
- `8aed908` feat(query): introduce TanStack Query, migrate useCredits as probe
- `fbae46a` fix(observability): wire Sentry server runtime + onRequestError + logServerError

Auth / observability / data-quality batch (other Claude instance):

- `23116cc` fix(test): use BigInt() instead of literal suffix in active-users tests

Observability follow-up (2026-05-15 evening, 0.1.4):

- `f60a615` feat(observability): log silent generation failures to GlitchTip — `handleSongFailure` + `cleanupStalePending` now emit `logServerError` events. Prod-data audit via `psql DATABASE_PUBLIC_URL` against `Song WHERE generationStatus='failed'` surfaced 21 silent rows: 14× "Generation timed out" (`pollCount=0`, stale-pending sweep), 5× Suno "Internal Error", 2× content-policy rejects (suppressed by regex).
- `d31671c` test(active-users): cover count, list, and daily helpers
- `ab1fa19` fix(observability): correct active-user signal, streak triggers, failed-song archival
- `0d1fbfd` chore: initialise ytstack (brownfield import)
- `7ef992f` fix(auth): honor ADMIN_EMAILS in requireAdmin server-route guard
- `f9ce935` fix(docker): declare NEXT_PUBLIC_SENTRY_DSN as build ARG
- `d55242c` docs: bump to 0.1.2, log today's 4 fixes in roadmap + ytstack

## Open verification

- **GlitchTip ingest** — `fbae46a` fixed three holes (instrumentation.ts runtime imports, `onRequestError` export, `logServerError` → Sentry). Once `b78deb7`+`5579658` deploy lands, throw a synthetic error against `/api/songs/nonexistent/refresh` and confirm GlitchTip receives the event with `release` tagged to the deploy commit SHA.
- **4-cover-in-player bug** — never reproduced from code. Strongest hypothesis is stale PWA cache. Once the per-deploy cache-busting deploy lands, user does one hard reload to migrate from old SW; subsequent deploys auto-evict.

## Active background tasks

- (cleared — last poller `bzzwcz2pc` completed; `5579658` was REMOVED, succeeded by `d55242c` which carries all changes forward)

## 0.2.0 release (2026-05-16)

Stuck-pending incident triage (GlitchTip Issue 3) → multi-fix + architecture pass + skill restructure.

Bug-fix commits (deployed via tag-driven release):

- `6c37979` fix(songs): recover stale-pending songs via final pollOnce instead of blind timeout
- `14c8142` fix(generation): decouple Suno poll loop from SSE client lifecycle
- `5102283` fix(tests): repair 4 pre-existing test failures (date-series TZ + 3 env-mock setup)
- `34b6e0a` fix(history): retry updates local state and polls pending songs to terminal
- `38fe73a` feat(error-logger): promote indexable IDs from params to Sentry tags
- `70124e6` fix(error-handling): isolate per-row failures and catch SSE stream throws
- `92bfce3` fix(library): clear archivedAt on retry + success so recovered songs reappear
- `d424236` refactor(history): extract retry transport into tested pure helpers

Architecture refactor batch:

- `687de28` refactor(songs): single seam for generationStatus + archivedAt transitions (`src/lib/songs/lifecycle.ts`)
- `f5d8aa9` refactor(generation): split handleSongSuccess into per-domain adapters (`src/lib/generation/song-ready-events/`)
- `c598c87` refactor(songs): extract stale-pending recovery from the read path (`src/lib/songs/stale-pending-recovery.ts`)
- `f86b468` refactor(songs): replace SongListItem polling with generation-tracker subscription (`src/hooks/useTrackPendingSong.ts`)
- `76f7fb3` refactor(queue): single addItem seam + split updateItem dual-signature
- `699e819` refactor(notifications): single channel-config seam per NotificationType (`src/lib/notifications/channels.ts`)
- `d870af1` refactor(error-logger): split client/server logger into separate modules (`src/lib/error-logger/{client,server,extract,index}.ts`)

Skill / docs / version bump:

- `b143ee0` docs(skill): align SunoFlow skill with current MCP server + skill best practices
- `a8516cc` docs(skill): restructure SunoFlow skill as entrypoint + reference files
- `1c0329c` docs(skill): fix markdown lint + add variation examples for every tool
- `63d6a1a` chore: bump version to 0.2.0 across app, plugin, MCP server, and skill
- `b6605b0` (lx-0/skills): docs(sunoflow): sync marketplace description with restructured SKILL.md

Prod data fix (one-off, not in git):

- 6 stuck-archived "ready" songs unarchived via direct SQL on Railway DB public proxy. See KNOWLEDGE.md → "Historical data fixes".

Tests: 1270 passing / 47 skipped / 0 failed. Typecheck clean throughout.

## Open verification (post-0.2.0)

- **GlitchTip Issue 3 should stop receiving events** under the new release SHA. Verify after Railway deploy lands: `mcp__plugin_yesterday-cloud_glitchtip__list_issues` for project `sunoflow-prod`, filter on `is:unresolved`, confirm no new events for "Generation timed out (stale-pending sweep)" under release > `a777cca`.
- **SunoFlow plugin update**: run `/plugin update sunoflow` locally; confirm `/plugin info sunoflow` reports `0.2.0` and Claude reads `SKILL.md` (111 lines) on first invoke instead of the old monolithic 345-line version.
- **Marketplace description**: `/plugin` browse should show the new third-person description after marketplace cache refresh.
