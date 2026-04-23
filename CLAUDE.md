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
- Bump toolchain versions in `flake.nix`, not in `package.json`'s
  `packageManager` field.

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

## Invariants (read before making changes)

1. **Static build only.** The adapter is `@sveltejs/adapter-static`. Do not
   introduce server-side features (form actions with server logic, API routes,
   SSR-only APIs). Pages is a static host.
2. **Prerender survives the fallback.** The fallback is `404.html`, not
   `index.html`, so the prerendered home page is served directly. Do not
   change the fallback name without checking the build output actually
   contains rendered content for `/`.
3. **BQN source of truth is the wasm interpreter.** Never parse, pretty-print,
   or evaluate BQN in JS/TS. Round-trip through the worker. (Not yet wired up
   — noting for when it is.)
4. **Verify any BQN snippet before committing it.** Training data on BQN is
   thin and glyphs are easy to hallucinate. If you write BQN for an example,
   test, or doc, run it in the REPL first. When the wasm REPL doesn't exist
   yet, cross-check against `docs/bqn-reference.md` (once created) or the
   upstream BQN docs at https://mlochbaum.github.io/BQN/.
5. **Mobile is the primary target.** Any UI change must be evaluated at a
   phone viewport (~390×844). Desktop is a nice-to-have, not the design
   constraint.

## Working style

- The human is learning BQN. When you write or modify BQN code, briefly
  explain what each glyph does in the commit body or a nearby comment. Do not
  strip such explanations to be terse.
- Prefer deleting code to generalizing it. This is a learning project;
  speculative abstraction is the enemy.
- This file is deliberately short. If you find yourself wanting to add more,
  consider whether it belongs in `docs/architecture.md`, `docs/runbooks/`, or
  `docs/decisions/` instead, and link from here.
