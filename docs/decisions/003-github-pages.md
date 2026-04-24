# 003 — GitHub Pages for hosting

**Status:** accepted
**Date:** 2026-04-24

## Context

Where to host the built PWA. Candidates:

- GitHub Pages (free, repo-scoped, HTTPS, one deployment per repo)
- Cloudflare Pages (free, per-branch preview URLs, edge functions available)
- Netlify / Vercel (similar to CF Pages)

## Decision

GitHub Pages for now. Switch later only if concrete needs emerge.

## Why

- Zero setup beyond flipping one switch + committing a workflow.
- HTTPS by default — required for service worker / PWA install.
- The repo is already on GitHub; no new vendor to manage.
- Static, no edge functions needed (everything runs in the browser by
  decision 002).

## Cost accepted

- **No per-branch preview URLs.** Only one live deployment at a time.
  For solo development this is fine; when contributors appear, CF Pages
  is a 10-minute migration because the build output is identical.
- **Single environment.** No staging URL. Production is where we test
  for real. We rely on the dev server (`pnpm dev --host`) for iteration
  and only push commits we're OK with going live.
- **Subpath URL.** Serves from `/BqnGame/` not `/`. Handled via
  `kit.paths.base` in `svelte.config.js`. The trap is that casing must
  match the repo name exactly — captured as invariant in CLAUDE.md.

## When to revisit

- Multiple contributors + review-driven workflow → CF Pages preview URLs.
- Custom domain wanted without subpath → user/org Pages or CF Pages.
- Need for edge compute (auth, rate limiting, analytics) → CF Pages or
  Vercel.
