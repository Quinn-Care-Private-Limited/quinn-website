# quinn-website

Marketing site for **Quinn** — the AI studio for fashion brands. Two offerings:

1. **On-model shots** — turn flatlays / ghost-mannequin shots into photoreal on-model imagery.
2. **Catalog video** — turn existing catalog shoots (or just flatlays) into social-ready video.

Served as a static site via **GitHub Pages**.

## Structure

- `index.html` — single-page landing site, fully self-contained (inline CSS + JS, custom SVG art, before/after slider). No build step, no dependencies.
- `.nojekyll` — disables Jekyll processing so files are served as-is.
- `404.html` — page-not-found, and the **referral redirector**: `quinn.live/r/CODE`
  links land here (GitHub Pages has no routing) and instantly forward to the
  Play Store with the code attached as the install referrer (`quinn_ref`),
  which the Sage app auto-fills at signup.
- `.well-known/` — app-verification files so `quinn.live/r/*` links open the
  Sage app directly when it's installed:
  - `assetlinks.json` (Android App Links). Currently holds the **debug**
    signing cert. **At launch, add** the Play App Signing SHA-256 (Play Console
    → Setup → App integrity) alongside it.
  - `apple-app-site-association` (iOS Universal Links, team `B8FN2NXFHZ`).
  - Both are per-app extensible: future Quinn apps claim their own path prefix
    (`/r/*` belongs to Sage) and add entries to these files.

## Local preview

It's plain static HTML — just open it:

```sh
open index.html
```

Or serve over HTTP:

```sh
python3 -m http.server 8137
# then visit http://localhost:8137
```

## Deployment

Pushing to `main` publishes automatically via **GitHub Pages** (deploy from `main` / root).
Live at https://quinn-care-private-limited.github.io/quinn-website/

## Verifying the referral links

```sh
curl -sI https://quinn.live/.well-known/assetlinks.json           # 200, json
curl -sI https://quinn.live/.well-known/apple-app-site-association
# On a device with a debug build of the Sage app:
adb shell pm get-app-links live.quinn.sage                        # → verified
adb shell am start -a android.intent.action.VIEW -d "https://quinn.live/r/TEST12"
```

## Editing notes

- Brand colors, fonts, and the signature gradient live in the `:root` CSS variables near the top of `index.html`.
- The hero is an interactive flatlay → on-model before/after slider; the on-model grid and catalog-video card are generated/animated SVG placeholders — swap them for real renders when assets are ready.
- The demo form is front-end only (shows a confirmation). Wire it to a real endpoint / Calendly and confirm the `hello@quinn.live` contact address before launch.
