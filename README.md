# BqnGame

Mobile-first BQN playground. Built as a PWA with SvelteKit, CBQN compiled to
WebAssembly running in a Web Worker.

Deployed to GitHub Pages: https://backsy.github.io/BqnGame/

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

The pinned toolchain lives in `flake.nix`: `nodejs_22`, `pnpm_10`, `git`. Bump
versions there, not in package.json's `packageManager` field.

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
