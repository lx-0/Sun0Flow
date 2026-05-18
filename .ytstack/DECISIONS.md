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

## 2026-05-15: Active-user signal sourced from `Activity ∪ PlayHistory`, not `User.lastLoginAt`

**Context:** Single-user audit (alex) revealed that `lastLoginAt` was 20 days stale despite continuous activity. NextAuth `session.strategy="jwt"` only writes `lastLoginAt` on a fresh sign-in (Credentials `authorize()` or OAuth-first-use branch of the `jwt` callback). With the default 30d JWT TTL, `activeUsers7d/30d` admin metrics, the analytics dashboard daily-active series, the hourly snapshot job, and the weekly email-digest targeting all systematically undercount reality.
**Options considered:**
A) Throttled `lastLoginAt` write in the `jwt` callback on every authenticated request (rewrites semantics, every API call potentially does a DB write).
B) New `lastSeenAt` field updated by JWT throttle (cleanest separation, requires migration + backfill).
C) Switch metric/targeting queries to a UNION over `Activity.createdAt` and `PlayHistory.playedAt` (no schema change, no extra writes).
**Chose:** C
**Reason:** No migration, no per-request write, and the union covers the real "did anything" surface (create/favorite/playlist via Activity + listening via PlayHistory). `lastLoginAt` retains its honest "last sign-in" semantic for display in admin/profile UI. Helper at `src/lib/active-users/index.ts` (`countActiveUsers`, `listActiveUserIds`, `dailyActiveUserCounts`). Five sites switched: `admin/metrics`, `admin/stats`, `analytics-data/admin-dashboard`, `jobs/index` (hourly snapshot), `jobs/email-digest`. Tested in `index.test.ts`.
**Reference:** Commits `ab1fa19`, `d31671c`, `23116cc`. Audit conversation: see `.ytstack/STATE.md` for the broader 4-bug cluster discovered in the same session (streak-trigger gap, failed-song archival, RateLimitEntry cleanup).

## 2026-05-18: FEATURE-MAP §2 als Source-of-Truth fuer Heimat-Zuweisungen (M001-S02-T04 D1)

**Context:** Waehrend M001-S02-T03 Feature-Cross-Check zeigte sich: `docs/feature-inventory.md` (last-updated 2026-04-22) ist **19% gedriftet** -- 23 von 119 Eintraegen falsch/veraltet (Lib-Files migriert, 4 dead components, 5 falsche Pfade). FEATURE-MAP.md §2 (Code-read 2026-05-15) ist aktueller. M001-S02-T04 IA-Konsolidierung muss eine Source-of-Truth festlegen, damit nicht zwei Karten gegeneinander argumentiert wird.
**Options considered:**
A) `docs/feature-inventory.md` -- gewohnt, aber 19% drifted.
B) `FEATURE-MAP.md §2` -- code-read, aktueller, aber lebt in `.ytstack/`.
C) Cross-Reference beider, Konflikte case-by-case -- maximale Flexibilitaet, maximaler Maintenance-Aufwand.
**Chose:** B
**Reason:** Drift macht A unzuverlaessig fuer IA-Decisions (Lib-File-Pfade falsch, dead components als "Built" markiert). B ist code-anchored und wurde aus dem laufenden Repo geschrieben. C waere Bias-Hotbed. Folgende Tasks (T04 IA-Map, S03 Generate-Redesign, M002+ Migration) ziehen Heimat-Zuweisungen aus FEATURE-MAP §2. Inventory-Refresh ist Folge-TODO fuer post-M001 (BAU auf Paperclip SUNAA).
**Reference:** `.ytstack/M001-FEATURE-GAPS.md`, `.ytstack/USER-JOURNEY.md` §9.5.

## 2026-05-18: /inspire bleibt eigene Page (Primary §3 Generate) (M001-S02-T04 D2)

**Context:** `/inspire` ist dual-citizen Generate (Prompt-Seeds feed `GenerateForm`) + Discover (Browse-feed). USER-JOURNEY §9.5 #1 Multi-Home-Decision.
**Options considered:**
A) Primary §3 Generate, secondary §7 Discover (Link aus beiden).
B) Primary §7 Discover, link aus §3.
C) Verschmelzen in `/generate?tab=inspire`.
**Chose:** A
**Reason:** Der Loop "see prompts → generate song" fuehrt zurueck zu Generate. `/inspire` UX ist Card-Grid + scroll, eigene Page sinnvoll. Link in `/discover?tab=inspire` als Secondary-Entry-Point (M002+).
**Reference:** USER-JOURNEY.md §9.5 #1.

## 2026-05-18: /compare → /generate?tab=compare (M001-S02-T04 D3)

**Context:** `/compare` ist A/B-Compare zweier Generations-Outputs. USER-JOURNEY §9.5 #2.
**Options considered:**
A) Eigene Top-Level-Route bleibt.
B) Sub-Tab in `/generate`.
C) Sub-Tool in `/library/[id]` Refine.
**Chose:** B
**Reason:** Compare ist Generate-Subflow (zwei Generationen vergleichen, dann eventuell remixen/wiederholen). Tab in `/generate` macht's discoverable. SongCompareView Component aendert Heimat von Discover-adjacent → Generate.
**Reference:** USER-JOURNEY.md §9.5 #2.

## 2026-05-18: /discover + /explore + /radio + /feed merge zu /discover mit Tabs (M001-S02-T04 D4-D5)

**Context:** Heute 4 separate Top-Nav-Items (`/discover`, `/explore`, `/radio`, `/feed`) -- 24% der 17 Mobile-Drawer-Slots fuer Sekundaer-Loop. `/discover` und `/explore` teilen sogar denselben Component `DiscoverView` mit verschiedenen Filter-Args.
**Options considered:**
A) Status quo -- 4 separate Routes.
B) Merge zu `/discover` mit 4 Tabs (Top/Explore/Radio/Feed).
C) Behalte `/radio` und `/feed` separat, merge nur `/discover`+`/explore`.
**Chose:** B
**Reason:** Alle 4 sind Discover-Sub-Modi mit Card-Grid-UX. DiscoverView-Wiederverwendung ist Hinweis dass Trennung nie semantisch war. Tab-Component statt 4 Routes spart 3 Nav-Slots auf Mobile + 3 Page-Files. radioState lebt in QueueContext -- Cross-Cut zu §4 Listen bleibt unveraendert (sub-tab kann Player in Radio-Mode versetzen).
**Reference:** USER-JOURNEY.md §9.5 #3, #4. M001-IA-MAP.md §4.1.

## 2026-05-18: /songs → kill, merge in /library als view-mode (M001-S02-T04 D6)

**Context:** Heute zwei Library-Surfaces (`/library` mit `LibraryView`, `/songs` mit `SongsGalleryView`) ohne klare Trennung. USER-JOURNEY §9.5 #5.
**Options considered:**
A) `/songs` und `/library` bleiben mit klar definiertem Unterschied (Marketing-Doku noetig).
B) `/songs` → `/library?viewMode=gallery` (Filter-Variant).
C) `/songs` killen, `SongsGalleryView` wird `LibraryView`-Render-Mode.
**Chose:** C
**Reason:** B addiert noch einen URL-Param zur ohnehin 12-axis-Filter LibraryView. C konsolidiert auf Component-Layer (SongsGalleryView wird Render-Strategie in LibraryView, viewMode-Param wechselt Layout). Migrations-Schritt: 301-Redirect `/songs` → `/library` mit `viewMode=gallery`.
**Reference:** USER-JOURNEY.md §9.5 #5.

## 2026-05-18: /discover/collections/[id] → /library/collections/[id] (URL-Fix) (M001-S02-T04 D7)

**Context:** Collections sind Library-Domain (FEATURE-MAP §2 #4 Library), aber URL liegt unter `/discover` -- USER-JOURNEY §9.5 #6.
**Options considered:**
A) URL bleibt unter `/discover`.
B) URL-Fix nach `/library/collections/[id]`.
**Chose:** B
**Reason:** Domain-Mapping muss URL widerspiegeln. CollectionDetailView Component-Heimat wandert von discover-context → library-context. 301-Redirect noetig.
**Reference:** USER-JOURNEY.md §9.5 #6, FEATURE-GAPS §D.

## 2026-05-18: /users/[id] → /profile/[id], /u/[username] bleibt public-permalink (M001-S02-T04 D8)

**Context:** Zwei Profile-Surfaces -- `/users/[id]` (in-app, session-gated) und `/u/[username]` (public-permalink). Naming-Drift. USER-JOURNEY §9.5 #7.
**Options considered:**
A) Beide bleiben mit klar getrennten Zwecken.
B) `/users/[id]` umbenennen in `/profile/[id]` fuer Klarheit, `/u/[username]` bleibt public.
C) Merge zu einer Route mit Auth-Check-Branch.
**Chose:** B
**Reason:** Public-Permalink (`/u/[username]`) hat externe Konsumenten (geteilte URLs) -- darf nicht aendern. In-App-Surface umbenennen schafft Klarheit; `/users` impliziert User-Listing (kollidiert mit `/admin/users`). 301-Redirect von `/users/[id]` → `/profile/[id]`.
**Reference:** USER-JOURNEY.md §9.5 #7.

## 2026-05-18: Analytics-5-Cluster → /analytics mit Sub-Tabs + /admin/analytics (M001-S02-T04 D9)

**Context:** 5 Analytics-Surfaces heute (`/analytics`, `/stats`, `/insights`, `/dashboard/analytics`, `/admin/analytics`) fuer ein Konzept "see my data". USER-JOURNEY §9.5 #8.
**Options considered:**
A) Status quo.
B) Collapse user-facing 4 in `/analytics` mit Tabs (Overview/Stats/Insights/Songs); `/admin/analytics` bleibt separat.
C) Komplett kollabieren auf 1 Route mit Admin-Auth-Check.
**Chose:** B
**Reason:** 5 Routes fuer eine Domain ist Drift. 5 Chart-Files (`analytics/{Admin,Insights,Play,Stats,User}AnalyticsCharts`) mirroren 1:1 die Routes -- Konsolidierung auf Code-Layer ist parallel moeglich. Admin bleibt separat (Sub-App-Constraint).
**Reference:** USER-JOURNEY.md §9.5 #8. M001-IA-MAP.md §4.2.

## 2026-05-18: Generate-5-Cluster → /generate Tabs + /generations Sub-View + /inspire separat (M001-S02-T04 D10)

**Context:** 5 Generate-Surfaces (`/generate`, `/generations`, `/mashup`, `/compare`, `/inspire`). USER-JOURNEY §9.5 #9.
**Options considered:**
A) Status quo.
B) `/generate` mit Tabs (Simple/Advanced/Mashup/Compare); `/generations` als Sub-View; `/inspire` bleibt separat (D2).
C) Alle 5 in eine Tab-Hub.
**Chose:** B
**Reason:** Mashup + Compare sind Generate-Mode-Varianten -- Tabs sinnvoll. Generations-History ist eng gekoppelt -- Sub-View. Inspire ist dual-citizen Discover, bleibt eigene Page (D2). FRICTION-AUDIT §1: GenerateForm hat 30 useState; Tabs sind Disclosure-Pattern statt mehr State im selben Modul.
**Reference:** USER-JOURNEY.md §9.5 #9. M001-IA-MAP.md §4.3.

## 2026-05-18: Authoring-Cluster → /authoring Hub mit Sub-Tabs (M001-S02-T04 D11)

**Context:** 3 Top-Level-Routen (`/personas`, `/templates`, `/style-templates`) fuer FEATURE-MAP §6 "Authoring helpers". USER-JOURNEY §9.5 #10.
**Options considered:**
A) Status quo (3 separate Routes).
B) `/authoring` Hub mit 3 Sub-Tabs.
C) Eingebettet in `/settings`.
**Chose:** B
**Reason:** Alle drei gleicher Bounded Context, gleicher CRUD-Pattern (3 parallele Manager-Components). User craftet Prompt-Toolkit als zusammenhaengenden Workflow. Default-Tab = Personas (most-used). C waere falsche Heimat -- Authoring ist creative-tooling, nicht Account-Setting.
**Reference:** USER-JOURNEY.md §9.5 #10. M001-IA-MAP.md §4.4.

## 2026-05-18: Persona-Auswahl bleibt inline in GenerateForm (M001-S02-T04 D12)

**Context:** Mit `/authoring` Hub (D11) koennten Persona-Auswahl + Persona-Management auf gleiche Page wandern. USER-JOURNEY §9.5 #11.
**Options considered:**
A) Auswahl + Management beides in `/authoring`.
B) Auswahl in `/generate` (inline), Management in `/authoring`.
**Chose:** B
**Reason:** Trennung von Use vs Manage ist sauberes UX-Pattern (siehe Photoshop: Brush-Picker inline, Brush-Settings im Dialog). Inline-Picker im GenerateForm ist Persona als Generate-Schritt; `/authoring` ist Persona als Tool.
**Reference:** USER-JOURNEY.md §9.5 #11.

## 2026-05-18: /library/[id] Primary=§6 Refine, Cross-Cuts akzeptiert (M001-S02-T04 D13)

**Context:** `/library/[id]` ist Multi-Home: Page-Logik = §6 Refine (SongDetailView Switchboard), aber URL liegt unter /library (§5 Organize), und Component startet Listen-Loop via in-page Waveform. USER-JOURNEY §9.5 #12.
**Options considered:**
A) URL aendern auf `/refine/[id]` zu klaren Heimat-Markierung.
B) URL bleibt `/library/[id]`, Page-Heimat = §6 in Documentation, Cross-Cuts akzeptiert.
**Chose:** B
**Reason:** A bricht externe Bookmarks. B konzeptuelle Klarheit ohne URL-Aenderung. Page-Document-Heimat = §6, aber Multi-Home als Realitaet anerkennen. SongDetailView ist switchboard-by-design.
**Reference:** USER-JOURNEY.md §9.5 #12.

## 2026-05-18: Mobile-Nav bleibt einheitlicher Drawer (nicht Bottom-Nav) (M001-S02-T04 D14)

**Context:** Mit 17 → 8 Nav-Items waere Bottom-Nav (5 Items, mobile-Standard) eine Option. USER-JOURNEY §1 + MOBILE-AUDIT §B.4.
**Options considered:**
A) Bottom-Nav mit 5 Items + Hamburger fuer Rest.
B) Einheitlicher Drawer mit 8 Items (heute schon Code-Layer in AppShell).
C) Hybrid: 3 Bottom + Drawer-Rest.
**Chose:** B
**Reason:** Bottom-Nav ist Architektur-Aenderung im AppShell (61 commits Hot-File) + Konflikt mit GlobalPlayer-Slot (auch bottom). Drawer ist heute-Implementierung, 17→8 Items macht's per se besser. M004+ kann Bottom-Nav nach Feedback noch evaluieren. Risk-vs-Benefit: niedriges Risiko bei B, gut-genug Mobile-UX.
**Reference:** USER-JOURNEY.md §1 (Persona Mobile-Power-User), M001-MOBILE-AUDIT.md §B.4, M001-IA-MAP.md §5.

## 2026-05-18: Audio-Proxy serves byte ranges from streams, not buffered reads

**Context:** `proxyAudio.serveCached` used `audioCache.get` → `readFileSync` on every request, reading the full 3–7 MB mp3 into memory and blocking the Node event loop. Symptom: iOS PWA playback stalled / hung after a brief play, even with the file already on disk and the SW out of the way. Multi-MB sync reads serialised every concurrent request.
**Options considered:**
A) Make `FileCache.get` async (`fs.promises.readFile`) and ripple `await` through every caller.
B) Add a new `FileCache.getStream(id, start?, end?)` returning a Web `ReadableStream` (Node `createReadStream` → `Readable.toWeb` equivalent), keep sync `get` for cold paths.
C) Move audio bytes off the volume and serve from a Cloudflare R2 / external CDN.
**Chose:** B
**Reason:** Hot path (audio Range requests) gets the only correct shape — non-blocking *and* serves only the requested byte slice (no 5 MB read for a 500 KB range). Cold callers (warmup, admin tools) keep sync `get` to avoid a big-bang async refactor. Option C is right long-term but a much larger move; B is a one-file change with zero migration cost.
**Reference:** `src/lib/cache/file.ts` (`getStream`, `nodeStreamToWeb`), `src/lib/audio/index.ts` (`serveCached`), `src/lib/cache/file.test.ts`. KNOWLEDGE.md "Lessons learned" — sync-readFileSync. Commit `f3423bc` / `0.2.2`.

## 2026-05-18: Service Worker bypasses itself for `/api/audio/*` Range requests

**Context:** The original SW strategy was URL-keyed cache-first for `/api/audio/*` (intended to enable Save-Offline + warm subsequent plays). With Range requests this was unsafe: `cache.match(request)` ignores the Range header by default, so the first cached partial would be served for every subsequent byte-range — songs played the first chunk and then stalled. Per spec, `cache.put` rejects 206 responses with TypeError; WebKit's iOS PWA implementation is inconsistent enough that we cannot rely on the rejection.
**Options considered:**
A) Always cache, slice client-side on subsequent requests (custom Range handler inside the SW).
B) Bypass the SW entirely when the request carries a Range header; only cache full 200 responses (Save-Offline writes via a separate code path).
C) Drop the SW audio cache entirely; rely on the server-side file cache + HTTP cache headers.
**Chose:** B
**Reason:** A is correct but a meaningful re-implementation of Range semantics in JS, and would still be fragile against WebKit quirks. B retains the Save-Offline feature (explicit fetch with no Range → 200 OK → cached) while removing the breakage source. C loses Save-Offline. B also forced an `AUDIO_CACHE` version bump (`v1` → `v2`) to evict any 206 partials WebKit may have stored despite the spec.
**Reference:** `public/sw.js` (`isProxiedAudioRequest` branch + `AUDIO_CACHE` constant). KNOWLEDGE.md "Lessons learned" — SW cache.match ignores Range. Commit `f3423bc` / `0.2.2`.

## 2026-05-18: Middleware `PUBLIC_PATHS` covers media-proxy routes; auth still enforced in handlers

**Context:** Media-proxy routes (`/api/audio/`, `/api/audio/public/`, `/api/images/`) were not in `PUBLIC_PATHS`. The middleware redirected unauthenticated requests with `307 → /login`; the `<audio>` / `<img>` element followed the redirect and tried to play the login HTML as the media stream → silent breakage on share pages, embeds, and iOS PWAs that lost their JWT cookie.
**Options considered:**
A) Add the media-proxy paths to `PUBLIC_PATHS` and rely on the route handlers' existing `authRoute` / `publicRoute` checks.
B) Keep middleware enforcement and have the handlers return a media-friendly 401 (e.g. a 1-byte silent mp3) for unauth.
C) Generate signed URLs for media so middleware can validate without a cookie.
**Chose:** A
**Reason:** A is the smallest correct change. The route handlers were already enforcing auth correctly — the middleware was just hiding the proper 401 response behind a 307-HTML redirect. Authenticated routes now return `401 application/json` (verified live in prod) which the audio element treats as a clean error → triggers our retry / fallback. B is hacky and doesn't help the share-page case. C is overkill for the current threat model (no rate-limit or cost-driven need to gate at the edge).
**Reference:** `src/middleware.ts` (`PUBLIC_PATHS`). KNOWLEDGE.md "Lessons learned" — media-proxy in PUBLIC_PATHS. Commit `f3423bc` / `0.2.2`.

