# BqnGame

A mobile-first BQN puzzle **game**, shipped as a PWA with SvelteKit. There's
a secondary REPL/playground at `/sandbox/`, but the game is the primary
experience right now — playground is a side surface, not the headline.

Deployed to GitHub Pages: https://backsy.github.io/BqnGame/

## BQN runtime

Currently: the self-hosted JavaScript BQN interpreter from
[mlochbaum/BQN](https://github.com/mlochbaum/BQN) is vendored at
`src/lib/bqn/vendor/bqn.js` and runs synchronously on the main thread.
Vendoring it was a one-file job, which is why this landed first.

Potential future: if the JS interpreter ever stops serving our needs — perf,
cancellation, isolation — swap it for **CBQN compiled to WebAssembly running
in a Web Worker**. The protocol shim and a placeholder worker already exist
at `src/lib/bqn/worker.ts` and `src/lib/bqn/protocol.ts`, so the swap would
be a different worker implementation behind the same message contract.

## Dev environment

The project uses a Nix flake + direnv to pin toolchain versions. There is no
global `npm i -g` or `nvm use` step — entering the directory gives you the
right `node` and `pnpm` automatically.

First-time setup (once per machine):

```sh
# install nix (if you don't have it): https://nixos.org/download
# install direnv + hook it into your shell: https://direnv.net/docs/hook.html
direnv allow        # in the repo root, after cloning
```

Day-to-day:

```sh
cd BqnGame          # direnv drops you into the flake's dev shell
pnpm install        # first time only
pnpm dev --host     # --host exposes on LAN to open on your phone
```

Without direnv, run `nix develop` manually, or prefix commands with
`nix develop --command <cmd>`.

The pinned toolchain lives in `flake.nix`: `nodejs_22`, `pnpm_10`, `git`. CI
pins its own pnpm version in `.github/workflows/deploy.yml` via the
`pnpm/action-setup` action — bump both together when upgrading. Don't add a
`packageManager` field to `package.json`; it conflicts with the action.

## Build

```sh
pnpm build
pnpm preview --host
```

## Deploy

Pushes to `main` or any `claude/**` branch trigger the GitHub Pages workflow
(`.github/workflows/deploy.yml`). Enable Pages under repo **Settings → Pages**
with source set to **GitHub Actions**.

CI does not currently use the flake — it installs `pnpm` and `node` directly
via actions. If toolchain drift becomes a problem we'll switch CI to nix too.
