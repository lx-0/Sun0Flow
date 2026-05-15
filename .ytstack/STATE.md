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
