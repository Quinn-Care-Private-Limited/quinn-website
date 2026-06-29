# quinn-website

Marketing site for **Quinn** — the AI studio for fashion brands. Two offerings:

1. **On-model shots** — turn flatlays / ghost-mannequin shots into photoreal on-model imagery.
2. **Catalog video** — turn existing catalog shoots (or just flatlays) into social-ready video.

Served as a static site via **GitHub Pages**.

## Structure

- `index.html` — single-page landing site, fully self-contained (inline CSS + JS, custom SVG art, before/after slider). No build step, no dependencies.
- `.nojekyll` — disables Jekyll processing so files are served as-is.

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

## Editing notes

- Brand colors, fonts, and the signature gradient live in the `:root` CSS variables near the top of `index.html`.
- The hero is an interactive flatlay → on-model before/after slider; the on-model grid and catalog-video card are generated/animated SVG placeholders — swap them for real renders when assets are ready.
- The demo form is front-end only (shows a confirmation). Wire it to a real endpoint / Calendly and confirm the `hello@quinn.live` contact address before launch.
