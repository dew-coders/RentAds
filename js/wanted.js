// Browse wanted requests: filters in the address bar, batches of 16 with a Load more button.
import { rankedWanted, newSeed } from './ranking.js';
import { PAGE_SIZE } from './config.js';
import {
  initPage, loadRef, qs, qsa, esc, wantedCard, observeCards, wantSkeletons, optionList, setTitle, icon, errorBox, errorToast,
  saveList, readList, cameBack, releaseHeld, floatingApply,
} from './common.js';

loadRef(); // starts the download while the menu is drawn
await initPage('wanted');
const ref = await loadRef();
const form = qs('#filter-form');
const results = qs('#results');
const moreBox = qs('#more'), moreBtn = qs('#more-btn');
const KEYS = ['q', 'cat', 'prov', 'dist', 'sort'];
const getParams = () => new URLSearchParams(location.search);

/* ---- fill the filter form from the address ---- */
function syncForm() {
  const p = getParams();
  const val = (k) => p.get(k) || '';
  form.q.value = val('q');
  form.sort.value = val('sort');
  form.cat.innerHTML = optionList(ref.mains.map((c) => ({ id: c.slug, name: c.name })), val('cat'), 'All categories');
  form.prov.innerHTML = optionList(ref.provinces, val('prov'), 'All provinces');
  const dists = val('prov') ? ref.districtsOf(+val('prov')) : ref.allDistricts;
  form.dist.innerHTML = optionList(dists, val('dist'), 'All districts');
}
form.prov.onchange = () => {
  const dists = form.prov.value ? ref.districtsOf(+form.prov.value) : ref.allDistricts;
  form.dist.innerHTML = optionList(dists, '', 'All districts');
};
form.dist.onchange = () => {
  const d = form.dist.value ? ref.locById.get(+form.dist.value) : null;
  if (d && !form.prov.value) form.prov.value = d.parent_id;
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
  run();
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
// we restore scroll ourselves, instantly, only when coming back from a request
try { history.scrollRestoration = 'manual'; } catch { /* not supported */ }

/* ---- active filter chips ---- */
function renderChips(p) {
  const chips = [];
  const add = (key, label, also = []) => chips.push({ key, label, also });
  if (p.get('q')) add('q', `"${p.get('q')}"`);
  const main = ref.catBySlug.get(p.get('cat'));
  if (main) add('cat', main.name);
  if (p.get('prov')) add('prov', ref.locById.get(+p.get('prov'))?.name || 'Province');
  if (p.get('dist')) add('dist', ref.locById.get(+p.get('dist'))?.name || 'District');
  qs('#active-chips').innerHTML = chips.map((c, i) =>
    `<span class="chip on">${esc(c.label)} <button type="button" data-multi data-chip="${i}" aria-label="Remove filter ${esc(c.label)}">${icon('x', 'sm')}</button></span>`).join('');
  qsa('[data-chip]').forEach((b) => (b.onclick = () => {
    const c = chips[+b.dataset.chip];
    const np = getParams();
    [c.key, ...c.also].forEach((k) => np.delete(k));
    go(np);
  }));
}

/* ---- the search itself ---- */
let runId = 0, loaded = 0, total = 0, seed = newSeed();
let items = [], shown = new Set(); // what is on screen, for the Back button and to never show a request twice
const listKey = () => `wanted:${location.search}`;
const spotKey = () => `rs:wanted:${location.search}`;

/* Best match first. A chosen district is a filter (only requests from there).
   "Ending soon" and "Highest budget" keep the same smart matching in their exact order. */
const SORTS = ['ending', 'budget'];
async function fetchPage(p, from, n) {
  const main = ref.catBySlug.get(p.get('cat'));
  const sort = SORTS.includes(p.get('sort')) ? p.get('sort') : null;
  return rankedWanted({ q: p.get('q'), categoryId: main?.id, districtId: +p.get('dist') || null, provinceId: +p.get('prov') || null, sort, strictDistrict: true, seed }, from, Math.min(n, 100));
}

const postBtn = '<a class="btn" href="wanted-new.html">Post a request</a>';

function showError(err) {
  releaseHeld();
  results.innerHTML = errorBox(err, 'load wanted requests', { title: 'We could not load requests', retry: 'retry' });
  qs('#retry').onclick = () => run();
  moreBox.classList.add('hidden');
}

async function run(restore = false) {
  const id = ++runId;
  seed = newSeed(); // fresh order for every new search or refresh
  const p = getParams();
  syncForm();
  checkApply();
  renderChips(p);
  // coming back: keep the placeholders js/restore.js laid out at the old spot
  if (!restore || !results.querySelector('.sk-want')) results.innerHTML = wantSkeletons(6);
  moreBox.classList.add('hidden');
  loaded = 0;

  // back from a request within 5 minutes: the same list at the same spot, straight from this tab's memory
  const kept = restore ? readList(listKey()) : null;
  let want = PAGE_SIZE, scrollY = 0;
  if (restore && !kept) {
    // older than that: ask again for as many requests in the same order, then return to the same spot
    try {
      const saved = JSON.parse(sessionStorage.getItem(spotKey()) || 'null');
      if (saved && saved.n > 0) { want = Math.min(saved.n, PAGE_SIZE * 6); scrollY = saved.y || 0; if (saved.seed) seed = saved.seed; }
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
  total = count || 0;
  items = []; shown = new Set();
  data.forEach((r) => { if (!shown.has(r.id)) { shown.add(r.id); items.push(r); } });
  qs('#results-title').textContent = total ? `${total} wanted request${total > 1 ? 's' : ''}` : 'Wanted requests';
  setTitle('Wanted');

  releaseHeld(); // runs before anything is drawn, so the held height never shows
  if (!data.length) {
    const filtered = [...p.keys()].length > 0;
    results.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('search')}<h3>${filtered ? 'No requests match these filters' : 'No requests yet'}</h3>
      <p class="muted">${filtered ? 'Try a wider location or a different keyword. Or be the first to ask for it.' : 'Be the first to post what you are looking for.'}</p>
      <div class="row" style="justify-content:center">${postBtn}${filtered ? '<button class="btn btn-ghost" data-multi id="empty-clear">Clear filters</button>' : ''}</div></div>`;
    qs('#empty-clear')?.addEventListener('click', () => go(new URLSearchParams()));
    return;
  }
  results.innerHTML = items.map((r) => wantedCard(r, ref)).join('');
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
  results.insertAdjacentHTML('beforeend', wantSkeletons(3));
  let res, error = null;
  try { res = await fetchPage(getParams(), loaded, PAGE_SIZE); } catch (e) { error = e; }
  moreBtn.disabled = false; moreBtn.textContent = 'Load more';
  if (id !== runId) return;
  qsa('.sk-want', results).forEach((el) => el.remove());
  if (error) { errorToast(error, 'load more requests'); return; }
  // the ranking can shift a little between batches: a request already on screen is never shown twice
  const fresh = res.data.filter((r) => !shown.has(r.id));
  fresh.forEach((r) => { shown.add(r.id); items.push(r); });
  results.insertAdjacentHTML('beforeend', fresh.map((r) => wantedCard(r, ref)).join(''));
  loaded += res.fetched ?? res.data.length;
  moreBox.classList.toggle('hidden', loaded >= total);
  observeCards(results);
}
moreBtn.onclick = loadMore;

// remember the list and the spot, so closing a request returns to it
const remember = () => {
  if (!items.length) return;
  saveList(listKey(), { seed, items, total, fetched: loaded, y: window.scrollY });
  try { sessionStorage.setItem(spotKey(), JSON.stringify({ n: loaded, y: window.scrollY, seed })); } catch { /* storage unavailable */ }
};
results.addEventListener('click', (e) => { if (e.target.closest('a')) remember(); });
window.addEventListener('pagehide', remember);

run(cameBack());