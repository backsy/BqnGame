# 002 — CBQN wasm in the browser, not on a server

**Status:** accepted
**Date:** 2026-04-24

## Context

BQN needs to execute somewhere. Options:

1. CBQN compiled to WebAssembly, running in a Web Worker in the browser.
2. Server running native CBQN, browser sends source and receives output.
3. Re-implement BQN in JavaScript.

## Decision

Option 1. CBQN wasm in a Web Worker.

## Why

- **Offline works.** PWA install + no network round-trip on every eval.
  On a plane, on the subway, on a bad hotel connection — still works.
- **Zero hosting cost.** Static asset on GitHub Pages. No servers, no
  auth, no abuse handling.
- **Latency.** Even a fast RTT is slower than a worker message pass.
  For a REPL, tap-to-result feel is the thing we care most about.
- **BQNPAD proves it's viable.** The existing desktop playground does
  exactly this; we are not forging a path.

## Why not option 3

Invariant #3 in CLAUDE.md: don't reimplement BQN. The wasm is the source
of truth for what the language means. Reimplementation would either be
partial (wrong for real programs) or complete (years of work for a learning
project).

## Cost accepted

- Wasm bundle is ~1MB compressed. First load on cellular is not instant.
  Mitigation: service worker precaches after first visit.
- Main thread ↔ worker marshaling has its own cost. Mitigation: we only
  ever send source in and pretty-printed output out. No structured data
  crosses the boundary.

## When to revisit

If we ever need cross-device session sync, collaborative editing, or
persistent user accounts, a server becomes worth having — but then only
as a *side* of the architecture, not a replacement for the local wasm.
