# ytstack friction notes — brownfield init (2026-05-15)

Captured live during `ytstack:init-project` on SunoFlow, an already-deployed Next.js / Prisma / Railway codebase with a substantial `docs/` directory and no prior ytstack adoption. Goal: surface gaps that should become a PR against the `ytstack` plugin.

Target plugin: `yesterday-public-plugins/ytstack` (skill: `init-project`, frontmatter version observed `0.1.4`).

## Mental model: greenfield vs brownfield vs brownfield-with-prior-docs

ytstack's current init flow assumes ONE of two states:

1. **Greenfield, no pitch** → directs user to `office-hours` first, scaffolds PROJECT.md with a placeholder one-liner.
2. **Greenfield, pitch present** → consumes `OFFICE-HOURS.md`, populates PROJECT.md, moves the pitch into `.ytstack/`.

There is **no third path** for the most common real-world case: **brownfield import**, where the codebase has been shipping for months/years and has its own README, ADRs, runbooks, CHANGELOG, feature inventory, etc. Running `office-hours` against a shipped product fabricates a pitch retroactively — pure theater. Running init produces a useless placeholder one-liner pointing the user *back* to office-hours, even though every answer is already in the repo.

## Friction observed on SunoFlow

| # | Friction | Impact |
|---|---|---|
| 1 | `init-project` has no detection for existing brownfield signals (README with >100 LOC, `docs/` directory, `package.json` with `description`/`version`, `CHANGELOG.md`, prior ADRs in `docs/adr/`). It assumes a clean slate. | Placeholder PROJECT.md is shipped when a real one could be backfilled. |
| 2 | No prompt to scan existing docs as a one-liner source. README's first paragraph is usually a perfect one-liner. | User has to manually edit PROJECT.md after the fact. |
| 3 | The "office-hours first" guidance becomes anti-advice in brownfield. Forcing a retroactive pitch on a shipped product produces fabricated success criteria. | Skill becomes worse than nothing for mature projects. |
| 4 | KNOWLEDGE.md is created empty. Mature repos already have `docs/runbooks`, `docs/adr/`, `docs/feature-inventory.md`, etc. There's no "link to existing docs" pattern. | Duplication risk OR an empty KNOWLEDGE.md that gets ignored. |
| 5 | RUNTIME.md is created empty. `package.json` scripts, `docker-compose.yml`, `.env.example`, and `.github/workflows/deploy-*.yml` together describe ~80% of the runtime. The skill could backfill these. | Manual work to write what's already structured in the repo. |
| 6 | DECISIONS.md is empty. If `docs/adr/` or `DECISIONS.md` already exists at the repo root, the skill ignores it. | Existing decision history orphaned. |
| 7 | No way to record "this project's issue-level execution lives somewhere else" (Linear, GitHub Projects, Paperclip, Jira). Forces the user to either treat ytstack milestones as the source of truth or ignore the milestone tooling. | Two parallel trackers, or one abandoned tracker. |
| 8 | Sentinel `~/.ytstack/.init-project-<slug>-completed` is keyed by `basename(cwd)`, not by repo remote URL. Two projects with the same folder name on the same machine collide. | Edge case but real for collection directories like `lx-0/`. |
| 9 | The skill enforces an `AskUserQuestion` for scope even when the answer is overdetermined (git repo + team workflow → always project-level). One forced interaction per init. | Friction tax. Could be a default with a quiet override. |
| 10 | No completion sentinel content (the touched file is empty). Re-running init has no way to reconstruct what was decided last time without reading PROJECT.md. | Self-healing harder than necessary. |

## Concrete PR proposal

Add a third mode to `init-project`: **`brownfield-import`**.

### Detection

Run a brownfield-signal probe in the preamble:

```bash
_BROWNFIELD_SIGNALS=0
[ -f README.md ] && [ "$(wc -l < README.md)" -gt 30 ] && _BROWNFIELD_SIGNALS=$((_BROWNFIELD_SIGNALS+1))
[ -d docs ] && [ "$(ls docs/*.md 2>/dev/null | wc -l)" -gt 2 ] && _BROWNFIELD_SIGNALS=$((_BROWNFIELD_SIGNALS+1))
[ -f CHANGELOG.md ] && _BROWNFIELD_SIGNALS=$((_BROWNFIELD_SIGNALS+1))
[ -d docs/adr ] && _BROWNFIELD_SIGNALS=$((_BROWNFIELD_SIGNALS+1))
[ -f package.json ] && [ "$(git log --oneline 2>/dev/null | wc -l)" -gt 50 ] && _BROWNFIELD_SIGNALS=$((_BROWNFIELD_SIGNALS+1))
echo "BROWNFIELD_SIGNALS: $_BROWNFIELD_SIGNALS"
```

If `BROWNFIELD_SIGNALS >= 2` AND `PITCH = none`: route to `brownfield-import` path instead of greenfield placeholder.

### Backfill behavior

- **PROJECT.md one-liner**: grep first non-heading paragraph from README.md, offer it as candidate.
- **KNOWLEDGE.md**: auto-link every `docs/*.md` file with a one-line summary (read the H1 of each).
- **RUNTIME.md**: parse `package.json` `scripts`, `.env.example` keys, `docker-compose.yml` service list, `.github/workflows/deploy-*.yml` target.
- **DECISIONS.md**: if `docs/adr/` or `docs/DECISIONS.md` exists, link/inherit instead of overwriting.

### External-tracker awareness

Add a `PREFERENCES.md` field `external_issue_tracker: <url or 'none'>` so other skills (`plan-milestone`, `slice-milestone`) can warn "this project tracks issues elsewhere — are you sure you want milestone-level scope here?"

### Scope question default

In a git repo with a remote, auto-select project-level unless `YTSTACK_FORCE_ASK_SCOPE=1`. Keep the question available, don't make it mandatory.

## Other observations

- The "Anti-Pattern" section at the top of init-project is good — keep it. But it currently only addresses "too small for ytstack". Add a sibling section: "too mature for greenfield ceremony — use brownfield-import instead."
- The skill writes the sentinel file as empty. Writing the scope choice and brownfield-status into it as JSON would let re-runs introspect.
- The DOT process flow could gain a `brownfield-import` branch parallel to the greenfield arrows.

## Out of scope (but worth a follow-up issue on ytstack)

- `reassess-roadmap` and `plan-milestone` both reference `STATE.md` heavily. Brownfield STATE.md with `current_milestone: none` works, but the wording "Run ytstack:plan-milestone to define the first milestone" is misleading when issue-level work happens externally. STATE.md should support a `tracker: <external-url>` annotation that those skills respect.
- No skill exports a "what does ytstack think about this project" digest to feed back to external trackers. A `ytstack:digest` skill that prints the current STATE + recent decisions would help bridge layers.

---

If/when this is upstreamed: open issue on the ytstack repo first, link to this file, propose the `brownfield-import` mode as an additive change (no behavior change for existing greenfield users).
