---
project: SunoFlow
slug: SunoFlow
last_updated: 2026-05-15T15:00:00Z
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

## Recent commits (snapshot at init, 2026-05-15)

- `f9ce935` fix(docker): declare NEXT_PUBLIC_SENTRY_DSN as build ARG
- `fbae46a` fix(observability): wire Sentry server runtime + onRequestError + logServerError
- `c66bc2f` perf(analytics): defer PostHog init to requestIdleCallback
- `7511d20` fix(player): guard async audio paths with a load-generation token
- `45023a6` perf(audio): move waveform peak math into a Web Worker
