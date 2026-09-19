# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Optional API key for write requests. Set `CACHEMESH_API_KEY` and every request that changes state needs it as a bearer token or `X-API-Key` header; unauthenticated requests get `401`. Reads stay open, `/api/health` reports `writeAccess`, and with no key set nothing changes.
- The dashboard shows a masked key field when the server requires a key, keeps the key in `sessionStorage` for the tab, and explains a `401` instead of showing "Unauthorized".

### Changed
- Redesigned the dashboard: a light paper theme with one teal accent color, replacing the dark navy theme and its five neon accent colors.
- Replaced every emoji icon and label with Lucide icons or plain text.
- Self-hosted the Sora, Geist and Geist Mono fonts instead of the system font stack, with numbers set in mono everywhere.
- Removed all gradients and drop shadows from the logo, buttons, stat cards and progress bars.
- Replaced the two rows of identical stat cards with a single stats strip (hit rate, requests, keys cached, memory, evictions).
- Rebuilt the stampede test as a two-column layout: controls in a form on the left, results as a definition list on the right.
- Rebuilt the key explorer as a table (key, hits, size, TTL, actions) instead of a card grid.
- Resized every button, input and table row so no control is shorter than 44px.
- Rewrote the UI copy in plain terms ("Send 30 requests", "Stampede test", "Keys in cache") and removed promotional and jargon-heavy phrasing.

## [1.0.0] - 2026-09-13

### Added
- Express gateway with O(1) LRU and LFU eviction, switchable at runtime, TTL expiry (checked on access and by a periodic background sweep), and wildcard pattern invalidation (`user:*`).
- Singleflight promise coalescing so concurrent requests for the same cold key share one origin call instead of one each.
- Node's native SQLite (`node:sqlite`, WAL mode) as the origin store, seeded with a small sample catalog.
- React 19 dashboard: live telemetry, a stampede simulator, a key explorer with TTL countdowns, and a GET/SET/purge workbench.
- In-browser demo mode for GitHub Pages: the same cache and eviction code runs against an in-memory, localStorage-backed origin store instead of the API, with a "Reset demo data" control.
- Docker image (multi-stage build, runs as a non-root user) and a Compose file for local use.
- CI workflow (lint, test, build, Docker build) and a GitHub Pages deployment workflow.

### Fixed
- The production build's entry point did not exist at the path `npm start` and the Docker image both expected, so both crashed immediately after `npm run build`.
- Cache purge patterns were compiled into a regular expression without escaping anything but `*`, so a key containing `.`, `(`, or other regex metacharacters could be matched incorrectly or throw.
- API error handlers returned the raw error message to the client, which could leak internal detail; they now log server-side and return a generic message.
- `sweepExpired()` existed on both eviction engines but was never called, so an expired key that was never read again stayed in memory and in the reported stats indefinitely.
- Form fields in the operations workbench had visible labels that were not associated with their inputs, and focus rings were suppressed on several inputs with no replacement.
