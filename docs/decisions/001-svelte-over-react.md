# 001 — SvelteKit over React

**Status:** accepted
**Date:** 2026-04-24

## Context

The app is a mobile-first PWA with a lot of custom touch handling (glyph
palette, tap-to-cursor-position in the editor, gesture-based help overlays)
and very little traditional "screens and forms" UI. Primary distribution is a
static bundle served from GitHub Pages.

## Decision

SvelteKit with `@sveltejs/adapter-static`.

## Why not React

- Reconciliation is free weight for a UI this size. Our bottleneck is font
  loading and wasm cold start, not render.
- React's touch event story is worse than the DOM's. PointerEvents work
  fine with vanilla bindings; wrapping them in synthetic events adds bugs,
  not ergonomics.
- The mobile SvelteKit build output is meaningfully smaller than a
  comparable React + router + bundler setup. On a cellular cold load that
  matters.

## Why not vanilla

- We *do* want reactivity for the editor ↔ worker ↔ output loop. Writing
  that by hand is where bugs live.
- Svelte 5 runes are close enough to vanilla JS that we haven't paid a big
  framework-ness tax; the escape hatch to plain DOM is always one line away.

## Trade-offs accepted

- Smaller ecosystem than React. Fine: we won't be pulling in much beyond
  CodeMirror.
- Svelte 5 is newer; some agents' training data is lighter. This is why
  `CLAUDE.md` + `docs/` exist.

## When to revisit

If we ever need server-rendered dashboards, complex form state, or
third-party component libraries that are React-only. None of which is on the
roadmap.
