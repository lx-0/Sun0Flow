# Decisions

Append-only architectural and product decisions for SunoFlow. Never rewrite past entries. If a decision is reversed, add a new entry that supersedes.

Format for each entry:

## YYYY-MM-DD: <Short title>

**Context:** <what forced the decision>
**Options considered:** <A, B, C>
**Chose:** <selected option>
**Reason:** <why>
**Supersedes:** <link to earlier entry if this reverses a prior decision>

---

## 2026-05-15: ytstack initialised on existing codebase (brownfield import)

**Context:** SunoFlow has been in production since spring 2026. No `.ytstack/` existed. User asked for full ytstack adoption to get the lifecycle artifacts on a mature codebase.
**Options considered:**
A) Pretend it's greenfield — run `ytstack:office-hours` against the existing app.
B) Skip ytstack — feature map only as a single `docs/FEATURES.md`.
C) Brownfield import — scaffold `.ytstack/` with artifacts backfilled from README/docs/package.json, skip pitch.
**Chose:** C
**Reason:** Pitch validation on an already-shipped product is theater. A) wastes a session and produces a fabricated pitch. B) loses the lifecycle benefits (DECISIONS/KNOWLEDGE/STATE for future agents). C) preserves real context AND surfaces friction worth upstreaming to ytstack itself.

## 2026-05-15: KNOWLEDGE.md and feature inventory live in `docs/`, not duplicated here

**Context:** Repo already has `docs/feature-inventory.md`, `docs/deployment-runbook.md`, `docs/backup-runbook.md`, `docs/incident-response.md`, etc. ytstack expects KNOWLEDGE.md/RUNTIME.md to be the primary source.
**Options considered:**
A) Copy/duplicate the docs into `.ytstack/` artifacts.
B) Leave `.ytstack/` files mostly empty, link out to `docs/`.
**Chose:** B
**Reason:** Single source of truth. Duplication rots. Future ytstack skills that read KNOWLEDGE.md will see the pointer and follow it.

## 2026-05-15: GitHub-issue triage routine on Paperclip SUNAA

**Context:** SunoFlow has open GitHub issues but no recurring triage workflow on the Paperclip company SUNAA. Issues sit silently until someone manually pokes the board.
**Options considered:**
A) PM agent owns triage + delegation (single routine).
B) Engineer agent handles everything (single routine).
C) Two routines (PM triage + Engineer execution).
**Chose:** A
**Reason:** PM has GITHUB_TOKEN wired, can label/comment/close on GitHub and create SUNAA sub-issues assigned to Engineer in one heartbeat. Two routines double the cron load with no clarity gain. Scheduled MWF 10:00 Amsterdam (matches existing PM routines).
**Reference:** Paperclip routine `868b6885-5995-466c-b5ec-8adcc083ce06` ([memory](~/.claude/projects/-Users-alex-Sync-home-alex-Code-WebDev-projects-lx-0-SunoFlow/memory/project_sunoflow_paperclip_company.md))
