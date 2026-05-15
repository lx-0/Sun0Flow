# SunoFlow Feature Map

A different cut than [`docs/feature-inventory.md`](../docs/feature-inventory.md). The inventory is a flat list ("what features exist + which files"). This map is a **shape-of-the-system** view: bounded contexts, data flows, hot-spots, where complexity lives.

Generated 2026-05-15 from a cold read of the codebase (no domain priors).

---

## 1. The 30-second mental model

```
                                ┌──────────────────────────┐
                                │       External world       │
                                │ Suno API · OpenAI · Stripe │
                                │  Mailjet · Google OAuth    │
                                │   Sentry · PostHog · RSS   │
                                └────────────┬─────────────┘
                                             │
   ┌─────────────────────────────────────────┼─────────────────────────────────────────┐
   │                                  Edge / middleware                                │
   │   src/middleware.ts  ─  next-intl locale, NextAuth JWT, CORS, rate-limit,        │
   │                          security headers, correlation-id                         │
   └─────────────────────────────────────────┬─────────────────────────────────────────┘
                                             │
            ┌────────────────────────────────┼────────────────────────────────┐
            │                                │                                │
            ▼                                ▼                                ▼
  ┌──────────────────┐            ┌──────────────────┐            ┌──────────────────────┐
  │  Pages (App/RSC) │            │  API routes      │            │  Cron / webhooks     │
  │  src/app/[locale]│            │  src/app/api/*   │            │  api/cron, webhooks  │
  └────────┬─────────┘            └────────┬─────────┘            └──────────┬───────────┘
           │                               │                                  │
           └─────────────┬─────────────────┴──────────────────┬───────────────┘
                         │                                    │
                         ▼                                    ▼
              ┌────────────────────┐                ┌─────────────────────┐
              │  Domain libs       │                │  Generation pipeline │
              │  src/lib/*         │  ◄──events──   │  src/lib/generation │
              │  (per bounded ctx) │                │  + sunoapi client    │
              └─────────┬──────────┘                └──────────┬──────────┘
                        │                                       │
                        └─────────────────┬─────────────────────┘
                                          ▼
                              ┌────────────────────────┐
                              │  Prisma / PostgreSQL   │
                              │  51 models             │
                              └────────────────────────┘
```

51 Prisma models. ~80 route groups. ~80 lib modules. ~107 React components. The size signals: this is a small monolith pretending to be a startup product — most domains are present but thin.

---

## 2. Bounded contexts (the 10 chunks of the system)

| # | Context | Purpose | Key models | Key API mount | Key libs | Key UI |
|---|---|---|---|---|---|---|
| 1 | **Identity** | login, OAuth, sessions, registration, password reset | `User` `Account` `Session` `VerificationToken` `ApiKey` | `api/auth` `api/register` `api/account` | `lib/auth/*` `lib/api-keys.ts` | `[locale]/login` `register` `reset-password` `verify-email` |
| 2 | **Billing & credits** | Stripe checkout, subscriptions, credit accounting | `Subscription` `PaymentEvent` `CreditUsage` `CreditTopUp` | `api/billing` `api/webhooks/stripe` | `lib/billing/*` `lib/credits` `lib/stripe.ts` | `[locale]/pricing` `settings` |
| 3 | **Generation** ★ | Prompt → Suno API → queued job → song. Heart of the app. | `Song` `GenerationQueueItem` `GenerationAttempt` `GenerationPreset` `GenerationFeedback` | `api/generate` `api/generation-queue` `api/generations` `api/webhooks/suno` | `lib/generation/*` `lib/sunoapi/*` | `[locale]/generate` `GenerateForm` |
| 4 | **Library** | Songs, playlists, favorites, tags, history, collections | `Song` `Playlist` `PlaylistSong` `PlaylistCollaborator` `Favorite` `Tag` `SongTag` `Collection` `CollectionSong` | `api/songs` `api/playlists` `api/collections` `api/history` `api/tags` | `lib/songs` `lib/playlists` `lib/smart-playlists` `lib/collections` | `[locale]/library` `playlists` `favorites` `history` |
| 5 | **Playback** | Global player, queue, waveform, lyrics, persisted state | `PlaybackState` `PlayHistory` `PlayEvent` `LyricTimestamp` `LyricAnnotation` | `api/audio/[songId]` | `lib/audio/*` (Web Worker peaks) `lib/lyrics` | `GlobalPlayer` `QueueContext` `WaveformPlayer` `ExpandedPlayer` |
| 6 | **Authoring helpers** | Personas, prompt templates, style templates, lyrics tools | `Persona` `PromptTemplate` `StyleTemplate` | `api/personas` `api/prompt-templates` `api/style-templates` `api/lyrics` `api/style-boost` | `lib/personas` `lib/prompt-templates` `lib/style-templates` `lib/lyrics` `lib/llm.ts` `lib/openai-client.ts` | `[locale]/personas` `templates` `style-templates` `inspire` |
| 7 | **Discovery & social** | Public sharing, ratings, reactions, comments, follows, feed | `Follow` `Rating` `SongReaction` `Comment` `SongView` `UserFeedback` | `api/feed` `api/discover` `api/explore` `api/ratings` `api/feedback` `api/u/[handle]` | `lib/discovery` `lib/reactions` `lib/ratings.ts` `lib/comments` | `[locale]/discover` `explore` `feed` `radio` `users` · public `/s/[slug]` `/p/[slug]` `/u/[handle]` |
| 8 | **Engagement loops** | Streaks, milestones, push, email digests, RSS auto-gen | `UserStreak` `UserMilestone` `Notification` `PushSubscription` `RssFeedSubscription` `PendingFeedGeneration` `InspirationDigest` | `api/streaks` `api/milestones` `api/notifications` `api/push` `api/rss` `api/cron/feed-auto-generate` `api/digests` | `lib/streaks` `lib/notifications` `lib/push.ts` `lib/digest` `lib/rss` `lib/jobs/email-digest.ts` | `[locale]/notifications` `stats` `insights` |
| 9 | **Search & recommendations** | Tag search, embeddings, smart playlists, suggestions | `SongEmbedding` | `api/search` `api/recommendations` `api/smart-playlists` `api/suggestions` `api/cron/generate-embeddings` `api/cron/refresh-smart-playlists` | `lib/embeddings` `lib/search` `lib/recommendations` `lib/suggestions` `lib/smart-playlists` | woven into Library/Discover |
| 10 | **Trust & ops** | Admin, moderation, reports/appeals, error reporting, rate-limit, analytics, exports | `AdminLog` `Report` `Appeal` `ErrorReport` `RateLimitEntry` `AnonRateLimitEntry` `Activity` | `api/admin` `api/reports` `api/appeals` `api/error-report` `api/rate-limit` `api/analytics` `api/export` `api/health` `api/metrics` | `lib/admin` `lib/moderation` `lib/rate-limit/sliding-window` `lib/analytics.ts` `lib/data-export` `lib/error-logger.ts` `lib/circuit-breaker.ts` | `[locale]/admin` |

★ = the load-bearing context. Every other context exists to feed or consume what context 3 produces.

---

## 3. The generation pipeline (the load-bearing flow)

This is the one flow worth knowing by heart.

```
  User clicks "Generate" in GenerateForm
            │
            ▼
  POST /api/generate              ← src/app/api/generate/route.ts (42 commits — hot)
            │
            ├─ runRoutePipeline (Zod schemas, auth, rate-limit, correlation-id)
            │     src/lib/route-pipeline.ts
            │
            ├─ lib/generation/request.ts → normalise + validate user prompt/persona/preset
            ├─ lib/generation/params.ts  → resolve generation parameters (model, style)
            ├─ lib/generation/guards.ts  → credit check, quota, moderation gate
            │
            ▼
  lib/sunoapi/create.ts            ← POST to sunoapi.org
            │   (errors → lib/sunoapi/errors.ts → lib/circuit-breaker.ts)
            │
            ▼
  GenerationQueueItem row + Song row(s) inserted (status=pending)
            │
            ├─ CreditUsage row (debit)
            ├─ Activity row (audit)
            └─ event-bus emits "generation.requested"
            ▼
  client polls GET /api/songs/[id]/status   ← src/app/api/songs/[id]/status/route.ts (28 commits — hot)
            │
            │   Meanwhile, async path:
            │   ┌──────────────────────────────────────────────────┐
            │   │  Suno webhook POST /api/webhooks/suno           │
            │   │   → lib/generation/completion.ts                 │
            │   │   → lib/generation/song-completion.ts            │
            │   │   → Song row updated (status=complete, audioUrl) │
            │   │   → cover-art-generator.ts (optional)            │
            │   │   → embeddings job enqueued                      │
            │   │   → notification fired                            │
            │   └──────────────────────────────────────────────────┘
            ▼
  Song appears in library, playable via GlobalPlayer
```

### Hot files in this flow

| File | Commits (since 2026-01-01) | Why it churns |
|---|---|---|
| `prisma/schema.prisma` | 84 | Every new feature touches the data model |
| `src/components/LibraryView.tsx` | 68 | Library is the daily-use surface |
| `src/components/AppShell.tsx` | 60 | Navigation/layout sink |
| `src/components/SongDetailView.tsx` | 56 | Every per-song feature lands here |
| `src/components/GenerateForm.tsx` | 42 | Every generation parameter or persona flag adds UI |
| `src/app/api/generate/route.ts` | 42 | Mirror image of GenerateForm |
| `src/components/GlobalPlayer.tsx` | 38 | Playback is hard, lots of fixes |
| `src/app/s/[slug]/PublicSongView.tsx` | 37 | Public sharing surface |
| `src/middleware.ts` | 30 | Auth + locale + rate-limit + CORS all live here |
| `src/components/QueueContext.tsx` | 28 | Player queue state |
| `src/app/api/songs/[id]/status/route.ts` | 28 | The polling endpoint |
| `src/lib/generation/index.ts` | 22 | Pipeline glue |

**Translation:** four files (`schema.prisma`, `LibraryView`, `AppShell`, `SongDetailView`) absorb >250 commits between them. They are the codebase's [god objects](https://en.wikipedia.org/wiki/God_object) — friction points for any larger refactor, but also where most product value lives.

---

## 4. Playback pipeline (the second-most-important flow)

```
  Song row             AudioCDN (lib/audio-cdn.ts)
       │                     │
       │  signed URL request │
       └──────────┬──────────┘
                  ▼
  GET /api/audio/[songId]    ← signed-URL issuance (16 commits — hot)
                  │
                  ▼
       <audio> element in GlobalPlayer.tsx
                  │
                  ├─ load-generation token guards async races (commit 7511d20)
                  ├─ peaks rendered in WaveformPlayer
                  │     ▲
                  │     │ peak math runs in Web Worker
                  │     └── src/lib/audio/peaks-worker.ts (commit 45023a6)
                  │
                  └─ PlayEvent + PlayHistory recorded
                        │
                        └─ feeds: streaks, recommendations, embeddings,
                                  smart playlists, analytics
```

---

## 5. Cross-cutting concerns

These are not features — they're properties of every request.

| Concern | Where it lives | Reads / writes |
|---|---|---|
| **Locale routing** | `src/middleware.ts` + `src/i18n/routing.ts` | `[locale]` segment is mandatory on all pages |
| **Auth** | `src/lib/auth/*`, NextAuth JWT, `src/middleware.ts` | `Account` `Session` `User` |
| **Rate limiting** | `src/lib/rate-limit/sliding-window` (used in `middleware.ts`) | `RateLimitEntry` `AnonRateLimitEntry` |
| **API key auth** (programmatic) | `src/lib/api-key-auth.ts` | `ApiKey` |
| **Request envelope** | `src/lib/route-handler.ts` + `src/lib/route-pipeline.ts` | every `api/*` route |
| **Logging** | `src/lib/logger.ts` (Pino) + correlation-id from middleware | structured JSON, picked up by Pino |
| **Errors** | `src/lib/error-logger.ts` → Sentry; `src/lib/api-error.ts` (Result types) | `ErrorReport` for user-reported, Sentry for server-side |
| **Observability** | `src/instrumentation.ts` + Sentry server runtime + `onRequestError` | wired 2026-05-15 (commit fbae46a) |
| **Analytics** | `src/lib/analytics.ts` + PostHog (deferred via `requestIdleCallback`, commit c66bc2f) | client-side events |
| **Event bus** | `src/lib/event-bus.ts` | internal pub/sub between contexts |
| **Background jobs** | `src/lib/jobs/`, `src/app/api/cron/*`, `src/lib/scheduler.ts` | digests, embeddings, smart-playlist refresh, feed auto-gen |
| **Circuit breaker** | `src/lib/circuit-breaker.ts` | wraps external API calls (Suno) |
| **Cache** | `src/lib/cache/*` | per-request memoization + Redis-shaped TTL cache |
| **Sanitisation** | `src/lib/sanitize.ts` | user-generated content (lyrics, descriptions, comments) |
| **OpenAPI** | `src/lib/openapi*.ts` → `/api/docs` (Swagger UI) | every route declares schema |
| **Realtime** | `src/lib/realtime` | SSE/WS for generation-status push |

---

## 6. External-facing surface

URLs the outside world can hit (no auth, or shared with non-users):

| Path | Purpose | Source |
|---|---|---|
| `/s/[slug]` | Public song page | `src/app/s/[slug]/page.tsx` (20 commits) |
| `/p/[slug]` | Public playlist page | `src/app/p/[slug]/` |
| `/u/[handle]` | Public user profile | `src/app/u/[handle]/` |
| `/embed/*` | Embeddable player widgets | `src/app/embed/` |
| `/api/docs` | Swagger UI | route + `openapi*.ts` |
| `/api/health` | Liveness probe | for Railway healthchecks |
| `/api/rss/*` | RSS feeds | tied to `RssFeedSubscription` |
| `/api/webhooks/stripe` | Stripe callbacks | `api/webhooks/stripe` |
| `/api/webhooks/suno` | Suno completion callbacks | `api/webhooks/suno` |
| `/api/v1/*` | Programmatic API (key auth) | `src/app/api/v1/` |

---

## 7. Where the gnarly stuff lives

Files / modules that punch above their LOC weight — disproportionate complexity or bug surface. Read with care, change with tests.

| Place | Why it's gnarly |
|---|---|
| `src/lib/generation/*` | 15 files coordinating Zod parsing, credit gates, moderation, Suno API call, fallback, attempt tracking, and webhook completion. The whole product hinges on this not breaking. |
| `src/components/GlobalPlayer.tsx` + `QueueContext.tsx` | Async audio + queue + shuffle/repeat + persisted state + visualisations. Race conditions historically frequent (commit 7511d20). |
| `src/middleware.ts` | One file that does locale, auth, rate-limit, CORS, security headers, body-size caps, correlation-id. 30 commits since Jan 2026 — every cross-cutting fix lands here. |
| `prisma/schema.prisma` | 51 models, single file. 84 commits. Any structural change touches generation, library, playback, billing simultaneously. |
| `src/lib/sunoapi/*` | External-API client with mock mode for tests. The "errors.ts + circuit-breaker + retries" combo is non-trivial. |
| `src/lib/route-pipeline.ts` | The generic API envelope (Zod schemas, auth, params, response). Every route goes through it — a bug here has 80x blast radius. |
| `src/components/LibraryView.tsx` | 68 commits. Pagination + filter + sort + selection + bulk-ops + virtualised grid. |
| `src/lib/audio/peaks-worker.ts` | Web Worker boundary. Postmessage protocol must stay backwards-compatible with `peaks.ts` callers. |

---

## 8. Where new features tend to land

Empirical "if you add X, you'll edit Y" patterns from the churn data:

- **New generation parameter** → `GenerateForm.tsx` + `lib/generation/params.ts` + `api/generate/route.ts` + `schema.prisma` (always 4 files)
- **New per-song action** → `SongDetailView.tsx` + matching API route under `api/songs/[id]/*`
- **New library filter/view** → `LibraryView.tsx` + `lib/songs` query helper
- **New playable surface** → touch `GlobalPlayer.tsx` and `QueueContext.tsx` together; never one without the other
- **New external integration** → new lib under `src/lib/<provider>/` + webhook route under `api/webhooks/<provider>`
- **New scheduled job** → new file in `src/lib/jobs/` + route under `api/cron/<name>` + registration in `lib/scheduler.ts`

---

## 9. What's notably absent (or thin)

- **No GraphQL.** REST throughout.
- **No state-management library on the client.** React Context (`QueueContext`, `AudioEQContext`, …) only.
- **No background-job framework.** Cron routes triggered by external scheduler (Railway cron / GitHub Actions); jobs run inside Next.js process.
- **No CHANGELOG.md** at repo root — version history lives in git tags + the deploy workflow.
- **No `docs/adr/`** — decisions get captured ad-hoc in commit messages and now in `.ytstack/DECISIONS.md`.
- **No multi-tenancy.** `User` is the only tenant boundary.

---

## 10. Read-order recommendation for new agents

If you only have 30 minutes:

1. `prisma/schema.prisma` — the canonical domain model (skim, don't read)
2. `src/middleware.ts` — the request envelope at the edge
3. `src/lib/route-pipeline.ts` — the API envelope inside the app
4. `src/lib/generation/index.ts` + `src/lib/generation/request.ts` — the heart
5. `src/components/GenerateForm.tsx` + `src/app/api/generate/route.ts` — the canonical request/response pair
6. `src/components/GlobalPlayer.tsx` — the most complex client-side component
7. `docs/feature-inventory.md` — to find anything not covered above

After that, every other file should be findable from the bounded-context table in §2.
