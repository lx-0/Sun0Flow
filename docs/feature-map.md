# SunoFlow Feature Map

Last updated: 2026-05-05

This document maps all current product features by domain. For file-level details, see [feature-inventory.md](./feature-inventory.md).

---

## Overview

SunoFlow is an AI music generation platform built on the Suno API. Users generate, manage, discover, and share music. The product supports free and paid tiers, social interactions, and admin tooling.

**Tech stack:** Next.js 15 (App Router) / TypeScript / Prisma + PostgreSQL / Stripe / NextAuth / next-intl

---

## 1. Authentication & Identity

| Capability | Notes |
|------------|-------|
| Email/password registration & login | bcryptjs hashing, email verification required |
| Google OAuth | Optional provider via NextAuth |
| Password reset flow | Email-based token reset |
| JWT sessions | Stateless, no server-side session store |
| Role-based access | Admin role gates admin routes |
| API key auth | Users generate keys for external tool access |

---

## 2. Onboarding

| Capability | Notes |
|------------|-------|
| API key setup wizard | Guides new users through Suno key entry |
| Guided tour | Step-by-step overlay for first-time users |
| First-generation confetti | Celebration on initial song creation |
| Onboarding completion flag | Persisted per-user, skips tour on return |

---

## 3. Song Generation

| Capability | Notes |
|------------|-------|
| Text-to-music generation | Main generation form with style/prompt inputs |
| Generation queue | Ordered queue with position tracking |
| Real-time progress (SSE) | Streaming status updates during generation |
| Batch generation | Generate multiple songs in one request |
| Auto-generate | Pattern-based automatic generation |
| Generation presets | Save and reuse generation configurations |
| Prompt templates | Reusable prompt structures |
| Style templates | Predefined style configurations |
| AI personas | Named generation personalities with style defaults |
| Song extension | Extend existing songs beyond original duration |
| Song variations | Create alternative versions of existing songs |
| Remix/mashup studio | Combine elements from multiple songs |
| Section replacement | Replace specific sections of a song |
| Retry failed generations | Re-attempt failed generation jobs |
| Import from Suno | Pull existing Suno library into SunoFlow |
| Audio file upload | Upload external audio for processing |
| Vocal separation | Split vocals from instrumentals |
| Stem extraction | Isolate individual tracks |
| MIDI generation | Export MIDI from generated songs |
| Cover art generation | AI-generated artwork per song |
| Music video generation | Video generation with status tracking |

---

## 4. Song Management

| Capability | Notes |
|------------|-------|
| Library view (grid/list) | Sortable, filterable song collection |
| Song detail view | Full metadata, lyrics, actions, analytics |
| Edit metadata | Title, tags, description, genre |
| Lyrics editor | Edit/format lyrics with timestamps |
| Lyric annotations | User annotations on specific lyrics |
| Karaoke timestamps | Synchronized lyric display |
| Download (MP3/FLAC/WAV) | Multi-format export |
| Public/private toggle | Per-song visibility control |
| Tagging system | User-defined and suggested tags |
| Song ratings (1-5 stars) | Star-based quality ratings |
| Favorites/likes | Quick-access favorites collection |
| Delete/archive | Remove from library |
| Variant family tracking | Parent-child song relationships |

---

## 5. Audio Playback

| Capability | Notes |
|------------|-------|
| Global persistent player | Stays active across page navigation |
| Waveform visualization | WaveSurfer.js interactive waveform |
| Expanded full-screen player | Immersive playback mode |
| Queue management (Up Next) | Reorderable play queue |
| Shuffle/repeat modes | Standard playback controls |
| Equalizer controls | Audio EQ adjustments |
| Playback state persistence | Resume position across sessions |
| Play history tracking | Timestamped play events |
| Audio caching | Client-side audio pre-caching |
| Stems player | Multi-track playback of separated stems |

---

## 6. Playlists

| Capability | Notes |
|------------|-------|
| Create/edit/delete playlists | Full CRUD with metadata |
| Add/remove/reorder songs | Drag-to-reorder, batch add |
| Public/private visibility | Per-playlist toggle |
| Public share URLs (/p/[slug]) | Shareable playlist links |
| Collaborative playlists | Multi-user editing with roles |
| Playlist invitations (token) | Invite link for collaboration |
| Smart playlists | Auto-updating based on rules (mood, top hits, new this week, similar-to) |
| Embeddable playlist player | iframe embed for external sites |
| Playlist copy/duplicate | Clone playlists |
| Playlist activity log | Track changes and additions |

---

## 7. Discovery & Recommendations

| Capability | Notes |
|------------|-------|
| Discover page | Curated featured content |
| Explore page | Browse all public content |
| Curated collections | Admin-managed themed collections |
| Mood-based radio | Continuous playback by mood/style |
| Embedding-based recommendations | OpenAI vector similarity matching |
| Related songs | Per-song similarity suggestions |
| "Also liked" suggestions | Collaborative filtering |
| Trending songs | Popularity-ranked content |
| Daily recommendations | Personalized daily picks |
| Global search | Full-text across songs, playlists, users |
| Library filters | Genre, mood, date, status filtering |
| Genre/mood browsing | Browse by category |

---

## 8. Social & Community

| Capability | Notes |
|------------|-------|
| Public user profiles (/u/[username]) | Bio, avatar, banner, featured song |
| Follow/unfollow users | Social graph |
| Activity feed | Chronological activity from followed users |
| Timestamped comments | Comments anchored to song time positions |
| Emoji reactions (timestamped) | Reactions at specific playback moments |
| Share buttons | Share to external platforms |
| Embed code generation | iframe snippets for songs/playlists |
| Song comparison tool | Side-by-side song analysis |
| Inspiration gallery | Community-shared prompt inspiration |

---

## 9. Analytics & Insights

| Capability | Notes |
|------------|-------|
| User analytics dashboard | Plays, views, downloads over time |
| Per-song analytics | Individual song performance metrics |
| Play/view/download counts | Event-level tracking |
| Insights digest | AI-generated periodic summaries |
| Inspiration digest | Curated inspiration content |
| Daily active streaks | Streak tracking with milestones |
| Milestone achievements | Unlockable achievements |
| Generation history | Full log of all generation attempts |
| Play history | Chronological listening history |
| Prompt quality metrics | Prompt effectiveness scoring |
| Generation insights | Pattern analysis across generations |
| Peak hours analysis | Usage time-of-day patterns |
| Genre preference tracking | Listening taste analysis |

---

## 10. Billing & Payments

| Capability | Notes |
|------------|-------|
| Subscription tiers | Free / Starter / Pro / Studio |
| Stripe checkout | Payment flow integration |
| Customer portal | Self-service subscription management |
| Credit system | Per-generation credit consumption |
| Credit top-ups | One-time credit purchases |
| Invoice history | Downloadable past invoices |
| Subscription cancel/change | Self-service plan management |
| Low credits notifications | Banner + push when credits run low |
| Upgrade prompts | Contextual upsell modals |

---

## 11. Notifications & Messaging

| Capability | Notes |
|------------|-------|
| In-app notification center | Bell icon with unread count |
| Web push notifications | Browser-level push via VAPID |
| Email notifications | Transactional emails (Mailjet) |
| Email digest (weekly highlights) | Automated weekly summaries |
| Quiet hours | User-configurable DND periods |
| Notification preferences | Per-channel opt-in/out |
| Email unsubscribe | One-click unsubscribe links |

---

## 12. User Settings & Profile

| Capability | Notes |
|------------|-------|
| Profile editing | Bio, avatar, banner image |
| Featured song selection | Pin a song to profile |
| Theme toggle (dark/light) | Persisted preference |
| Language/locale switching | Multi-language UI via next-intl |
| Notification preferences | Granular notification controls |
| Default style preference | Pre-fill generation style |
| Preferred genres | Personalization input |
| Email preferences | Control email frequency |
| Data export (GDPR) | Download all user data |
| Password change | In-app password update |

---

## 13. Admin Panel

| Capability | Notes |
|------------|-------|
| Admin dashboard | Overview metrics and quick actions |
| User management | List, search, edit, enable/disable users |
| Content moderation | Flag/remove content |
| Report management | Review and resolve user reports |
| Appeal handling | Process user ban/moderation appeals |
| Error log viewer | Aggregated client error reports |
| System activity logs | Admin action audit trail |
| System metrics | Server health and performance |
| Admin analytics | Platform-wide usage statistics |
| User credit adjustment | Manual credit grants |
| User plan changes | Manual tier overrides |
| Feed generation approval | Approve content for public feed |
| Mirror health monitoring | Backup/mirror status |

---

## 14. Content Safety & Moderation

| Capability | Notes |
|------------|-------|
| Report songs/playlists | User-initiated content reports |
| Appeal system | Users can appeal moderation actions |
| Content flagging (admin) | Admin content review workflow |
| User feedback collection | In-app feedback widget |
| Client error reporting | Automatic error capture |

---

## 15. Platform & Infrastructure

| Capability | Notes |
|------------|-------|
| PWA support | Install prompt, offline capable |
| Service worker | Background sync, offline caching |
| Offline mode (IndexedDB) | Queue actions for later sync |
| Pull-to-refresh | Mobile-native interaction |
| Feature flags/gates | Gradual rollout control |
| i18n / multi-language | Full UI localization |
| Open Graph metadata | Social sharing previews |
| RSS feed output | Subscribe to user/playlist updates |
| API documentation (Swagger) | Interactive API docs page |
| OpenAPI spec | Machine-readable API definition |
| Health check endpoint | Uptime monitoring target |
| Prometheus metrics | Infrastructure observability |
| Rate limiting | Per-IP and per-user throttling |
| Circuit breaker | Suno API failure isolation |
| Structured logging (Pino) | JSON log output |
| Sentry error tracking | Real-time error alerting |
| PostHog product analytics | Event tracking and funnels |
| Keyboard shortcuts | Power-user keyboard navigation |
| Correlation IDs | Request tracing across services |
| CORS configuration | Configurable cross-origin access |
| Body size limiting | 1MB max request payload |
| Cache warming | Pre-load frequently accessed data |
| LRU caching | In-memory hot data cache |
| Background jobs (node-cron) | Scheduled tasks (feed gen, smart playlist refresh, embeddings) |
| MCP agent integration | External agent tool access |

---

## 16. External Integrations

| Service | Purpose |
|---------|---------|
| Suno API (sunoapi.org) | Song generation, lyrics, personas, uploads |
| Stripe | Payments, subscriptions, credits |
| Google OAuth | Social login |
| Mailjet | Transactional and digest emails |
| OpenAI | Text embeddings for similarity/recommendations |
| Web Push API | Browser push notifications |
| Sentry | Error monitoring and alerting |
| PostHog | Product analytics and feature flags |
| Instagram | Content sharing integration |

---

## 17. Public/Embed Surfaces

| Surface | URL Pattern | Notes |
|---------|-------------|-------|
| Public song page | /s/[slug] | Shareable song with player |
| Public playlist page | /p/[slug] | Shareable playlist |
| Public user profile | /u/[username] | User portfolio page |
| Embeddable song player | /embed/[songId] | iframe widget |
| Embeddable playlist player | /embed/playlist/[slug] | iframe widget |
| RSS feeds | /api/rss/feeds/[id] | Syndication |
| OpenAPI spec | /api/v1/openapi.json | API documentation |
| OG image generation | /api/og/song/[songId] | Social preview cards |

---

## Data Model Summary

**47 database models** covering: users & auth, songs & generation, playlists, social interactions, billing & credits, notifications, analytics events, content moderation, and system operations.

---

## Feature Counts by Domain

| Domain | Features |
|--------|----------|
| Song Generation | 21 |
| Song Management | 13 |
| Audio Playback | 10 |
| Playlists | 10 |
| Discovery & Recommendations | 12 |
| Social & Community | 9 |
| Analytics & Insights | 13 |
| Billing & Payments | 9 |
| Notifications | 7 |
| User Settings | 10 |
| Admin Panel | 13 |
| Content Safety | 5 |
| Platform & Infrastructure | 25 |
| External Integrations | 9 |
| Public Surfaces | 8 |
| **Total** | **~174** |
