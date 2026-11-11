import { sb } from './supabase.js';
import { rankedAds, rankedWanted, newSeed, lastDistrict } from './ranking.js';
import { initPage, loadRef, favSet, qs, esc, adCard, observeCards, adSkeletons, optionList, icon, catArt, errorBox, errorToast, wantedCard, saveList, readList, cameBack, releaseHeld } from './common.js';

const BATCH = 16;
// back from an ad: the same feed at the same spot, straight from this tab's memory (kept 5 minutes)
const back = cameBack() ? readList('home') : null;
// older than that: ask again for as many ads in the same order, then return to the same spot
const SPOT = 'rs:home';
let spot = null;
if (cameBack() && !back) { try { spot = JSON.parse(sessionStorage.getItem(SPOT) || 'null'); } catch { /* ignore */ } }
try { history.scrollRestoration = 'manual'; } catch { /* not supported */ }
const seed = back?.seed || spot?.seed || newSeed(); // new order on every visit and refresh, steady while pressing Load more and coming back
// ask the database for everything straight away, while the menu is still being drawn
loadRef();
let firstBatch = back ? Promise.resolve({ data: back.items, count: back.total, fetched: back.fetched })
  : rankedAds({ seed, districtId: lastDistrict() }, 0, spot?.n > 0 ? Math.min(spot.n, BATCH * 6) : BATCH);
const wantedP = back ? Promise.resolve({ data: back.wanted || [] }) : rankedWanted({ seed }, 0, 3);
[firstBatch, wantedP].forEach((p) => p.catch(() => {})); // their errors are handled where they are used below
const { session } = await initPage('home');
const latestGrid = qs('#latest-grid');
latestGrid.setAttribute('aria-busy', 'true');
// the page already shows the same placeholders from index.html; this only fills them in if they are missing
if (!latestGrid.querySelector('.sk-card')) latestGrid.innerHTML = adSkeletons(8);

qs('.searchbar').insertAdjacentHTML('afterbegin', icon('search'));

try {
  const ref = await loadRef();
  // the homepage row shows All ads plus every main category (scroll sideways for the rest)
  const homeMains = ref.mains;
  qs('#h-dist').innerHTML = optionList(ref.allDistricts, '', 'All districts');
  qs('#h-dist').onchange = () => qs('#home-search').submit();

  const tile = (href, name, art, extra = '') => `<a class="cat-tile${extra}" href="${esc(href)}">${art}<strong>${esc(name)}</strong></a>`;
  qs('#cat-grid').removeAttribute('aria-hidden');
  qs('#cat-grid').innerHTML = tile('search.html', 'All ads', catArt('all'), ' all')
    + homeMains.map((c) => tile(`search.html?cat=${c.slug}`, c.name, catArt(c.slug), ` c-${esc(c.slug)}`)).join('');

  const row = qs('#cat-grid'), next = qs('#cat-next');
  next.innerHTML = icon('next');
  // the row drifts slowly sideways in an endless loop: hidden copies of the tiles follow the first set and a CSS
  // animation (app.css, cat-drift) slides them all left by one set, over and over. It pauses while the visitor
  // points at it, touches it or tabs through it, and stays still for reduced motion.
  // the owner wants the slow drift (kept after the 2026-11-06 design clean-up); false stops it
  const DRIFT = true;
  const SPEED = 18; // pixels per second: slow enough not to pull the eye away from the page
  const n = row.children.length;
  const loop = DRIFT && !matchMedia('(prefers-reduced-motion: reduce)').matches && row.scrollWidth > row.clientWidth + 8;
  let loopW = 0;
  const measure = () => {
    if (!loop) return;
    loopW = row.children[n].offsetLeft - row.children[0].offsetLeft;
    row.style.setProperty('--loop', `${loopW}px`);
    row.style.setProperty('--dur', `${(loopW / SPEED).toFixed(1)}s`);
  };
  if (loop) {
    // enough copies that the row never runs out, even after swiping or pressing the arrow while it drifts
    const setW = row.scrollWidth;
    const copies = 1 + Math.ceil((setW + 2 * row.clientWidth) / setW);
    const first = [...row.children];
    for (let i = 0; i < copies; i++) {
      first.forEach((t) => {
        const copy = t.cloneNode(true);
        copy.setAttribute('aria-hidden', 'true');
        copy.tabIndex = -1;
        row.append(copy);
      });
    }
    measure();
    row.classList.add('looping');
    // tile widths change when the font arrives or the language is switched
    const ro = new ResizeObserver(measure);
    first.forEach((t) => ro.observe(t));
    // once a swipe or arrow scroll settles past the first set, step back one set: it looks exactly the same
    let settle = 0;
    row.addEventListener('scroll', () => {
      clearTimeout(settle);
      settle = setTimeout(() => { if (loopW && row.scrollLeft >= loopW) row.scrollLeft -= loopW; }, 200);
    }, { passive: true });
    // a finger on the row pauses it until a moment after it lifts
    let wait = 0;
    row.addEventListener('touchstart', () => { clearTimeout(wait); row.classList.add('held'); }, { passive: true });
    row.addEventListener('touchend', () => { wait = setTimeout(() => row.classList.remove('held'), 2500); }, { passive: true });
  }
  const updArrows = () => {
    next.hidden = !loop && row.scrollLeft + row.clientWidth >= row.scrollWidth - 8;
  };
  row.addEventListener('scroll', updArrows, { passive: true });
  window.addEventListener('resize', () => { measure(); updArrows(); });
  next.onclick = () => row.scrollBy({ left: row.clientWidth * 0.85, behavior: 'smooth' });
  updArrows();

  const favs = await favSet();
  // Promoted ads are switched off in the beta (no paid promotion yet): no Promoted row on the homepage.

  // newest wanted requests, drawn as soon as they arrive; the section stays hidden if there are none or the lookup fails
  let wantedItems = [];
  wantedP.then((w) => {
    if (w.data.length) {
      wantedItems = w.data;
      qs('#wanted-section').hidden = false;
      qs('#wanted-grid').innerHTML = w.data.map((r) => wantedCard(r, ref)).join('');
      observeCards(qs('#wanted-grid'));
    }
  }).catch((e) => console.error(e));

  let loaded = 0, total = 0;
  const items = [], shown = new Set();
  const moreBox = qs('#home-more'), moreBtn = qs('#home-more-btn');
  // remembered when the visitor opens an ad or leaves, for the Back button
  const remember = () => {
    if (!items.length) return;
    saveList('home', { seed, items, total, fetched: loaded, wanted: wantedItems, y: window.scrollY });
    try { sessionStorage.setItem(SPOT, JSON.stringify({ n: loaded, y: window.scrollY, seed })); } catch { /* storage unavailable */ }
  };
  latestGrid.addEventListener('click', (e) => { if (e.target.closest('a')) remember(); });
  window.addEventListener('pagehide', remember);
  async function loadBatch() {
    moreBtn.disabled = true; moreBtn.textContent = 'Loading';
    if (loaded) latestGrid.insertAdjacentHTML('beforeend', adSkeletons(4));
    const dropSkeletons = () => latestGrid.querySelectorAll('.sk-card').forEach((el) => el.remove());
    // the first batch was already asked for at the top of the page
    const req = firstBatch || rankedAds({ seed, districtId: lastDistrict() }, loaded, BATCH);
    firstBatch = null;
    let res;
    try { res = await req; } catch (error) { if (loaded) dropSkeletons(); moreBtn.disabled = false; moreBtn.textContent = 'Try again'; throw error; }
    const { data, count } = res;
    moreBtn.disabled = false; moreBtn.textContent = 'Load more';
    dropSkeletons();
    latestGrid.removeAttribute('aria-busy');
    total = count || 0;
    // the ranking can shift a little between batches: an ad already on screen is never shown twice
    const fresh = data.filter((a) => !shown.has(a.id));
    fresh.forEach((a) => { shown.add(a.id); items.push(a); });
    latestGrid.insertAdjacentHTML('beforeend', fresh.map((a) => adCard(a, ref, favs)).join(''));
    loaded += res.fetched ?? data.length; // the next batch starts where the database stopped
    observeCards(latestGrid);
    moreBox.classList.toggle('hidden', loaded >= total);
    if (!total) latestGrid.innerHTML = '<div class="card empty" style="grid-column:1/-1">' + icon('box') + '<h3>No ads yet</h3><p class="muted">Be the first vendor to post a rental.</p><a class="btn" href="login.html">Sign up</a></div>';
  }
  moreBtn.onclick = () => loadBatch().catch((e) => errorToast(e, 'load more rentals'));
  await loadBatch();
  const y = back ? back.y : spot?.y;
  if (y) {
    // straight back to the same spot, cards already visible (no fade-in jump)
    document.querySelectorAll('main .listing-card').forEach((c) => c.classList.add('in'));
    window.scrollTo(0, y);
  }
  releaseHeld();
} catch (err) {
  releaseHeld();
  latestGrid.removeAttribute('aria-busy');
  latestGrid.innerHTML = errorBox(err, 'load rentals', { title: 'We could not load rentals' });
}

// opened from another page with #how: jump again once the content above has loaded.
// The hash is removed afterwards so refreshing the page does not jump back to How it works.
if (location.hash === '#how') {
  const clearHash = () => { try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ } };
  const navType = performance.getEntriesByType?.('navigation')?.[0]?.type || 'navigate';
  if (navType === 'reload' || navType === 'back_forward') {
    clearHash();
  } else {
    const goHow = () => document.getElementById('how')?.scrollIntoView();
    let moved = false;
    ['wheel', 'touchstart', 'keydown'].forEach((t) => window.addEventListener(t, () => { moved = true; }, { once: true, passive: true }));
    goHow();
    // photos finish loading and move the page, so jump again unless the visitor already scrolled
    [600, 1800].forEach((ms) => setTimeout(() => { if (!moved) goHow(); }, ms));
    setTimeout(clearHash, 2000);
  }
}