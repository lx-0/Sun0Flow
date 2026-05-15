# SunoFlow Product Roadmap

> Last updated: 2026-03-24
> Maintained by: CEO

## Vision

SunoFlow is a personal AI music management platform that lets users generate, organize, discover, and share music powered by the Suno API. The product vision is to be the best companion app for Suno — handling everything from prompt crafting to library management to social sharing.

---

## Milestones

### Milestone 1: Foundation (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-20

Core platform setup and basic music generation loop.

| Deliverable | Issue | Status |
|:--|:--|:--|
| Tech stack & architecture | SUNAA-2 | Done |
| Mobile web scaffold + auth | SUNAA-3 | Done |
| Suno API client integration | SUNAA-6 | Done |
| Song library with playback | SUNAA-5 | Done |
| Generation form UI | SUNAA-12 | Done |
| Generation status polling | SUNAA-13 | Done |
| Song downloads | SUNAA-4 | Done |
| E2E testing infrastructure | SUNAA-19, SUNAA-20, SUNAA-21, SUNAA-22 | Done |
| Auth flow (signup/login) | SUNAA-10, SUNAA-28 | Done |

---

### Milestone 2: Feature Expansion (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-21

Rich feature set covering the full music management lifecycle.

| Deliverable | Issue | Status |
|:--|:--|:--|
| Song sharing via public link | SUNAA-15, SUNAA-53 | Done |
| Search & filtering | SUNAA-16, SUNAA-36 | Done |
| Favorites & ratings | SUNAA-17, SUNAA-33 | Done |
| Song detail page + waveform | SUNAA-45, SUNAA-68 | Done |
| Playlists / collections | SUNAA-35, SUNAA-88 | Done |
| Generation history & retry | SUNAA-23, SUNAA-42 | Done |
| Prompt templates & presets | SUNAA-39, SUNAA-76 | Done |
| User profile & settings | SUNAA-14, SUNAA-41, SUNAA-85 | Done |
| Admin dashboard | SUNAA-80 | Done |
| Notifications | SUNAA-55, SUNAA-74 | Done |
| Dark mode | SUNAA-32, SUNAA-60 | Done |
| Responsive mobile layout | SUNAA-27, SUNAA-44, SUNAA-84 | Done |
| Error handling & boundaries | SUNAA-26, SUNAA-43, SUNAA-82 | Done |
| Loading states & skeletons | SUNAA-25, SUNAA-46, SUNAA-83 | Done |
| Toast notifications | SUNAA-24 | Done |
| Keyboard shortcuts | SUNAA-29, SUNAA-81 | Done |
| API rate limiting | SUNAA-30, SUNAA-47, SUNAA-67 | Done |
| Batch operations | SUNAA-38 | Done |
| Dashboard analytics | SUNAA-37, SUNAA-91 | Done |
| Content moderation & reports | SUNAA-89 | Done |
| PWA & offline support | SUNAA-34 | Done |
| SEO & Open Graph | SUNAA-86 | Done |
| API docs (Swagger) | SUNAA-61 | Done |
| Data export (JSON/CSV) | SUNAA-56 | Done |
| Tagging system | SUNAA-48 | Done |
| Onboarding tour | SUNAA-49 | Done |
| Pagination | SUNAA-87 | Done |
| Email verification & password reset | SUNAA-93 | Done |
| Caching layer | SUNAA-94 | Done |

---

### Milestone 3: Advanced Audio & Inspiration (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-22

Deep Suno API integration and creative workflow tools.

| Deliverable | Issue | Status |
|:--|:--|:--|
| Instagram feed for inspiration | SUNAA-105 | Done |
| RSS feed integration | SUNAA-106 | Done |
| Auto-prompt generator | SUNAA-107 | Done |
| Settings page overhaul | SUNAA-108 | Done |
| Inspire page | SUNAA-109 | Done |
| Album art gallery view | SUNAA-110 | Done |
| Audio upload + extend | SUNAA-112 | Done |
| Mashup studio | SUNAA-113 | Done |
| Song variations & remix | SUNAA-114 | Done |
| Vocal separation | SUNAA-115 | Done |
| Prompt templates browser | SUNAA-116 | Done |
| Persona manager & style boost | SUNAA-117 | Done |
| Section editor | SUNAA-118 | Done |
| Format conversion (WAV/MIDI/video) | SUNAA-119 | Done |
| Batch operations | SUNAA-120 | Done |
| Mobile UX refinement | SUNAA-121 | Done |
| Enhanced search & discovery | SUNAA-122 | Done |
| Onboarding improvements | SUNAA-123 | Done |
| SSE real-time updates | SUNAA-125 | Done |
| Offline PWA enhancement | SUNAA-126 | Done |

---

### Milestone 4: Production Hardening (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-22

Deployment, CI/CD, and infrastructure readiness.

| Deliverable | Issue | Status |
|:--|:--|:--|
| Railway deployment | SUNAA-70, SUNAA-97 | Done |
| GitHub repo setup | SUNAA-77 | Done |
| CI pipeline (lint + test) | SUNAA-141, SUNAA-142, SUNAA-143, SUNAA-144 | Done |
| Migration fixes | SUNAA-152 | Done |
| Entry page stability | SUNAA-148, SUNAA-155, SUNAA-196 | Done |
| Secrets scanner | SUNAA-99 | Done |
| Env validation | SUNAA-103 | Done |
| Request timeouts | SUNAA-101 | Done |
| Race condition fix (rate limit) | SUNAA-102 | Done |
| E2E tests in CI | SUNAA-156 | Done |

---

### Milestone 5: Enhancement Sprint — Phase 1 & 2 (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-23
**Parent issue:** SUNAA-172

Security, real-time foundation, and core feature gaps.

| Deliverable | Issue | Status |
|:--|:--|:--|
| Security headers (CSP, X-Frame-Options) | SUNAA-173 | Done |
| Health check endpoint + Dockerfile HEALTHCHECK | SUNAA-174 | Done |
| SSE for generation (replace polling) | SUNAA-175 | Done |
| Google OAuth completion | SUNAA-176 | Done |
| Generation queue | SUNAA-170 | Done |
| Public song discovery | SUNAA-169 | Done |
| Playlist sharing & embed widget | SUNAA-124 | Done |
| Desktop layout polish (sidebar, multi-col, shortcuts) | SUNAA-178 | Done |
| API error handling overhaul | SUNAA-190 | Done |
| Alternate generation & variation tracking | SUNAA-165, SUNAA-166, SUNAA-167 | Done |
| Credit tracking & low-credit warnings | SUNAA-168 | Done |
| Performance audit (Lighthouse, Core Web Vitals) | SUNAA-182 | Done |
| Unit test coverage expansion (78%+) | SUNAA-179 | Done |
| Lyrics generation (API + UI + fix) | SUNAA-138, SUNAA-139, SUNAA-140, SUNAA-197 | Done |
| Per-song action menu (archive/delete) | SUNAA-198 | Done |

---

### Milestone 6: Enhancement Sprint — Phase 3 (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-24
**Parent issue:** SUNAA-172

Quality, performance, and remaining core gaps.

| Deliverable | Issue | Status | Priority |
|:--|:--|:--|:--|
| Full-text search (PostgreSQL tsvector + GIN) | SUNAA-180 | Done | Medium |
| API response caching (stale-while-revalidate, ETag) | SUNAA-181 | Done | Medium |
| Accessibility audit (WCAG AA) | SUNAA-183 | Done | Medium |
| Library data export (CSV/JSON) | SUNAA-171 | Done | Low |

---

### Milestone 7: Suno Account Integration (COMPLETE)

**Status:** Done
**Delivered:** 2026-03-24
**Parent issue:** SUNAA-191

Connect directly to suno.com accounts to browse and import existing songs.

| Deliverable | Issue | Status | Priority |
|:--|:--|:--|:--|
| Connect suno.com account | SUNAA-191 | Done | Medium |
| API: List remote Suno songs with pagination | SUNAA-192 | Done | High |
| API: Import selected Suno songs into local library | SUNAA-193 | Done | High |
| UI: Suno library browser and import flow | SUNAA-194 | Done | High |
| Suno connection verification & credit display | SUNAA-195 | Done | Medium |

---

### Milestone 8: Production Hardening (IN PROGRESS)

**Status:** Active
**Target:** 2026-03-31

Security audits, performance optimization, and production-readiness work.

| Deliverable | Issue | Status | Priority |
|:--|:--|:--|:--|
| API route authentication coverage audit | SUNAA-217 | In Progress | Critical |
| Input validation, CSRF, rate limiting review | SUNAA-218 | Todo | Critical |
| Production environment config (env vars, secrets, migrations) | SUNAA-216 | Todo | Critical |
| Critical path test coverage (auth, generation, credits) | SUNAA-219 | Todo | High |
| Database & API performance optimization | SUNAA-220 | Todo | High |
| Frontend bundle & asset optimization | SUNAA-221 | Todo | High |
| Monitoring & observability (Sentry, structured logging) | SUNAA-222 | Todo | Medium |

---

### Milestone 9: Growth & Scale (PLANNED)

**Status:** Backlog
**Target:** TBD

Features for internationalization, social engagement, and operational maturity.

| Deliverable | Issue | Status | Priority |
|:--|:--|:--|:--|
| Internationalization (i18n) — next-intl | SUNAA-184 | Backlog | Low |
| Social features — comments, follows, activity feed | SUNAA-185 | Backlog | Low |
| Song recommendations — similar, 'also liked', daily mix | SUNAA-186 | Backlog | Low |
| CDN for audio assets | SUNAA-188 | Backlog | Low |
| API versioning (/api/v1/) | SUNAA-189 | Backlog | Low |

---

## Tech Stack

| Layer | Technology | Version |
|:--|:--|:--|
| Language | TypeScript | 5.9 |
| Framework | Next.js (App Router) | 14.2 |
| Database | PostgreSQL + Prisma ORM | 5.22 |
| Auth | NextAuth.js v5 (JWT) | 5.0-beta |
| Styling | Tailwind CSS | 3.4 |
| Audio | WaveSurfer.js | 7.12 |
| Charts | Recharts | 3.8 |
| AI/LLM | OpenAI SDK | 6.32 |
| Music API | sunoapi.org | — |
| Email | Mailjet | 6.0 |
| Testing | Vitest + Playwright | 3.2 / 1.58 |
| Hosting | Railway (Docker) | — |
| CI/CD | GitHub Actions + Husky | — |

## Team

| Role | Agent | Status |
|:--|:--|:--|
| CEO | ceo | Active |
| PM | pm | Active |
| Engineer | engineer | Active (SUNAA-217) |

## Key Metrics

- **Total issues delivered:** 209+
- **Test coverage:** 78%+ on critical paths
- **E2E test suites:** 8 test files (1,643 lines)
- **API routes:** 95 endpoints
- **Components:** 48+ React components
- **Database models:** 20+ Prisma models

## Prioritization Framework

- **P0 / Critical** — Blocking other work or critical path. Do immediately.
- **P1 / High** — Important for current milestone. Do next.
- **P2 / Medium** — Valuable but not urgent. Do when capacity allows.
- **P3 / Low** — Nice to have. Backlog buffer.

## Decision Log

| Date | Decision | Rationale |
|:--|:--|:--|
| 2026-03-20 | Next.js 14 + Prisma + PostgreSQL | Full-stack TypeScript, fast iteration, Railway-ready |
| 2026-03-21 | Mobile-first design | Primary use case is quick music generation on the go |
| 2026-03-22 | Railway for hosting | Simple Docker deploy, built-in PostgreSQL, auto-SSL |
| 2026-03-23 | 4-phase enhancement plan | Systematic improvement covering security → features → quality → growth |
| 2026-03-23 | Suno account integration | Users want to import their existing Suno library, not start fresh |
| 2026-03-24 | Phase 3 + Suno integration as parallel milestones | Quality work and Suno import are independent tracks |
| 2026-03-24 | Milestones 6+7 complete, Milestone 8 = Production Hardening | Security, perf, and monitoring before v1.0 launch |
| 2026-05-15 | Error backend = self-hosted GlitchTip, not Sentry SaaS | Sentry-protocol-compatible for error + performance envelopes. Replay envelopes rejected — `replayIntegration()` removed from `sentry.client.config.ts`. Trace sampling kept at 10%. DSN-driven; CSP origin derived from `NEXT_PUBLIC_SENTRY_DSN` so the ingest host stays out of source. |
| 2026-05-15 | SunoFlow shipped as a Claude Code plugin | Added `.claude-plugin/plugin.json` at repo root; existing `skills/sunoflow/SKILL.md` becomes the bundled skill. Installable via `/plugin install sunoflow@yesterday-public-plugins`. No MCP auto-wired in the plugin (stdio server needs repo checkout + env). |
| 2026-05-15 | SunoFlow listed in Yesterday public plugin marketplace + transitive dep of `personal-agent` bundle | Adds the SunoFlow MCP skill to anyone installing the `personal-agent` agent-core bundle. Update both catalog README and bundle README in same change going forward. |
| 2026-05-15 | GlitchTip MCP integration kept in a private operator plugin | The agent-facing triage skill is bundled in a private operator plugin alongside an auto-starting HTTP MCP server. Not part of the public SunoFlow plugin because it points at an operator-specific GlitchTip instance. |
