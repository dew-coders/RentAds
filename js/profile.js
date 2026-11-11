// Public vendor profile: photo, details and live ads. profile.html with no id shows your own profile.
import { sb, cached } from './supabase.js';
import { PAGE_SIZE } from './config.js';
import {
  initPage, loadRef, favSet, qs, esc, adCard, observeCards, setTitle, icon, errorBox, errorToast, fmtDate,
  avatarHtml, AD_SELECT, adSkeletons, telLink, waLink,
} from './common.js';

loadRef(); // starts the download while the menu is drawn
const { session, profile: me } = await initPage('profile');
const root = qs('#profile-root');
const param = new URLSearchParams(location.search).get('id') || '';

// no id: show my own profile, or ask the visitor to log in
if (!param && !session) { location.replace('login.html?next=profile.html'); throw new Error('login first'); }
const id = param || session.user.id;
const own = !!session && session.user.id === id;
if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

function notFound(msg = 'We could not find this profile') {
  root.innerHTML = `<div class="card empty" style="max-width:520px;margin:40px auto">${icon('box')}<h2>${esc(msg)}</h2>
    <p class="muted">The link may be wrong, or the vendor may have left RentAds.</p><a class="btn" href="search.html">Browse Rentals</a></div>`;
  throw new Error('profile not found');
}

// the profile, all live ads for the stats and the first batch for the grid are asked for at the same time.
// Each is kept in this tab for a minute, so coming back is instant; any edit made in this tab forgets them.
const PROFILE_TTL = 60 * 1000;
const keep = (part, query) => cached(`profile:${id}:${part}`, PROFILE_TTL, async () => {
  const r = await query;
  if (r.error) throw r.error;
  return { data: r.data, count: r.count ?? null };
});
const adsBatch = (from) => sb.from('ads').select(AD_SELECT).eq('vendor_id', id).eq('status', 'approved')
  .order('bumped_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
const liveP = keep('live', sb.from('ads').select('id, views, phone, whatsapp, email', { count: 'exact' }).eq('vendor_id', id).eq('status', 'approved').order('bumped_at', { ascending: false }));
let firstBatch = keep('ads', adsBatch(0));
[liveP, firstBatch].forEach((x) => x.catch(() => {})); // handled where they are used below

let p, ref;
try {
  const [res] = await Promise.all([
    keep('profile', sb.from('profiles').select('id, full_name, business_name, bio, avatar_path, is_verified, created_at').eq('id', id).maybeSingle()),
    loadRef().then((r) => { ref = r; }),
  ]);
  p = res.data;
} catch (err) {
  root.innerHTML = errorBox(err, 'load this profile', { title: 'We could not load this profile' });
  throw err;
}
if (!p) notFound();

const name = p.business_name || p.full_name || 'RentAds vendor';
setTitle(name);

const live = await liveP.catch(() => ({ data: [], count: 0 })); // the totals are extra: the page still works without them
const liveCount = live.count || 0;
const views = (live.data || []).reduce((s, a) => s + (a.views || 0), 0);

// contact: only the phone / WhatsApp / email the vendor already shows publicly on their ads.
// The private profile phone is never read here, so logged out visitors cannot collect it.
const firstOf = (key) => (live.data || []).map((a) => a[key]).find(Boolean) || '';
const phone = firstOf('phone');
const whatsapp = firstOf('whatsapp') || phone;
const email = firstOf('email');
const waText = `Hi ${name}, I found your profile on RentAds.lk and I'm interested in renting.`;
const contactBtns = [
  phone ? `<a class="btn btn-block" data-multi href="${esc(telLink(phone))}">${icon('phone')} Call ${esc(phone)}</a>` : '',
  whatsapp ? `<a class="btn btn-wa btn-block" data-multi target="_blank" rel="noopener" href="${esc(waLink(whatsapp, waText))}">${icon('chat')} WhatsApp</a>` : '',
  email ? `<a class="btn btn-ghost btn-block" data-multi href="mailto:${esc(email)}?subject=${encodeURIComponent('Rental enquiry from RentAds.lk')}">${icon('mail')} Email the vendor</a>` : '',
].join('');

const sideHtml = own
  ? `<div class="profile-side"><a class="btn btn-block" href="dashboard.html#/profile">Edit profile</a><a class="btn btn-ghost btn-block" href="dashboard.html#/ads">Manage ads</a></div>`
  : (contactBtns ? `<div class="profile-side" aria-label="Contact ${esc(name)}">${contactBtns}</div>` : '');

root.innerHTML = `
  <nav class="crumbs" aria-label="Breadcrumb"><a class="back-link" href="search.html" id="back-link">${icon('back')} Back</a></nav>
  <div class="card pad profile-card${sideHtml ? '' : ' solo'}">
    <div class="profile-main">
    <div class="profile-head">
      ${avatarHtml(p, 'lg')}
      <div style="min-width:0">
        <h1>${esc(name)}</h1>
        ${p.business_name && p.full_name ? `<div class="muted">${esc(p.full_name)}</div>` : ''}
        <div class="muted small" style="margin-top:4px">Member since ${esc(fmtDate(p.created_at))}</div>
      </div>
    </div>
    ${p.bio ? `<p class="profile-bio">${esc(p.bio)}</p>` : (own ? '<p class="muted" style="margin:16px 0 0">Add a short description of your business in <a href="dashboard.html#/profile" style="text-decoration:underline">Edit profile</a>.</p>' : '')}
    <div class="stat-grid" style="margin:18px 0 0">
      <div class="card stat"><b>${liveCount}</b><span>Live ads</span></div>
      <div class="card stat"><b>${views.toLocaleString()}</b><span>Total views</span></div>
    </div>
    </div>
    ${sideHtml}
  </div>
  <section class="section"><div class="section-head"><h2>Ads by ${esc(name)}</h2></div>
    <div class="listing-grid fit3" id="p-ads">${adSkeletons(3)}</div>
    <div class="load-more hidden" id="p-more"><button type="button" id="p-more-btn">Load more</button></div>
  </section>`;

qs('#back-link').onclick = (e) => {
  if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); }
};

const grid = qs('#p-ads'), moreBox = qs('#p-more'), moreBtn = qs('#p-more-btn');
const favs = await favSet();
let loaded = 0;
async function loadBatch() {
  moreBtn.disabled = true; moreBtn.textContent = 'Loading';
  if (loaded) grid.insertAdjacentHTML('beforeend', adSkeletons(3));
  const req = firstBatch || adsBatch(loaded);
  firstBatch = null;
  const { data, error } = await req;
  moreBtn.disabled = false; moreBtn.textContent = 'Load more';
  grid.querySelectorAll('.sk-card').forEach((el) => el.remove());
  if (error) throw error;
  grid.insertAdjacentHTML('beforeend', data.map((a) => adCard(a, ref, favs)).join(''));
  loaded += data.length;
  observeCards(grid);
  moreBox.classList.toggle('hidden', loaded >= liveCount);
  if (!liveCount) {
    grid.innerHTML = `<div class="card empty" style="grid-column:1/-1">${icon('box')}<h3>No live ads yet</h3>
      <p class="muted">${own ? 'Post your first rental ad. It goes live after a quick review.' : 'This vendor has no live ads right now.'}</p>
      ${own ? '<a class="btn" href="dashboard.html#/new">Post an Ad</a>' : ''}</div>`;
  }
}
moreBtn.onclick = () => loadBatch().catch((e) => errorToast(e, 'load more ads'));
try { await loadBatch(); } catch (err) {
  grid.innerHTML = errorBox(err, 'load these ads', { title: 'We could not load the ads' });
}
