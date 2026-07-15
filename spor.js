/* ==========================================================================
   Spor — first-party analytics for quinn.live (app: website-web)
   --------------------------------------------------------------------------
   Self-hosted product analytics: https://spor.quinn.live/v1/docs
   Ships a public, write-only key by design — it can only POST events, never
   read them, so it is safe to embed in this static site.

   Implements docs/quinn-live-tracking.md (videoclone repo):
     • q_aid identity cookie on .quinn.live — shared key that lets Clone join
       this site's visitor to the account they create on clone.quinn.live
     • page_view on every page, with path + referrer + parsed UTMs
     • every link into clone.quinn.live is tagged with utm_* + qid (the linker)
     • clone_cta_clicked / demo_played / faq_expanded custom actions

   Manual events anywhere on the site:   sporTrack('name', { ... })
                                         (alias: window.spor.track)
   The visitor's linker id:              window.qid()
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    endpoint: 'https://spor.quinn.live/v1/events',
    key: 'trk_pub_8ebe8f2fdf3d1944b822b03200a50d19e171cbb11748d794', // public write-only key, scoped to website-web
    app_id: 'website-web', // the app the key is scoped to (spec drafted it as "quinn-web")
    release: 'prod',
    // production only on the live host, so local/preview traffic stays out of the numbers
    environment: /(^|\.)quinn\.live$/.test(location.hostname) ? 'production' : 'development',
    batchMax: 20,       // flush once this many events are queued
    flushMs: 4000,      // …or this long after the first queued event
    maxRetries: 5       // drop a stuck batch after this many failed sends
  };

  // Bail quietly on ancient browsers rather than throwing on the page.
  if (!window.fetch || !window.localStorage) return;

  // ---- ids ------------------------------------------------------------------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0, v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function readCookie(n) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeCookie(n, v, maxAge) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    // domain=.quinn.live so it's first-party to clone.quinn.live too (same site).
    document.cookie = n + '=' + encodeURIComponent(v) +
      '; path=/; domain=.quinn.live; max-age=' + maxAge + '; SameSite=Lax' + secure;
  }
  // The visitor's one durable id, shared with clone.quinn.live via the cookie.
  // Seeded from the previous tracker's localStorage id so returning visitors
  // keep the identity their historical events were recorded under. Also kept
  // in localStorage so the id stays stable even where the .quinn.live cookie
  // can't be written (localhost, previews).
  var ANON_ID = (function () {
    var id = readCookie('q_aid');
    if (!id) { try { id = localStorage.getItem('spor_anon') || null; } catch (e) { id = null; } }
    if (!id) id = uuid();
    writeCookie('q_aid', id, 365 * 24 * 60 * 60);
    try { localStorage.setItem('spor_anon', id); } catch (e) {}
    return id;
  })();
  function anonId() { return ANON_ID; }
  function sessionId() {
    try {
      var v = sessionStorage.getItem('spor_session');
      if (!v) { v = uuid(); sessionStorage.setItem('spor_session', v); }
      return v;
    } catch (e) { return uuid(); }
  }
  var SESSION_ID = sessionId();
  window.qid = anonId; // used by the CTA-link builder + the homepage paste bar

  // ---- queue (persisted so same-site navigations don't lose events) ---------
  var QKEY = 'spor_queue';
  var queue = [];
  try { queue = JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch (e) { queue = []; }
  var retries = 0, timer = null;

  function saveQueue() {
    try { localStorage.setItem(QKEY, JSON.stringify(queue.slice(0, 200))); } catch (e) {}
  }

  function track(name, props) {
    if (!name) return;
    queue.push({
      name: String(name),
      ts: new Date().toISOString(),
      idempotency_key: uuid(),
      props: props || {}
    });
    saveQueue();
    if (queue.length >= CONFIG.batchMax) flush();
    else if (!timer) timer = setTimeout(flush, CONFIG.flushMs);
  }
  window.sporTrack = track; // the spec's name for it

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;

    var batch = queue.slice(0, 500);
    var body = JSON.stringify({
      app_id: CONFIG.app_id,
      release: CONFIG.release,
      environment: CONFIG.environment,
      session_id: SESSION_ID,
      anon_id: ANON_ID,
      events: batch
    });

    // keepalive lets the request finish even as the page navigates away
    // (essential for clone_cta_clicked, which fires right before we leave for the app).
    fetch(CONFIG.endpoint, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + CONFIG.key
      },
      body: body
    }).then(function (res) {
      if (res.ok || res.status === 202) {
        queue.splice(0, batch.length);   // dedup on the server covers any double-send
        retries = 0;
        saveQueue();
        if (queue.length) flush();        // more piled up while we were sending
      } else {
        retry();
      }
    }).catch(retry);
  }

  function retry() {
    retries++;
    if (retries > CONFIG.maxRetries) { queue = []; retries = 0; saveQueue(); return; }
    if (!timer) timer = setTimeout(flush, CONFIG.flushMs * retries); // back off
  }

  // ---- helpers --------------------------------------------------------------
  function paramsOf(search) {
    var out = {}, q = (search || '').replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach(function (pair) {
      var i = pair.indexOf('='), k = i < 0 ? pair : pair.slice(0, i);
      var v = i < 0 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      if (k) out[decodeURIComponent(k)] = v;
    });
    return out;
  }
  function pageType(path) {
    if (/\/clone\/formats\/[^/]+\/?$/.test(path)) return 'format';
    if (/\/clone\/formats\/?$/.test(path)) return 'formats_hub';
    if (/\/clone\/vs\/[^/]+\/?$/.test(path)) return 'comparison';
    if (/\/clone\/vs\/?$/.test(path)) return 'comparison_hub';
    if (/\/clone\/how-it-works\/?$/.test(path)) return 'how_it_works';
    if (/\/clone\/answers\/?$/.test(path)) return 'answers';
    if (/-alternative\/?$/.test(path)) return 'alternative';
    if (/^\/photoshoots\/?$/.test(path)) return 'photoshoots';
    if (/^\/(index\.html)?$/.test(path)) return 'home';
    if (/\.html$/.test(path)) return 'doc';
    return 'other';
  }
  function slug(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }

  // ---- auto: page_view ------------------------------------------------------
  var utm = paramsOf(location.search);
  track('page_view', {
    path: location.pathname,
    title: document.title,
    referrer: document.referrer || null,
    page_type: pageType(location.pathname),
    utm_source: utm.utm_source || null,
    utm_medium: utm.utm_medium || null,
    utm_campaign: utm.utm_campaign || null,
    utm_content: utm.utm_content || null,
    utm_term: utm.utm_term || null
  });

  // ---- the critical handshake: tag every link into Clone with utm_* + qid ---
  // Pages already carry per-page utm_source/utm_content on these links; keep
  // those (they're more granular than a static default) and only fill gaps.
  function tagCtas() {
    var links = document.querySelectorAll('a[href*="clone.quinn.live"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i], url;
      try { url = new URL(a.href); } catch (e) { continue; }
      if (!url.searchParams.get('utm_source')) url.searchParams.set('utm_source', 'quinn_home');
      url.searchParams.set('utm_medium', 'referral');
      url.searchParams.set('utm_campaign', 'launch_app');
      var placement = a.getAttribute('data-placement') || url.searchParams.get('utm_content') || 'unknown';
      url.searchParams.set('utm_content', placement);
      url.searchParams.set('qid', ANON_ID); // the visitor identity linker
      a.href = url.toString();
    }
  }

  // ---- auto: clone_cta_clicked (outbound to the app = conversion intent) ----
  function onCta(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('clone.quinn.live') === -1) return;

    var linkUtm = {};
    try { linkUtm = paramsOf(new URL(href, location.href).search); } catch (err) {}
    track('clone_cta_clicked', {
      placement: linkUtm.utm_content || null,   // nav | cta | footer | wall | pricing | …
      link_source: linkUtm.utm_source || null,  // which page the CTA is labelled with
      text: (a.textContent || '').trim().slice(0, 80),
      path: location.pathname,
      page_type: pageType(location.pathname),
      qid: ANON_ID
    });
    flush(); // send now — the browser is about to leave this page
  }
  document.addEventListener('click', onCta, true);
  document.addEventListener('auxclick', onCta, true); // middle-click / open-in-new-tab

  // ---- custom actions -------------------------------------------------------
  function wireCustomActions() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      (function (v, idx) {
        if (v.autoplay) return; // background reels; a play there isn't intent
        var fired = false;
        v.addEventListener('play', function () {
          if (fired) return; fired = true; // once per page view
          var name = v.id || slug((v.currentSrc || v.src || '').split('/').pop().split('.')[0]) || 'video_' + idx;
          track('demo_played', { video: name, path: location.pathname });
        });
      })(videos[i], i);
    }
    var faqs = document.querySelectorAll('details');
    for (var j = 0; j < faqs.length; j++) {
      (function (d) {
        d.addEventListener('toggle', function () {
          if (!d.open) return;
          var s = d.querySelector('summary');
          track('faq_expanded', { question: slug(s ? s.textContent : ''), path: location.pathname });
        });
      })(faqs[j]);
    }
  }

  function onReady() { tagCtas(); wireCustomActions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  // ---- flush on the way out -------------------------------------------------
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', function () { flush(); });

  // ---- public API -----------------------------------------------------------
  window.spor = {
    track: track,
    flush: flush,
    identify: function () { /* no login on the marketing site; kept for API compat */ },
    anonId: anonId
  };

  // ---- error reporting (GlitchTip via the standard Sentry store API) --------
  // DSN: https://de710d0648c7484c9ea0dedb3e5b0b12@spor.quinn.live/8
  var ERR_ENDPOINT = 'https://spor.quinn.live/api/8/store/?sentry_version=7&sentry_key=de710d0648c7484c9ea0dedb3e5b0b12';
  var errBudget = 5; // first few errors per page view are plenty; never flood

  function reportError(message, extra) {
    if (errBudget-- <= 0) return;
    try {
      fetch(ERR_ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: uuid().replace(/-/g, ''),
          timestamp: new Date().toISOString(),
          platform: 'javascript',
          level: 'error',
          environment: CONFIG.environment,
          release: CONFIG.release,
          request: { url: location.href, headers: { 'User-Agent': navigator.userAgent } },
          exception: { values: [{
            type: (extra && extra.type) || 'Error',
            value: String(message).slice(0, 500),
            stacktrace: extra && extra.stack ? { frames: [{ filename: extra.stack.slice(0, 1000) }] } : undefined
          }] },
          tags: { anon_id: ANON_ID, path: location.pathname }
        })
      }).catch(function () {});
    } catch (e) { /* never throw from error reporting */ }
  }

  window.addEventListener('error', function (e) {
    if (!e) return;
    // resource-load failures (img/script) have no error object; skip those
    if (!e.message && !e.error) return;
    reportError(e.message || (e.error && e.error.message) || 'unknown error', {
      type: (e.error && e.error.name) || 'Error',
      stack: (e.error && e.error.stack) || (e.filename ? e.filename + ':' + e.lineno + ':' + e.colno : '')
    });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    reportError((r && (r.message || String(r))) || 'unhandled promise rejection', {
      type: (r && r.name) || 'UnhandledRejection',
      stack: (r && r.stack) || ''
    });
  });

  // Anything queued from a previous page in this tab goes out now.
  if (queue.length > 1) flush();
})();
