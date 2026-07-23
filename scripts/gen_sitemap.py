#!/usr/bin/env python3
"""
Regenerate sitemap.xml from the pages on disk.

Rules
-----
* One entry per page: the site root (index.html -> "/"), every directory
  index.html ("/dir/subdir/"), and top-level *.html pages ("/name.html").
* <lastmod> is the file's last git commit date (YYYY-MM-DD) — accurate and
  automatic. Falls back to today for an as-yet-uncommitted file.
* <changefreq>/<priority> are preserved from the existing sitemap when the URL
  is already listed (keeps any hand-tuning); new URLs get sensible defaults.
  Google largely ignores these two fields — <lastmod> is the one that matters.
* Excluded: anything that is noindex or a meta-refresh redirect (auto-detected),
  plus the explicit EXCLUDE list below.

Run from the repo root:  python3 scripts/gen_sitemap.py
"""
import os
import re
import subprocess
import datetime
import xml.etree.ElementTree as ET

BASE = "https://quinn.live"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITEMAP = os.path.join(ROOT, "sitemap.xml")

# Pages that are indexable but deliberately kept out of the sitemap.
# (noindex pages and meta-refresh redirects are excluded automatically.)
EXCLUDE = {"/delete.html"}

NOINDEX_RE = re.compile(r'<meta[^>]+name=["\']robots["\'][^>]*noindex', re.I)
REFRESH_RE = re.compile(r'<meta[^>]+http-equiv=["\']refresh["\']', re.I)


def loc_for(relpath):
    """Map a repo-relative html file path to its canonical site URL path."""
    relpath = relpath.replace(os.sep, "/")
    if relpath == "index.html":
        return "/"
    if relpath.endswith("/index.html"):
        return "/" + relpath[:-len("index.html")]  # keeps trailing slash
    return "/" + relpath  # top-level *.html


def is_excludable(fp):
    try:
        with open(fp, "r", encoding="utf-8", errors="ignore") as f:
            html = f.read()
    except OSError:
        return False
    return bool(NOINDEX_RE.search(html) or REFRESH_RE.search(html))


def git_date(relpath):
    try:
        out = subprocess.check_output(
            ["git", "-C", ROOT, "log", "-1", "--format=%cs", "--", relpath],
            stderr=subprocess.DEVNULL,
        ).decode().strip()
    except subprocess.CalledProcessError:
        out = ""
    return out or datetime.date.today().isoformat()


def discover():
    pages = {}  # loc -> relpath
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in (".git", ".github", "scripts", "media", ".well-known")]
        for name in filenames:
            if not name.endswith(".html"):
                continue
            fp = os.path.join(dirpath, name)
            rel = os.path.relpath(fp, ROOT)
            # only root-level *.html or */index.html become URLs
            if rel.replace(os.sep, "/").count("/") == 0 or name == "index.html":
                loc = loc_for(rel)
                if loc in EXCLUDE:
                    continue
                if is_excludable(fp):
                    continue
                pages[loc] = rel.replace(os.sep, "/")
    return pages


def load_existing():
    meta = {}  # loc(path) -> (changefreq, priority)
    if not os.path.exists(SITEMAP):
        return meta
    ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    try:
        tree = ET.parse(SITEMAP)
    except ET.ParseError:
        return meta
    for url in tree.getroot().findall("s:url", ns):
        loc = url.findtext("s:loc", default="", namespaces=ns).strip()
        if not loc.startswith(BASE):
            continue
        path = loc[len(BASE):] or "/"
        cf = url.findtext("s:changefreq", default="", namespaces=ns).strip() or None
        pr = url.findtext("s:priority", default="", namespaces=ns).strip() or None
        meta[path] = (cf, pr)
    return meta


def defaults_for(path):
    if path == "/":
        return ("weekly", "1.0")
    if path.endswith(".html"):
        return ("yearly", "0.3")
    return ("monthly", "0.7")


def main():
    pages = discover()
    existing = load_existing()

    rows = []
    for path in sorted(pages, key=lambda p: (p != "/", p)):
        rel = pages[path]
        cf, pr = existing.get(path, (None, None))
        if not cf or not pr:
            dcf, dpr = defaults_for(path)
            cf = cf or dcf
            pr = pr or dpr
        rows.append((BASE + path, git_date(rel), cf, pr))

    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, cf, pr in rows:
        out.append("  <url><loc>%s</loc><lastmod>%s</lastmod>"
                   "<changefreq>%s</changefreq><priority>%s</priority></url>"
                   % (loc, lastmod, cf, pr))
    out.append("</urlset>")
    out.append("")
    content = "\n".join(out)

    with open(SITEMAP, "w", encoding="utf-8") as f:
        f.write(content)
    print("Wrote %d URLs to sitemap.xml" % len(rows))


if __name__ == "__main__":
    main()
