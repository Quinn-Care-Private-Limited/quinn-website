/* Meta Pixel — Clone pages only.
 *
 * Dataset: 931040346691564 (sole dataset since 2026-07-27).
 * The previous pixel, 1021072786989890 "Clone's market data", has been retired.
 *
 * fbq('track', …) dispatches to every initialised pixel, so PageView here — and
 * any custom event fired elsewhere on the page, e.g. the Lead events on the
 * landing page — report to this dataset automatically.
 *
 * SECURITY: the Conversions API pairs with this pixel but is configured
 * server-side (Meta Events Manager, or the clone.quinn.live backend). A CAPI
 * access token must NEVER appear in this repository — it is public, and every
 * file here is served to the browser. See CAPI notes in the deploy docs.
 *
 * To send an event to one dataset only, use:
 *   fbq('trackSingle', '931040346691564', '<EventName>', { … });
 *
 * Loaded on the Clone landing page and its subpages. NOT loaded on
 * /shoppable-videos/*, /photoshoots/, or the Shoppable Videos comparison pages.
 */
!function (f, b, e, v, n, t, s) {
  if (f.fbq) return;
  n = f.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n;
  n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
  t = b.createElement(e); t.async = !0; t.src = v;
  s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', '931040346691564');
fbq('track', 'PageView');
