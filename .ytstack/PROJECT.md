---
name: SunoFlow
slug: SunoFlow
created: 2026-05-15T15:00:00Z
updated: 2026-05-15T15:00:00Z
status: brownfield-imported
---

# SunoFlow

**One-liner:** Mobile-first web app for managing and generating music via the Suno API — generation queue, song library, playlists, waveform player, public sharing, persona/lyric/template workflows.

## What this project is

Personal music-management front-end for [sunoapi.org](https://sunoapi.org). Users register, plug in their Suno + OpenAI keys, generate songs with prompts/templates/personas, organise the output in playlists/favorites/history, edit lyrics and cover art, then play back through a global waveform player. Songs and playlists can be made public via shareable slugs (`/s/[slug]`, `/p/[slug]`). Admin dashboard tracks users, analytics, errors.

Source of truth for feature inventory: [`docs/feature-inventory.md`](../docs/feature-inventory.md). This file does NOT duplicate it — read that instead.

## Why it exists

Suno's own UI is desktop-oriented and lacks library/playlist/sharing primitives. SunoFlow wraps the API with a mobile-first PWA that turns generated tracks into a personal music collection.

## Success criteria

- Production stable at `https://sunoflow.up.railway.app` (Railway deploy from tags `v*.*.*`)
- Sentry error budget under control (see `docs/sentry-alerting.md`)
- CI green on `main` (`ci.yml`)
- Generation queue end-to-end works for new users following the API-key wizard

## Current status

Active development, deployed to production. Currently at `v0.1.1` (see `package.json`). Most recent work (May 2026): observability hardening (Sentry server runtime + onRequestError + replay-strip), audio waveform Web Worker, player load-generation token guards, PostHog defer.

## Brownfield import note

This `.ytstack/` was initialised on **2026-05-15** against an already-deployed codebase. No `ytstack:office-hours` pitch was run — the one-liner above was distilled from `README.md` and `docs/feature-inventory.md`. If you want to retroactively stress-test the premise, run `ytstack:office-hours` and let it append (do NOT overwrite this PROJECT.md without merging the existing context).
