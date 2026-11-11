import { rankedAds, newSeed, noteDistrict } from './ranking.js';
import { PAGE_SIZE } from './config.js';
import { initPage, loadRef, favSet, qs, qsa, esc, adCard, observeCards, adSkeletons, optionList, setTitle, icon, errorBox, errorToast, saveList, readList, releaseHeld, floatingApply } from './common.js';

loadRef(); // starts the download while the menu is drawn
await initPage('browse');
const ref = await loadRef();
const form = qs('#filter-form');
const results = qs('#results');
const moreBox = qs('#more'), moreBtn = qs('#more-btn');
const KEYS = ['q', 'cat', 'sub', 'prov', 'dist', 'city', 'min', 'max', 'sort'];
const getParams = () => new URLSearchParams(location.search);
const stateKey = () => `rs:search:${location.search}`;

// we restore scroll ourselves, instantly, only when coming back from an ad
try { history.scrollRestoration = 'manual'; } catch { /* not supported */ }
const navType = performance.getEntriesByType?.('navigation')?.[0]?.type || 'navigate';

/* ---- fill the filter form from the URL ---- */
function syncForm() {
  const p = getParams();
  const val = (k) => p.get(k) || '';
  form.q.value = val('q');
  form.min.value = val('min');
  form.max.value = val('max');
  form.sort.value = val('sort');
  form.cat.innerHTML = optionList(ref.mains.map((c) => ({ id: c.slug, name: c.name })), val('cat'), 'All categories');
  const main = ref.catBySlug.get(val('cat'));
  qs('#sub-field').classList.toggle('hidden', !main);
  form.sub.innerHTML = main ? optionList(ref.subsOf(main.id).map((c) => ({ id: c.slug, name: c.name })), val('sub'), 'All in ' + main.name) : '';
  form.prov.innerHTML = optionList(ref.provinces, val('prov'), 'All provinces');
  const dists = val('prov') ? ref.districtsOf(+val('prov')) : ref.allDistricts;
  form.dist.innerHTML = optionList(dists, val('dist'), 'All districts');
  form.city.innerHTML = val('dist') ? optionList(ref.citiesOf(+val('dist')), val('city'), 'All cities') : '<option value="">Choose a district first</option>';
  form.city.disabled = !val('dist');
}

form.cat.onchange = () => {
  const main = ref.catBySlug.get(form.cat.value);
  qs('#sub-field').classList.toggle('hidden', !main);
  form.sub.innerHTML = main ? optionList(ref.subsOf(main.id).map((c) => ({ id: c.slug, name: c.name })), '', 'All in ' + main.name) : '';
};
form.prov.onchange = () => {
  const dists = form.prov.value ? ref.districtsOf(+form.prov.value) : ref.allDistricts;
  form.dist.innerHTML = optionList(dists, '', 'All districts');
  form.city.innerHTML = '<option value="">Choose a district first</option>';
  form.city.disabled = true;
};
form.dist.onchange = () => {
  if (form.dist.value) {
    const d = ref.locById.get(+form.dist.value);
    if (d && !form.prov.value) form.prov.value = d.parent_id;
    form.city.innerHTML = optionList(ref.citiesOf(+form.dist.value), '', 'All cities');
    form.city.disabled = false;
  } else {
    form.city.innerHTML = '<option value="">Choose a district first</option>';
    form.city.disabled = true;
  }
};

function formToParams() {
  const p = new URLSearchParams();
  KEYS.forEach((k) => { const v = (form[k].value || '').trim(); if (v) p.set(k, v); });
  return p;
}
const closeFilters = () => { qs('#filters').classList.remove('open'); document.body.classList.remove('locked'); qs('#filters-toggle').setAttribute('aria-expanded', 'false'); };
function go(params) {
  const s = params.toString();
  history.pushState({}, '', s ? `?${s}` : location.pathname);
  closeFilters();
  window.scrollTo(0, 0);
  run(false);
}
const checkApply = floatingApply(form, formToParams);
form.onsubmit = (e) => { e.preventDefault(); go(formToParams()); };
qs('#clear-btn').onclick = () => go(new URLSearchParams());
qs('#filters-toggle').onclick = (e) => {
  qs('#filters').classList.add('open'); document.body.classList.add('locked');
  e.currentTarget.setAttribute('aria-expanded', 'true');
};
qs('#filters-close').onclick = closeFilters;
window.addEventListener('popstate', () => run(true));

/* ---- active filter chips ---- */
function renderChips(p) {
  const chips = [];
  const add = (key, label, also = []) => chips.push({ key, label, also });
  if (p.get('q')) add('q', `"${p.get('q')}"`);
  const main = ref.catBySlug.get(p.get('cat'));
  if (main) add('cat', main.name, ['sub']);
  const sub = ref.catBySlug.get(p.get('sub'));
  if (sub && main) add('sub', sub.name);
  if (p.get('prov')) add('prov', ref.locById.get(+p.get('prov'))?.name || 'Province');
  if (p.get('dist')) add('dist', ref.locById.get(+p.get('dist'))?.name || 'District', ['city']);
  if (p.get('city')) add('city', ref.locById.get(+p.get('city'))?.name || 'City');
  if (p.get('min') || p.get('max')) add('min', `Rs ${p.get('min') || 0} to ${p.get('max') || 'any'}`, ['max']);
  qs('#active-chips').innerHTML = chips.map((c, i) =>
    `<span class="chip on">${esc(c.label)} <button type="button" data-multi data-chip="${i}" aria-label="Remove filter ${esc(c.label)}">${icon('x', 'sm')}</button></span>`).join('');
  qsa('[data-chip]').forEach((b) => (b.onclick = () => {
    const c = chips[+b.dataset.chip];
    const np = getParams();
    [c.key, ...c.also].forEach((k) => np.delete(k));
    go(np);
  }));
}

/* ---- the search itself: batches of 16 with a Load more button ---- */
let runId = 0, loaded = 0, total = 0, favs = new Set(), seed = newSeed();
let items = [], shown = new Set(); // what is on screen, for the Back button and to never show an ad twice
const listKey = () => `search:${location.search}`;

/* Best match first. A district or city the visitor picks is a filter (only ads from there).
   Price sorts keep the same smart matching, only in price order. */
const PRICE_SORTS = ['price_asc', 'price_desc'];
async function fetchPage(p, from, n) {
  const main = ref.catBySlug.get(p.get('cat'));
  const sub = ref.catBySlug.get(p.get('sub'));
  const sort = PRICE_SORTS.includes(p.get('sort')) ? p.get('sort') : null;
  return rankedAds({
    q: p.get('q'),
    categoryId: sub && main && sub.parent_id === main.id ? sub.id : main?.id,
    districtId: +p.get('dist') || null,
    provinceId: +p.get('prov') || null,
    cityId: +p.get('city') || null,
    min: p.get('min'), max: p.get('max'), sort, strictDistrict: true, seed,
  }, from, Math.min(n, 100));
}

function showError(err) {
  releaseHeld();
  results.innerHTML = errorBox(err, 'search rentals', { title: 'Search is not working right now', retry: 'retry' });
  qs('#retry').onclick = () => run(false);
  moreBox.classList.add('hidden');
}

async function run(restore) {
  const id = ++runId;
  const p = getParams();
  syncForm();
  checkApply();
  renderChips(p);
  // coming back: keep the placeholders js/restore.js laid out at the old spot
  if (!restore || !results.querySelector('.sk-card')) results.innerHTML = adSkeletons(8);
  moreBox.classList.add('hidden');
  loaded = 0;

  seed = newSeed(); // every new search or refresh gets a fresh order
  if (p.get('dist')) noteDistrict(p.get('dist'));
  let want = PAGE_SIZE, scrollY = 0;
  // back from an ad within 5 minutes: the same results straight from this tab's memory, no new search
  const kept = restore ? readList(listKey()) : null;
  if (restore && !kept) {
    // older than that: search again for as many results in the same order, then return to the same spot
    try {
      const saved = JSON.parse(sessionStorage.getItem(stateKey()) || 'null');
      if (saved && saved.n > 0) { want = Math.min(saved.n, PAGE_SIZE * 12); scrollY = saved.y || 0; if (saved.seed) seed = saved.seed; }
    } catch { /* ignore */ }
  }

  let res;
  if (kept) {
    seed = kept.seed; scrollY = kept.y || 0;
    res = { data: kept.items, count: kept.total, fetched: kept.fetched };
  } else {
    try { res = await fetchPage(p, 0, want); } catch (error) { if (id === runId) showError(error); return; }
  }
  if (id !== runId) return;
  const { data, count } = res;
  favs = await favSet();
  if (id !== runId) return;
  total = count || 0;
  items = []; shown = new Set();
  data.forEach((a) => { if (!shown.has(a.id)) { shown.add(a.id); items.push(a); } });
  const main = ref.catBySlug.get(p.get('cat'));
  const sub = ref.catBySlug.get(p.get('sub'));
  const title = main ? (sub ? sub.name : main.name) : 'Browse rentals';
  qs('#results-title').textContent = total ? `${total} rental${total > 1 ? 's' : ''}` : title;
  setTitle(title);

  releaseHeld(); // runs before anything is drawn, so the held height never shows
  if (!data.length) {
    results.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('search')}<h3>No rentals match these filters</h3>
      <p class="muted">Try a wider location, remove the price limit or search a different keyword.</p>
      <div class="row" style="justify-content:center"><button class="btn" data-multi id="empty-clear">Clear filters</button>
      <a class="btn btn-ghost" href="wanted-new.html">Cannot find it? Post a request</a></div></div>`;
    qs('#empty-clear').onclick = () => go(new URLSearchParams());
    return;
  }
  results.innerHTML = items.map((a) => adCard(a, ref, favs)).join('');
  loaded = res.fetched ?? data.length; // the next batch starts where the database stopped
  moreBox.classList.toggle('hidden', loaded >= total);
  if (scrollY) {
    qsa('.listing-card', results).forEach((c) => c.classList.add('in'));
    window.scrollTo(0, scrollY);
  }
  observeCards(results);
}

async function loadMore() {
  const id = runId;
  moreBtn.disabled = true; moreBtn.textContent = 'Loading';
  results.insertAdjacentHTML('beforeend', adSkeletons(4));
  let res, error = null;
  try { res = await fetchPage(getParams(), loaded, PAGE_SIZE); } catch (e) { error = e; }
  moreBtn.disabled = false; moreBtn.textContent = 'Load more';
  if (id !== runId) return;
  qsa('.sk-card', results).forEach((el) => el.remove());
  if (error) { errorToast(error, 'load more rentals'); return; }
  // the ranking can shift a little between batches: an ad already on screen is never shown twice
  const fresh = res.data.filter((a) => !shown.has(a.id));
  fresh.forEach((a) => { shown.add(a.id); items.push(a); });
  results.insertAdjacentHTML('beforeend', fresh.map((a) => adCard(a, ref, favs)).join(''));
  loaded += res.fetched ?? res.data.length;
  moreBox.classList.toggle('hidden', loaded >= total);
  observeCards(results);
}
moreBtn.onclick = loadMore;

// remember how far the visitor got, so closing an ad returns to the same spot
function remember() {
  try { sessionStorage.setItem(stateKey(), JSON.stringify({ n: loaded, y: window.scrollY, seed })); } catch { /* storage unavailable */ }
  if (items.length) saveList(listKey(), { seed, items, total, fetched: loaded, y: window.scrollY });
}
results.addEventListener('click', (e) => { if (e.target.closest('a')) remember(); });
window.addEventListener('pagehide', remember);

run(navType === 'back_forward');