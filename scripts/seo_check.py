#!/usr/bin/env python3
"""
SEO guardrail — validates the static site on every push and fails the build
on real regressions. Run from the repo root:  python3 scripts/seo_check.py

Hard errors (exit 1):
  * a link to an internal page that doesn't exist (broken link)
  * invalid JSON-LD
  * a missing canonical, missing og:image, wrong <h1> count, over-length
    title/description — UNLESS the page is in ALLOW for that check.

Warnings (printed, never fail): orphan pages (0 internal inbound links).

Only indexable pages are checked (noindex pages and meta-refresh redirects
are skipped, plus the EXCLUDE list). Mirrors scripts/gen_sitemap.py.
"""
import os
import re
import sys
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://quinn.live"
EXCLUDE = {"/delete.html"}                       # indexable but intentionally out
TITLE_MAX = 62
DESC_MAX = 165
# per-page, per-check exemptions for legitimate cases
ALLOW = {
    "/": {"title_len"},                          # homepage brand tagline
    "/privacy.html": {"og_image"},
    "/terms.html": {"og_image"},
}

NOINDEX = re.compile(r'<meta[^>]+name=["\']robots["\'][^>]*noindex', re.I)
REFRESH = re.compile(r'<meta[^>]+http-equiv=["\']refresh["\']', re.I)


def loc_for(rel):
    rel = rel.replace(os.sep, "/")
    if rel == "index.html":
        return "/"
    if rel.endswith("/index.html"):
        return "/" + rel[:-len("index.html")]
    return "/" + rel


def discover():
    pages = {}  # loc -> abspath
    for dp, dn, fn in os.walk(ROOT):
        dn[:] = [d for d in dn if d not in (".git", ".github", "scripts", "media", ".well-known")]
        for name in fn:
            if not name.endswith(".html"):
                continue
            fp = os.path.join(dp, name)
            rel = os.path.relpath(fp, ROOT).replace(os.sep, "/")
            if rel.count("/") and name != "index.html":
                continue
            loc = loc_for(rel)
            if loc in EXCLUDE:
                continue
            html = open(fp, encoding="utf-8", errors="ignore").read()
            if NOINDEX.search(html) or REFRESH.search(html):
                continue
            pages[loc] = fp
    return pages


def target_path(href):
    t = href.split("#")[0].split("?")[0]
    if t.startswith(BASE):
        t = t[len(BASE):]
    if not t.startswith("/"):
        return None                              # external / mailto / relative
    if t == "/":
        return os.path.join(ROOT, "index.html")
    if "." in os.path.basename(t):
        return os.path.join(ROOT, t.strip("/"))
    return os.path.join(ROOT, t.strip("/"), "index.html")


def main():
    pages = discover()
    errors, warnings = [], []
    inbound = {loc: 0 for loc in pages}

    for loc, fp in sorted(pages.items()):
        h = open(fp, encoding="utf-8", errors="ignore").read()
        allow = ALLOW.get(loc, set())

        def err(kind, msg):
            if kind not in allow:
                errors.append(f"{loc}: {msg}")

        # JSON-LD
        for m in re.findall(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', h, re.S):
            try:
                json.loads(m)
            except Exception as e:
                errors.append(f"{loc}: invalid JSON-LD ({e})")

        # canonical / og:image / h1
        if not re.search(r'rel=["\']canonical["\']', h, re.I):
            err("canonical", "missing <link rel=canonical>")
        if not re.search(r'property=["\']og:image["\']', h, re.I):
            err("og_image", "missing og:image")
        h1 = len(re.findall(r"<h1[ >]", h, re.I))
        if h1 != 1:
            err("h1", f"has {h1} <h1> (want 1)")

        # title / description length
        t = re.search(r"<title>(.*?)</title>", h, re.S)
        if t and len(t.group(1)) > TITLE_MAX:
            err("title_len", f"title {len(t.group(1))} chars (>{TITLE_MAX})")
        d = re.search(r'<meta name="description" content="([^"]*)"', h, re.I)
        if d and len(d.group(1)) > DESC_MAX:
            err("desc_len", f"description {len(d.group(1))} chars (>{DESC_MAX})")

        # internal links (resolve + tally inbound)
        for href in re.findall(r'href="([^"]+)"', h):
            tp = target_path(href)
            if tp is None:
                continue
            if not os.path.exists(tp):
                errors.append(f"{loc}: broken link -> {href}")
            else:
                dest = loc_for(os.path.relpath(tp, ROOT).replace(os.sep, "/"))
                if dest in inbound and dest != loc:
                    inbound[dest] += 1

    for loc, n in sorted(inbound.items()):
        if n == 0 and loc != "/":
            warnings.append(f"{loc}: orphan (0 internal inbound links)")

    print(f"Checked {len(pages)} indexable pages.")
    for w in warnings:
        print(f"  WARN  {w}")
    if errors:
        print(f"\n{len(errors)} ERROR(S):")
        for e in errors:
            print(f"  ERROR {e}")
        sys.exit(1)
    print(f"\nOK — no errors ({len(warnings)} warning(s)).")


if __name__ == "__main__":
    main()
