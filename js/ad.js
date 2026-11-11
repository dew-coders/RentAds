import { sb, cached } from './supabase.js';
import { rankedAds, noteInterest } from './ranking.js';
import {
  initPage, loadRef, favSet, qs, esc, priceTag, imgUrl, photoImg, sortedImages, placeholder, timeAgo, fmtDate,
  telLink, waLink, avatarHtml, adCard, adSkeletons, observeCards, setTitle, toast, icon, errorBox, AD_SELECT, pageId,
  demoBadge, demoNotice,
} from './common.js';

const id = pageId() || ''; // from the clean link /rental/<title>-<id>, or an old ?id= link
const validId = /^[0-9a-f-]{36}$/i.test(id);
// ask for the ad and the lists straight away, while the menu is still being drawn.
// The ad is kept in this tab for a minute, so coming back to it is instant; any edit made in this tab forgets it.
const AD_TTL = 60 * 1000;
const adP = validId ? cached(`ad:${id}`, AD_TTL, async () => {
  const r = await sb.from('ads')
    .select('*, ad_images(path, sort_order), profiles!ads_vendor_id_fkey(id, business_name, full_name, is_verified, created_at, avatar_path)')
    .eq('id', id).maybeSingle();
  if (r.error) throw r.error;
  return r.data;
}) : null;
adP?.catch(() => {}); // handled below
if (validId) loadRef();
const { profile } = await initPage('browse');
const root = qs('#ad-root');

function notFound(msg = 'This ad is not available') {
  root.innerHTML = `<div class="card empty" style="max-width:520px;margin:40px auto">${icon('box')}<h2>${esc(msg)}</h2>
    <p class="muted">It may have been removed, or it may still be waiting for approval.</p><a class="btn" href="search.html">Browse Rentals</a></div>`;
}

if (!validId) { notFound('We could not find this ad'); throw new Error('bad id'); }

let ref, ad;
try {
  ref = await loadRef();
  ad = await adP;
} catch (err) {
  root.innerHTML = errorBox(err, 'load this ad', { title: 'We could not load this ad' });
  throw err;
}
if (!ad) { notFound(); throw new Error('not found'); }

const imgs = sortedImages(ad);
const cat = ref.catById.get(ad.category_id);
const parent = cat?.parent_id ? ref.catById.get(cat.parent_id) : null;
const prov = ref.locById.get(ad.province_id), dist = ref.locById.get(ad.district_id), city = ref.locById.get(ad.city_id);
const vendor = ad.profiles || {};
const vendorName = vendor.business_name || vendor.full_name || 'RentAds vendor';
const place = [city?.name, dist?.name && dist.name !== city?.name ? dist.name : '', prov?.name ? prov.name + ' Province' : ''].filter(Boolean).join(', ');
const waText = `Hi ${vendorName}, I saw your ad "${ad.title}" on RentAds.lk and I'm interested in renting it.`;
const favs = await favSet();
const isOwner = profile && profile.id === ad.vendor_id;
const isAdmin = profile?.role === 'admin';

setTitle(ad.title);
const prettyKey = (k) => k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const specRows = Object.entries(ad.attributes || {}).filter(([, v]) => String(v ?? '').trim() !== '')
  .map(([k, v]) => `<div><dt>${esc(prettyKey(k))}</dt><dd>${esc(v)}</dd></div>`).join('');

const banner = ad.status !== 'approved'
  ? `<div class="notice ${ad.status === 'pending' ? 'warn' : 'bad'}" style="margin-top:6px">
      ${ad.status === 'pending' ? 'This ad is waiting for approval. Only you and the RentAds team can see it.'
        : ad.status === 'rejected' ? `This ad was not approved. ${esc(ad.rejection_reason || '')}`
        : 'This ad has been removed.'}
      ${isOwner ? ` <a href="dashboard.html#/edit/${esc(ad.id)}" style="text-decoration:underline">Edit ad</a>` : ''}${isAdmin ? ` <a href="admin.html#/edit/${esc(ad.id)}" style="text-decoration:underline">Edit as admin</a>` : ''}
    </div>` : ad.is_demo ? demoNotice('ad') : '';

const gallery = imgs.length
  ? `<div class="gallery-main"><img id="main-img" src="${esc(imgUrl(imgs[0].path))}" alt="${esc(ad.title)}"></div>
     ${imgs.length > 1 ? `<div class="thumbs">${imgs.map((im, i) =>
        `<button type="button" class="${i === 0 ? 'on' : ''}" data-img="${i}" aria-label="Photo ${i + 1}">${photoImg(im.path)}</button>`).join('')}</div>` : ''}`
  : `<div class="gallery-main">${placeholder(ad, ref)}</div>`;

const contactBtns = [
  ad.phone ? `<a class="btn btn-block" data-multi href="${esc(telLink(ad.phone))}">${icon('phone')} Call ${esc(ad.phone)}</a>` : '',
  ad.whatsapp ? `<a class="btn btn-wa btn-block" data-multi target="_blank" rel="noopener" href="${esc(waLink(ad.whatsapp, waText))}">${icon('chat')} WhatsApp</a>` : '',
  ad.email ? `<a class="btn btn-ghost btn-block" data-multi href="mailto:${esc(ad.email)}?subject=${encodeURIComponent('Rental enquiry: ' + ad.title)}">${icon('mail')} Email the vendor</a>` : '',
].join('');

root.innerHTML = `
  <nav class="crumbs" aria-label="Breadcrumb">
    <a class="back-link" href="search.html" id="back-link">${icon('back')} Back</a>
    ${parent ? `<span>/</span><a href="search.html?cat=${esc(parent.slug)}">${esc(parent.name)}</a>` : ''}
    ${cat ? `<span>/</span><a href="search.html?cat=${esc((parent || cat).slug)}${parent ? `&sub=${esc(cat.slug)}` : ''}">${esc(cat.name)}</a>` : ''}
  </nav>
  ${banner}
  <div class="detail-grid" style="margin-top:12px">
    <div>
      ${gallery}
      <div class="card pad" style="margin-top:16px">
        <h1 style="font-size:clamp(1.5rem,4vw,2.1rem);margin-bottom:8px">${esc(ad.title)}</h1>
        <div class="muted small row" style="gap:6px 14px">${icon('pin', 'sm')} ${esc(place || 'Sri Lanka')} <span>Posted ${esc(timeAgo(ad.created_at))}</span>${ad.is_featured ? '<span class="badge featured">Promoted</span>' : ''}${ad.is_demo ? demoBadge() : ''}</div>
        <div style="margin:18px 0">${priceTag(ad, true)}</div>
        <h3>Description</h3>
        <p class="desc">${esc(ad.description)}</p>
        ${specRows ? `<h3 style="margin-top:18px">Details</h3><dl class="specs">${specRows}</dl>` : ''}
      </div>
    </div>

    <aside class="side-sticky" style="display:grid;gap:14px">
      <div class="card pad">
        <h3>Contact the vendor</h3>
        <div class="vendor-line" style="margin-bottom:16px">
          ${vendor.id ? `<a href="profile.html?id=${esc(vendor.id)}" aria-label="View ${esc(vendorName)} profile">${avatarHtml(vendor)}</a>` : avatarHtml(vendor)}
          <div>${vendor.id ? `<a href="profile.html?id=${esc(vendor.id)}" style="font-weight:600">${esc(vendorName)}</a>` : `<strong style="font-weight:600">${esc(vendorName)}</strong>`}
          ${vendor.created_at ? `<div class="muted small">Member since ${esc(fmtDate(vendor.created_at))}</div>` : ''}</div>
        </div>
        ${vendor.id ? `<a class="btn btn-ghost btn-sm btn-block" data-multi href="profile.html?id=${esc(vendor.id)}" style="margin-bottom:12px">View profile and all ads</a>` : ''}
        <div style="display:grid;gap:8px">${contactBtns || '<p class="muted">This ad has no contact details.</p>'}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn btn-ghost btn-sm grow ${favs.has(ad.id) ? 'on' : ''}" data-multi data-fav="${esc(ad.id)}" data-label="1" aria-pressed="${favs.has(ad.id)}">${icon('heart', 'sm')} ${favs.has(ad.id) ? 'Saved' : 'Save'}</button>
          <button class="btn btn-ghost btn-sm grow" id="share-btn" data-multi>${icon('share', 'sm')} Share</button>
        </div>
      </div>
      <div class="safety"><strong>Rent safely.</strong> RentAds is a directory only. Price, deposit and the rental agreement are between you and the vendor. Inspect the item, and do not pay in advance to someone you have not checked.</div>
    </aside>
  </div>
  <section class="section"><div class="section-head"><h2>Similar rentals</h2></div><div class="listing-grid fit3" id="similar">${adSkeletons(3)}</div></section>`;

// back goes to where the visitor came from, at the same scroll position
qs('#back-link').onclick = (e) => {
  if (document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1) { e.preventDefault(); history.back(); }
};

root.querySelectorAll('[data-img]').forEach((b) => (b.onclick = () => {
  qs('#main-img').src = imgUrl(imgs[+b.dataset.img].path);
  root.querySelectorAll('[data-img]').forEach((x) => x.classList.toggle('on', x === b));
}));

qs('#share-btn').onclick = async () => {
  const url = location.href;
  try {
    if (navigator.share) await navigator.share({ title: ad.title, url });
    else { await navigator.clipboard.writeText(url); toast('Link copied', 'good'); }
  } catch { /* the visitor cancelled sharing */ }
};

// count one view per visitor session
if (ad.status === 'approved') {
  try {
    const key = `viewed:${ad.id}`;
    if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); sb.rpc('increment_ad_views', { p_ad_id: ad.id }).then(() => {}); }
  } catch { /* storage unavailable */ }
}

// similar ads (same main category)
const rootCat = ref.rootCat(ad.category_id);
const ids = rootCat ? [rootCat.id, ...ref.subsOf(rootCat.id).map((c) => c.id)] : [ad.category_id];
noteInterest(rootCat?.id || ad.category_id); // remembered in this browser, used to tune the feed
// best matches first, with ads from the same district getting an advantage; the plain newest-first list is the fallback
let sim = [];
try {
  sim = (await rankedAds({ categoryId: rootCat?.id || ad.category_id, districtId: ad.district_id }, 0, 7)).data.filter((a) => a.id !== ad.id).slice(0, 6);
} catch (e) {
  console.error(e);
  ({ data: sim } = await sb.from('ads').select(AD_SELECT).eq('status', 'approved').in('category_id', ids)
    .neq('id', ad.id).order('is_demo').order('is_featured', { ascending: false }).order('bumped_at', { ascending: false }).limit(6));
}
const simBox = qs('#similar');
if (sim?.length) { simBox.innerHTML = sim.map((a) => adCard(a, ref, favs)).join(''); observeCards(simBox); }
else simBox.closest('section').remove();