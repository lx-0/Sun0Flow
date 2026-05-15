# SunoFlow Product Roadmap

> Last updated: 2026-05-15
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
| 2026-05-15 | Admin grant via `ADMIN_EMAILS` env var, OR-merged with DB `User.isAdmin` | Removes hardcoded operator emails from migrations + scripts (public-repo hygiene). Bootstraps operator access on fresh DBs without touching the `User` table. Comma-separated, case-insensitive. Helper in `src/lib/auth/admin.ts`; OR-merged in both the NextAuth jwt callback (`src/lib/auth/session.ts`) AND `requireAdmin()` (`src/lib/auth/index.ts`) — both paths must check, otherwise the env grant works for JWT-derived UI guards but not for `adminRoute()`-protected APIs. |
| 2026-05-15 | Dockerfile declares `ARG NEXT_PUBLIC_*` for build-time inlining | Next.js inlines `NEXT_PUBLIC_*` into the client bundle AND bakes `headers()` results into the routes manifest at build time. Railway forwards service env vars to Dockerfile `RUN` only when the Dockerfile declares them as `ARG`. Without this, the Sentry DSN was empty at build, the CSP was missing the GlitchTip origin, and client envelopes were CSP-blocked. |
| 2026-05-15 | Active-user metrics use `Activity` ∪ `PlayHistory`, not `User.lastLoginAt` | NextAuth `session.strategy="jwt"` writes `lastLoginAt` only on fresh sign-in. With the default 30d JWT TTL, an active user with a valid token appears inactive for up to a month. New helper `src/lib/active-users` UNIONs `Activity.createdAt` and `PlayHistory.playedAt`; admin metrics, analytics dashboard, hourly snapshot, and email-digest targeting all switched. `User.lastLoginAt` retained as "last sign-in" for display. |
| 2026-05-15 | Streak triggers fire on play and favorite, not only generation | `recordDailyActivity` was only called from `song-completion` so the streak counter froze when users were listening but not creating. Added triggers (with `checkStreakMilestones`) to `lib/history` (PlayHistory write) and `lib/songs/favorites` (addFavorite). Profile UI label "X days" now matches user expectation. |
| 2026-05-15 | Failed Songs are auto-archived at every failure write site | `archivedAt = now()` set in `markSongFailed`, `createSongRecord("failed")`, `cleanupStalePending`, and the two stream/status routes that mark orphaned songs failed. `markSongFailed` preserves any earlier user-set `archivedAt`. One-time backfill ran for 13 pre-existing rows across 3 users. Library listings stay clean. |
| 2026-05-15 | Daily `rate-limit-cleanup` job, `generate` action excluded | `RateLimitEntry` had no cleanup; only the read path filtered by 1h window so rows accumulated forever. Daily 02:30 UTC job deletes entries older than 7d. `generate` action skipped because `/api/dashboard/usage` reads it as a lifetime/30d generation history. Also cleans `AnonRateLimitEntry`. |
| 2026-05-15 | TanStack Query for all client list-views | Replaces 6+ hand-rolled `fetch + setState` sites in `LibraryView`, `HistoryView`, `RecentlyPlayed`, `useCredits` with `useInfiniteQuery` / `useQuery` behind `useSongsList`, `useTagsList`, `useRecentlyPlayed`. Mobile-first defaults: `staleTime 30s`, `gcTime 5min`, `networkMode "offlineFirst"`, retry skips 4xx. Eliminates stale-fetch-overwrites-fresh races on slow mobile networks; pending-poll lives behind `refetchInterval` only while pages contain pending songs. Optimistic mutations stay in local component state for now (cache reshape deferred). |
| 2026-05-15 | Singleton generation tracker, visibility-aware per-song SSE | `useGenerationPoller` is a thin React subscribe wrapper over module-level state in `src/lib/realtime/generation-tracker.ts` (mirrors `events-stream.ts`). Tracking survives component remounts (navigating away from `GenerateForm` no longer drops in-flight song tracking), per-song EventSources close on `visibilitychange=hidden` and reopen on resume, and duplicate songIds across components share one connection. Server-side per-job stream still drives `pollToCompletion` — preserves Suno-polling fallback. |
| 2026-05-15 | Waveform peak math runs in a Web Worker | `src/lib/audio/peaks.ts` + `peaks-worker.ts` extract decode + reduction loop from `PlayerWaveform.tsx`. Decode stays main-thread (browser-internal off-thread), but the O(samples) for-loop iterating ~8M Float32s now transfers (not copies) the channel buffer to a worker. LRU cache (50 entries) + per-songId in-flight map. Cover swipe on mobile no longer stalls UI 100–500ms per song. |
| 2026-05-15 | Load-generation token guards five async audio paths in `QueueContext` | `loadGenerationRef` increments on every transition that loads a new src. `playable-versions` fetch, deferred `canplay` fallback, CDN-error refresh fetch, `radioRefill` `fetchRadioSongs`, and `loadPlaybackState` restore + its position-seek `canplay` handler all capture the generation at dispatch and bail on resolve if it changed. Eliminates "song flips back to previous" and "playback rewinds to stale position" symptoms on slow mobile networks. |
| 2026-05-15 | PostHog analytics init deferred to `requestIdleCallback` | `pageView` / `track` are no-ops until `initAnalytics()` resolves, so the only observable change is that the very first page view fires a couple hundred ms later. Reclaims first-interactive-paint time on 3G. Safari fallback to `setTimeout(..., 1)`; 4s timeout ensures init eventually runs. |
| 2026-05-15 | `instrumentation.ts` initializes Sentry per runtime + exports `onRequestError` | `@sentry/nextjs` 10+ no longer auto-runs `sentry.{server,edge}.config.ts`. Without an explicit `await import` per `NEXT_RUNTIME` they never executed and 100% of server-side errors silently bypassed Sentry/GlitchTip. Next.js 15's `onRequestError` re-export wires RSC + Route Handler errors. `logServerError` now mirrors every entry into `Sentry.captureException` with tags + extras matching its pino entry — fixes the ~50 API routes whose structured error path was previously invisible to tracking. |
| 2026-05-15 | Service worker cache namespaces are per-deploy via `?v=<commit-sha>` | `ServiceWorkerRegistrar` registers `/sw.js?v=${NEXT_PUBLIC_BUILD_ID}`. Browser treats each unique URL as a new SW → install → activate → keepCaches drops every prior namespace. Replaces manual `sunoflow-static-v1`/`v2`/… bumps that nobody remembered. SW reads `self.location.search` for the version. `AUDIO_CACHE` stays stable across deploys (it holds user-saved offline songs, not deploy-coupled bundles). |
| 2026-05-15 | Smarter SW update UX: periodic check + safe auto-reload countdown | `setInterval(registration.update(), 60_000)` catches deploys for long-running PWA sessions without waiting for the browser's 24h background recheck. On `controllerchange`: if audio is playing, show non-dismissive banner (reload would interrupt music); otherwise countdown 5s and auto-reload with cancel button. No more stranded users on week-old bundles. |
| 2026-05-15 | `NEXT_PUBLIC_BUILD_ID` and `SENTRY_RELEASE` set explicitly in deploy workflow | `railway up` uploads a tarball, so Railway never auto-populates `RAILWAY_GIT_COMMIT_SHA`. Both vars are now `railway variable set` from `${{ inputs.sha \|\| github.sha }}` with `--skip-deploys` before `railway up`. Dockerfile declares matching `ARG` + `ENV` so the build container sees them. Side-effect fix: Sentry releases were never commit-tagged before, breaking source-map issue grouping. |
