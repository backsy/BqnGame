# BqnGame

Mobile-first BQN playground. Built as a PWA with SvelteKit, CBQN compiled to
WebAssembly running in a Web Worker.

Deployed to GitHub Pages: https://backsy.github.io/BqnGame/

## Development

```sh
pnpm install
pnpm dev -- --host   # --host exposes on LAN so you can open it on your phone
```

Visit `http://<your-laptop-ip>:5173` from a phone on the same Wi-Fi to iterate
on mobile.

## Build

```sh
pnpm build
pnpm preview -- --host
```

## Deploy

Pushes to `main` or any `claude/**` branch trigger the GitHub Pages workflow
(`.github/workflows/deploy.yml`). Enable Pages under repo **Settings → Pages**
with source set to **GitHub Actions**.
