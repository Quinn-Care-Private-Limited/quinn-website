/* Meta Pixel — Clone pages only.
 *
 * Two datasets are initialised, and both receive every event:
 *   1021072786989890  "Clone's market data" — the original, paired with the
 *                     Meta-hosted Conversions API.
 *   931040346691564   added 2026-07-27.
 *
 * fbq('track', …) dispatches to every initialised pixel, so PageView here — and
 * any custom event fired elsewhere on the page, e.g. the Lead events on the
 * landing page — reach both datasets automatically.
 *
 * To retire a dataset: delete its fbq('init', …) line below.
 * To send an event to one dataset only, use:
 *   fbq('trackSingle', '<pixel-id>', '<EventName>', { … });
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

fbq('init', '1021072786989890');
fbq('init', '931040346691564');
fbq('track', 'PageView');
