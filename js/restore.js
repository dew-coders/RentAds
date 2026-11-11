/* Back button: put the list page straight back at the spot the visitor left, before the page is first drawn.
   The page scripts only run once supabase-js has downloaded, which is too late: the browser would show the top
   of the page for a moment and then jump. This small plain script runs while the page is still being read
   (load it at the end of <body>, with data-grid="<id of the list>"). It reserves the list's old height, filled
   with grey placeholders, and scrolls there; the page script then puts the real cards in the same place and calls
   releaseHeld() in js/common.js. */
(function () {
  var me = document.currentScript;
  var grid = me && document.getElementById(me.dataset.grid);
  if (!grid) return;
  try { history.scrollRestoration = 'manual'; } catch (e) { /* not supported */ }
  var key = 'rs:spot:' + location.pathname + location.search;

  function save() {
    try {
      sessionStorage.setItem(key, JSON.stringify({
        y: window.scrollY, h: grid.offsetHeight, d: document.documentElement.scrollHeight,
        n: grid.querySelectorAll('.listing-card').length,
      }));
    } catch (e) { /* storage unavailable */ }
  }
  grid.addEventListener('click', function (e) { if (e.target.closest('a')) save(); });
  window.addEventListener('pagehide', save);

  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (!nav || nav.type !== 'back_forward') return;
  var s = null;
  try { s = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { /* ignore */ }
  if (!s || !s.y) return;

  var sk = grid.querySelector('.sk-card, .sk-want');
  if (sk) for (var i = grid.children.length; i < s.n; i++) grid.appendChild(sk.cloneNode(true));
  grid.style.minHeight = s.h + 'px';
  document.body.style.minHeight = s.d + 'px';
  grid.setAttribute('data-held', '');
  document.body.setAttribute('data-held', '');
  window.scrollTo(0, s.y);
})();