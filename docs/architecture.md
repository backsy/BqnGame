# Architecture

High-level shape of the app. Kept short by design. Updated when reality
changes — if you find this doc contradicting the code, fix the doc.

## Overview

```
┌──────────────────────────────────────┐
│  Code editor  (CodeMirror 6)         │  top ~55%
│  syntax-highlighted BQN source       │
├──────────────────────────────────────┤
│  Output / REPL history               │  middle ~10%
├──────────────────────────────────────┤
│  Glyph palette                       │  bottom ~35%
│  tabs: fn  _m  _m_                   │
│  always docked, never covers editor  │
└──────────────────────────────────────┘
```

Mobile-first. Desktop is a nice-to-have.

## Process model

```
    main thread                         worker thread
 ┌───────────────┐                   ┌──────────────────┐
 │ Svelte app    │ ─── postMessage ──→   CBQN wasm     │
 │ editor / UI   │ ←── postMessage ───   interpreter   │
 │ state stores  │                   └──────────────────┘
 └───────────────┘
```

The BQN interpreter runs in a Web Worker and is reached only through a typed
message protocol. Main thread never parses, pretty-prints, or evaluates BQN —
that's invariant #3 in `CLAUDE.md`. If you need something BQN-shaped, ask the
worker.

The worker's public surface (planned) is intentionally narrow:

```ts
// → worker
type Request =
	| { id: string; kind: 'eval'; source: string }
	| { id: string; kind: 'cancel' };

// ← worker
type Response =
	| { id: string; kind: 'ok'; value: string /* pretty-printed */ }
	| { id: string; kind: 'error'; message: string }
	| { id: string; kind: 'ready' };
```

Concrete wiring lives in one file (`src/lib/bqn/worker.ts` planned) so there
is only one place to change the contract.

## State

Ephemeral state (current editor buffer, output history, palette tab) lives in
Svelte stores. Persistent state (saved snippets, solved puzzles) will live in
IndexedDB. We do not currently persist anything — adding that is a future
step, not a hidden dependency.

## Build

- `pnpm build` → Vite builds client + SvelteKit prerender.
- `@sveltejs/adapter-static` emits everything into `build/`.
- Home route is prerendered; fallback is `404.html` (so GitHub Pages can
  serve unknown paths back into the SPA without clobbering the home page).
- Service worker (`src/service-worker.ts`) precaches build + static files on
  install; fetch handler is cache-first for precached assets, network-first
  with cache write-through for everything else.

## What is built right now

- SvelteKit static skeleton with `/BqnGame/` base path.
- BQN386 font self-hosted from `static/fonts/`.
- PWA manifest + icons + service worker.
- GitHub Pages deploy via `.github/workflows/deploy.yml`.
- Three-panel page shape (editor / output / palette) in `src/routes/+page.svelte`.
- CodeMirror 6 editor at `src/lib/components/Editor.svelte`. `basicSetup` +
  line wrapping + a dark theme inline. Mobile keyboard suppressed via
  `contentAttributes.of({ inputmode: 'none', ... })`. Exposes an imperative
  API (`insert`, `value`, `focus`) to the parent via an `onready` callback.
- Glyph palette component at `src/lib/components/GlyphPalette.svelte`,
  driven by `src/lib/primitives.ts`. Tabs for fn / 1-mod / 2-mod, tap-to-
  insert wired to the editor's cursor position. No long-press help, no
  semantic grouping within a tab, no recents row — these are follow-ups,
  not core gaps.
- BQN worker layer at `src/lib/bqn/`:
  - `protocol.ts` — shared message types. Pure; imported from both sides.
  - `worker.ts` — **mock** implementation. Accepts `eval` requests, returns
    a canned `(mock) <source>` result after a 30ms delay, or an error on
    empty input. Real CBQN wasm will replace this file without touching
    the protocol.
  - `client.ts` — main-thread wrapper. Instantiates the worker (via Vite's
    `?worker` import), correlates responses by id, exposes a
    Promise-returning `eval()` method.
  - Wired into `+page.svelte` behind a Run button in the output strip.

## What is planned, not built

- **Real CBQN wasm inside `src/lib/bqn/worker.ts`** — this is the big one.
  Swap the mock for the actual interpreter without changing `protocol.ts`
  or `client.ts`.
- BQN syntax highlighting (a `StreamLanguage` or lezer mode wired into
  CodeMirror).
- Long-press help card on palette tiles.
- IndexedDB persistence.
- Puzzle authoring / runner.

The planned pieces above have specific files named in passing so an agent
knows where they're expected to live. When you create one of them, update
this doc to move it into the "built" section.
