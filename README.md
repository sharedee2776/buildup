# BuildUp

Learn how technology works by making real things — a gentle, offline-friendly tech
playground for kids (ages 7–17). **Phase 1 prototype:** shortened onboarding with a
calibration check, a Home screen, a reusable mission-player, and three playable
missions. No accounts, no AI, no network required after the first load. All progress
lives in the browser on the device (`localStorage`).

```
index.html              the whole app (hand-authored HTML/CSS/JS, no build step)
manifest.webmanifest    PWA manifest — installable to a phone home screen
sw.js                   service worker — precaches the shell for offline use
icons/                  app icons (SVG; run scripts/make-icons.sh for PNGs)
_headers                Cloudflare Pages caching + security headers
robots.txt              disallow indexing while in private playtest
scripts/make-icons.sh   SVG -> PNG icons (iOS + older Android)
scripts/fetch-fonts.sh  optional: self-host the fonts for first-load-offline
test/e2e.js             94-check end-to-end test (jsdom)
```

## Run locally

```bash
npm run dev          # serves at http://localhost:5173
```

A service worker needs `http://localhost` or HTTPS — opening `index.html` as a
`file://` URL will run the app but not register the worker.

## Deploy (Cloudflare Pages)

**One-off, no repo:**
```bash
npx wrangler login
npm run deploy       # npx wrangler pages deploy . --project-name buildup
```

**From GitHub (auto-deploy on push):**
```bash
git init && git add -A && git commit -m "BuildUp Phase 1"
git branch -M main
git remote add origin git@github.com:<you>/buildup.git
git push -u origin main
```
Then in the Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**:
- Framework preset: **None**
- Build command: *(empty)*
- Build output directory: **`/`**

Add a custom domain under the project's **Custom domains** tab when ready.

Vercel or Netlify work identically — import the repo, no build command, output = root.

## Install on a phone

**iPhone / iPad (Safari):** open the deployed URL in **Safari** (not Chrome — on iOS
"Add to Home Screen" is reliable only from Safari's Share sheet) → Share → **Add to
Home Screen**. Launches full-screen, no address bar, works offline after the first
open. iOS needs the PNG `apple-touch-icon` (run `npm run icons` before deploying) or
it shows a page screenshot as the icon. Note: iOS may evict `localStorage` after
~7 days of the app going completely unused — regular use resets that timer, and the
Phase-4 account sync removes the risk entirely.

**Android (Chrome):** open the URL → ⋮ → **Add to Home screen** (or accept the
install prompt). Reads the SVG icon directly; PNGs are a nice-to-have.

## Updating

Edit `index.html`. On deploy, bump `CACHE` in `sw.js` (e.g. `buildup-v2`) so
returning devices pick up the new version instead of serving the old shell.

## Test

```bash
npm i --no-save jsdom
node test/e2e.js
```

## Not in this build (by design)

No social features, no child-to-child messaging, no public profiles, no leaderboards,
no accounts, no live AI, no native apps. See the product blueprint for the full
"what we refuse to build in V1" list. Parent accounts + progress sync + a guided AI
helper come in a later phase (that is when a backend — Supabase, plus a small service
on Railway/Fly for the AI proxy — enters the picture; today there is nothing to run
server-side).
