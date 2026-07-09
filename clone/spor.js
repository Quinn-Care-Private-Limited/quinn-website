/* ==========================================================================
   Spor — first-party analytics for the Clone marketing site (app: clone-web)
   --------------------------------------------------------------------------
   Self-hosted product analytics: https://spor.quinn.live/v1/docs
   Ships a public, write-only key by design — it can only POST events, never
   read them, so it is safe to embed in this static page.

   What it does, with zero page changes:
     • page_view  — fired once per page, with path + referrer + parsed UTMs
     • cta_click  — fired when a visitor clicks a "start" link to
                    clone.quinn.live/app (our conversion intent signal)

   Manual events anywhere on the site:   window.spor.track('name', { ... })
   Attach a user after signup:           window.spor.identify('user-id')
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = {
    endpoint: 'https://spor.quinn.live/v1/events',
    key: 'trk_pub_9d518245b6933420af939724b0741d611d91db9ecd22a29d', // public write-only key, scoped to clone-web
    app_id: 'clone-web',
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
  function persistentId(store, k) {
    try {
      var v = store.getItem(k);
      if (!v) { v = uuid(); store.setItem(k, v); }
      return v;
    } catch (e) { return uuid(); }
  }
  var ANON_ID = persistentId(localStorage, 'spor_anon');       // one visitor, across sessions
  var SESSION_ID = persistentId(sessionStorage, 'spor_session'); // one visit, per tab
  var USER_ID = null;
  try { USER_ID = localStorage.getItem('spor_user') || null; } catch (e) {}

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

  function flush(opts) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!queue.length) return;

    var batch = queue.slice(0, 500);
    var body = JSON.stringify({
      app_id: CONFIG.app_id,
      environment: CONFIG.environment,
      session_id: SESSION_ID,
      anon_id: ANON_ID,
      user_id: USER_ID || undefined,
      events: batch
    });

    // keepalive lets the request finish even as the page navigates away
    // (essential for cta_click, which fires right before we leave for the app).
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
    if (/\/clone\/?$/.test(path)) return 'home';
    return 'other';
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

  // ---- auto: cta_click (outbound to the app = conversion intent) ------------
  function onCta(e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (href.indexOf('clone.quinn.live/app') === -1) return;

    var linkUtm = {};
    try { linkUtm = paramsOf(new URL(href, location.href).search); } catch (err) {}
    track('cta_click', {
      href: href,
      placement: linkUtm.utm_content || null,   // nav | cta | footer | wall | pricing
      link_source: linkUtm.utm_source || null,  // which page the CTA is labelled with
      text: (a.textContent || '').trim().slice(0, 80),
      path: location.pathname,
      page_type: pageType(location.pathname)
    });
    flush(); // send now — the browser is about to leave this page
  }
  document.addEventListener('click', onCta, true);
  document.addEventListener('auxclick', onCta, true); // middle-click / open-in-new-tab

  // ---- flush on the way out -------------------------------------------------
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', function () { flush(); });

  // ---- public API -----------------------------------------------------------
  window.spor = {
    track: track,
    flush: flush,
    identify: function (userId) {
      USER_ID = userId ? String(userId) : null;
      try {
        if (USER_ID) localStorage.setItem('spor_user', USER_ID);
        else localStorage.removeItem('spor_user');
      } catch (e) {}
    },
    anonId: function () { return ANON_ID; }
  };

  // Anything queued from a previous page in this tab goes out now.
  if (queue.length > 1) flush();
})();
