# quinn-website

Placeholder static site for Quinn, served via GitHub Pages.

## Structure

- `index.html` — single-page "coming soon" placeholder (self-contained: inline CSS, no build step)
- `.nojekyll` — disables Jekyll processing so files are served as-is

## Local preview

It's plain static HTML, so just open the file:

```sh
open index.html
```

Or serve it over HTTP:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deployment

Pushing to `main` publishes automatically via **GitHub Pages** (Settings → Pages, deploy from `main` / root).
