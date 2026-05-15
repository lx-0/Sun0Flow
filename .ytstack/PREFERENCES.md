# Preferences

Local preferences for SunoFlow. Applied to every ytstack session.

## Explain level

explain_level: terse

(Owner prefers terse responses, no filler — see `~/.claude/CLAUDE.md`.)

## Language

- Conversation: Deutsch
- Code / commits / PRs / docs: English

## Model preferences

Default — no per-skill overrides.

## Timeouts

Default.

## Custom

- **Never duplicate `docs/` content into `.ytstack/`** — link out instead. KNOWLEDGE.md and RUNTIME.md are indexes, not mirrors.
- **Paperclip SUNAA is the issue-level execution layer.** Don't re-implement issue tracking inside ytstack milestones for BAU work. Reserve milestones for discrete initiatives.
- **Tag-driven deploys.** Never push a `v*.*.*` tag without explicit user confirmation.
