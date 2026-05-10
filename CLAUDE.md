# CLAUDE.md

Instructions for AI agents working on this repo. Keep this file short. If
something can be learned from reading code or package.json, don't repeat it
here — capture only invariants, non-obvious choices, and load-bearing rules.

## What this project is

A mobile-first BQN playground, shipped as a PWA. Long arc: REPL → IDE → puzzle
game that teaches array programming. Built primarily as a personal learning
tool for the human; the codebase is in service of that goal, not an end in
itself.

## Dev environment

The toolchain is pinned in `flake.nix` (Nix flake + direnv). Locally, the human
enters the flake dev shell automatically via direnv; `node` and `pnpm` come
from the flake, not from the system.

When running commands in this repo as an agent:

- **Never** install node, pnpm, or other toolchain globally (`npm i -g`,
  `corepack enable`, `nvm install`). If tools are missing, run commands via
  `nix develop --command <cmd>`.
- If `nix` is unavailable (e.g. in a sandbox where node/pnpm are already on
  PATH), you may use them directly. Do not modify global state.
- There are two toolchain pins — `flake.nix` for local dev and the `version:`
  input on `pnpm/action-setup` in `.github/workflows/deploy.yml` for CI. Bump
  both together. Do **not** re-add a `packageManager` field to `package.json`;
  `pnpm/action-setup` errors out when both it and `version:` are set.

## Commands

| Task | Command |
| --- | --- |
| Install deps | `pnpm install` |
| Dev server (LAN-exposed) | `pnpm dev --host` |
| Production build | `pnpm build` |
| Preview the build | `pnpm preview --host` |
| Typecheck | `pnpm check` |

## Deploy

`.github/workflows/deploy.yml` deploys `build/` to GitHub Pages on push to
`main` or `claude/**`. The site is served from the `/BqnGame` subpath — the
base path is configured in `svelte.config.js` and must match the repo name
exactly (case-sensitive).

## Task tracking

Tasks are managed by [Backlog.md](https://github.com/MrLesk/Backlog.md). The
binary comes from the flake dev shell and the MCP server is wired up in
`.mcp.json` (so Claude Code exposes `task_create`, `task_list`, `task_edit`,
`document_create`, … as tools). Before you create, edit, or close a task,
read [`docs/runbooks/backlog.md`](docs/runbooks/backlog.md) — it has the
phase discipline, the AC/DoD rules, and the full command/tool reference.
Never edit files under `backlog/` by hand.

## Invariants (read before making changes)

1. **Static build only.** The adapter is `@sveltejs/adapter-static`. Do not
   introduce server-side features (form actions with server logic, API routes,
   SSR-only APIs). Pages is a static host.
2. **Prerender survives the fallback.** The fallback is `404.html`, not
   `index.html`, so the prerendered home page is served directly. Do not
   change the fallback name without checking the build output actually
   contains rendered content for `/`.
3. **BQN source of truth is the worker interpreter.** Never parse,
   pretty-print, or evaluate BQN in handwritten main-thread code. Send source
   to the worker, get formatted output back. The worker currently runs the
   self-hosted JS interpreter vendored at `src/lib/bqn/vendor/bqn.js`; if we
   later swap to CBQN-wasm, the protocol doesn't change.
4. **Verify any BQN snippet before committing it.** Training data on BQN is
   thin and glyphs are easy to hallucinate. If you write BQN for an example,
   test, or doc, run it in the REPL first. When the wasm REPL doesn't exist
   yet, cross-check against [`docs/bqn-reference.md`](docs/bqn-reference.md)
   or paste into https://mlochbaum.github.io/BQN/try.html.
5. **Mobile is the primary target.** Any UI change must be evaluated at a
   phone viewport (~390×844). Desktop is a nice-to-have, not the design
   constraint.
6. **Show real BQN, never abbreviated — except the bind plumbing.**
   The game teaches by recognition, so the operation glyphs and their
   modifiers (`´`, `` ` ``, `˜`, `˘`, `⌜`, `‿`, `↑`, `↓`, `⌽`, `⥊`, `⊑`,
   `↕`, `|`, `/`, `<`, `=`, …) belong on the rune button as the player
   would type them in real BQN. The exception is `⊸` and `⟜`: those
   only exist in our codebase to turn dyadic operations into one-argument
   buttons (the rune system feeds in only the current state). They are
   not how a human would write the same operation in a BQN script — you'd
   just write `2↑x`, `+1+x`, etc. Strip `⊸`/`⟜` from `glyph` (the button
   label) but keep them in `expr` (what we evaluate). Everything else
   stays. If a label doesn't fit on a button, shrink the button or wrap;
   never drop the operation glyph itself. The player learns the syntax
   secretly, by pattern-matching against what they tap, so dropping a
   real glyph defeats the exercise — but showing app-internal plumbing
   muddles what's actually part of the language.

## Working style

- The human is learning BQN. When you write or modify BQN code, briefly
  explain what each glyph does in the commit body or a nearby comment. Do not
  strip such explanations to be terse.
- Prefer deleting code to generalizing it. This is a learning project;
  speculative abstraction is the enemy.
- This file is deliberately short. If you find yourself wanting to add more,
  consider whether it belongs in `docs/architecture.md`, `docs/runbooks/`, or
  `docs/decisions/` instead, and link from here.

## References

- [`docs/architecture.md`](docs/architecture.md) — layout, process model,
  worker protocol, built-vs-planned.
- [`docs/bqn-reference.md`](docs/bqn-reference.md) — primitive table sourced
  from upstream. Consult before writing BQN.
- [`docs/runbooks/backlog.md`](docs/runbooks/backlog.md) — Backlog.md task
  workflow, CLI/MCP reference. Read before touching tasks.
- [`docs/decisions/`](docs/decisions/) — ADRs for locked-in choices
  (Svelte, wasm-in-browser, GitHub Pages).
