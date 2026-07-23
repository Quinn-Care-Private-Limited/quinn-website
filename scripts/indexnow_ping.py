#!/usr/bin/env python3
"""Ping IndexNow (Bing, Yandex, Seznam, Naver) with URLs changed today.

Reads sitemap.xml, selects <url> entries whose <lastmod> is today's UTC date,
and POSTs them to the IndexNow API in one call (the endpoint fans out to all
participating engines). Best-effort: prints and exits 0 even on failure so it
never blocks a deploy. Run from repo root: python3 scripts/indexnow_ping.py
"""
import os, re, json, datetime, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOST = "quinn.live"
ENDPOINT = "https://api.indexnow.org/indexnow"


def find_key():
    for fn in sorted(os.listdir(ROOT)):
        if re.fullmatch(r"[A-Za-z0-9-]{8,128}\.txt", fn) and fn not in ("robots.txt", "llms.txt"):
            return fn[:-4]
    return None


def main():
    key = find_key()
    if not key:
        print("IndexNow: no key file found; skipping.")
        return
    sm = os.path.join(ROOT, "sitemap.xml")
    if not os.path.exists(sm):
        print("IndexNow: no sitemap.xml; skipping.")
        return
    today = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    xml = open(sm, encoding="utf-8").read()
    urls = []
    for block in re.findall(r"<url>.*?</url>", xml, re.S):
        loc = re.search(r"<loc>([^<]+)</loc>", block)
        lm = re.search(r"<lastmod>([^<]+)</lastmod>", block)
        if loc and lm and lm.group(1).strip() == today:
            urls.append(loc.group(1).strip())
    if not urls:
        print("IndexNow: no URLs changed today; nothing to submit.")
        return
    urls = urls[:10000]
    payload = json.dumps({
        "host": HOST, "key": key,
        "keyLocation": "https://%s/%s.txt" % (HOST, key),
        "urlList": urls,
    }).encode()
    req = urllib.request.Request(ENDPOINT, data=payload,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            print("IndexNow: submitted %d URL(s) — HTTP %s" % (len(urls), r.status))
    except Exception as e:
        print("IndexNow: ping failed (non-fatal): %s" % e)


if __name__ == "__main__":
    main()
