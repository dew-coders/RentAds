import { sb } from './supabase.js';
import {
  initPage, requireLogin, getProfile, loadRef, favSet, qs, qsa, esc, adCard, observeCards, priceTag, photoImg, withThumbs, sortedImages, placeholder,
  statusBadge, timeAgo, fmtDate, toast, confirmBox, setTitle, phoneLocal, lockedField, icon, fieldError, clearErrors, AD_SELECT,
  avatarHtml, squareAvatar, wantBadge, budgetTag, wantPlace, wantLive, wantDaysLeft, WANT_SELECT, WANT_CARD_SELECT, openModal,
  adSkeletons, wantSkeletons, wantedCard, wantFavSet, skStats, skRows, skForm, errorBox, errorNotice, errorToast,
} from './common.js';
import { mountAdForm, MAX_ADS } from './adform.js';
import { mountPhoneVerify } from './phone-verify.js';
import { MAX_WANTED } from './config.js';

const session = await requireLogin();
if (!session) throw new Error('not logged in');
loadRef(); // starts the download while the menu is drawn
await initPage('dashboard');
const view = qs('#view');
const ref = await loadRef();
let profile = await getProfile();
if (!profile) {
  view.innerHTML = errorBox(null, 'load your profile', { title: 'We could not load your profile' });
  throw new Error('no profile');
}
const uid = session.user.id;
qs('#side a[data-route="verify"]')?.remove(); // no verification in the beta

function mark(route) {
  qsa('#side a').forEach((a) => a.classList.toggle('on', a.dataset.route === route));
}

// loading skeletons: page title row (with an avatar on My ads), ads-used bar
const skTitleRow = (avatar) => `<div class="row spread" style="margin-bottom:14px;flex-wrap:nowrap" aria-hidden="true"><div class="row" style="flex:1 1 0;flex-wrap:nowrap;gap:14px;min-width:0">
  ${avatar ? '<div class="sk sk-o" style="width:46px;height:46px"></div>' : ''}<div class="sk sk-h" style="flex:1 1 auto;width:auto;max-width:240px"></div></div><div class="sk sk-b" style="width:140px;flex:none"></div></div>`;
const skUsage = '<div class="card pad" style="margin-bottom:14px" aria-hidden="true"><div class="sk sk-t" style="width:42%"></div><div class="sk" style="height:8px;margin-top:12px;border-radius:var(--r)"></div></div>';

/* ---------------- My ads ---------------- */
// what the "My ads" rows show: the card fields plus status, views and the rejection reason
const MY_ADS_SELECT = `${AD_SELECT}, status, views, created_at, rejection_reason`;
async function myAds() {
  mark('ads'); setTitle('My ads');
  view.innerHTML = skTitleRow(true) + skStats(4) + skUsage + skRows(3);
  const { data: ads, error } = await sb.from('ads').select(MY_ADS_SELECT).eq('vendor_id', uid).order('created_at', { ascending: false });
  if (error) { view.innerHTML = errorBox(error, 'load your ads', { title: 'We could not load your ads' }); return; }

  const live = ads.filter((a) => a.status === 'approved').length;
  const pending = ads.filter((a) => a.status === 'pending').length;
  const views = ads.reduce((s, a) => s + (a.views || 0), 0);
  const active = ads.length; // every ad counts: live, waiting, rejected
  const left = Math.max(0, MAX_ADS - active);

  view.innerHTML = `
    <div class="row spread" style="margin-bottom:14px"><div class="row" style="flex-wrap:nowrap;gap:14px">${avatarHtml(profile)}<div>
      <h1 style="font-size:1.7rem;margin:0">Hello, ${esc(profile.business_name || profile.full_name || 'vendor')}</h1>
</div></div>
      <a class="btn btn-tag" href="#/new">+ Post an ad</a></div>
    <div class="stat-grid">
      <div class="card stat"><b>${ads.length}</b><span>Total ads</span></div>
      <div class="card stat"><b>${live}</b><span>Live on site</span></div>
      <div class="card stat"><b>${pending}</b><span>Waiting for review</span></div>
      <div class="card stat"><b>${views}</b><span>Total views</span></div>
    </div>
    <div class="card pad" style="margin-bottom:14px">
      <div class="row spread"><strong>${active} of ${MAX_ADS} ads used</strong>
        <span class="muted small">${left ? `You can post ${left} more ad${left === 1 ? '' : 's'}` : 'You have reached the limit. Delete an ad to post a new one.'}</span></div>
      <div style="margin-top:8px;height:8px;border-radius:var(--r);background:var(--bg4);overflow:hidden"><div style="height:100%;width:${Math.round((active / MAX_ADS) * 100)}%;background:${left ? 'var(--ac)' : 'var(--danger)'}"></div></div>
      <div class="muted small" style="margin-top:6px">Every ad counts, including rejected ones. Delete an ad to free a slot.</div>
    </div>
    <div id="ads-list"></div>`;

  const list = qs('#ads-list');
  if (!ads.length) {
    list.innerHTML = `<div class="card empty">${icon('box')}<h3>You have not posted any ads yet</h3><p class="muted">Post your first rental ad. It goes live after a quick review by our team.</p><a class="btn" href="#/new">Post an Ad</a></div>`;
    return;
  }
  list.innerHTML = ads.map((a) => {
    const im = sortedImages(a)[0];
    const thumb = im ? photoImg(im.path) : placeholder(a, ref);
    return `<div class="card pad" style="margin-bottom:12px"><div class="row" style="align-items:flex-start;flex-wrap:nowrap">
      <div class="thumb-sm" style="width:84px;height:64px">${thumb}</div>
      <div class="grow" style="min-width:0">
        <div class="row" style="gap:8px">${statusBadge(a.status)}</div>
        <div style="font-weight:600;margin:4px 0;overflow-wrap:anywhere">${esc(a.title)}</div>
        <div class="row small muted" style="gap:12px">${priceTag(a)}${a.status === 'approved' ? `<span>${a.views || 0} views</span>` : ''}<span>Posted ${esc(timeAgo(a.created_at))}</span></div>
        ${a.status === 'rejected' && a.rejection_reason ? `<div class="notice bad small" style="margin:10px 0 0">${esc(a.rejection_reason)}</div>` : ''}
        ${a.status === 'pending' ? '<div class="muted small" style="margin-top:6px">Waiting for review. Usually within one working day.</div>' : ''}
      </div></div>
      <div class="row" style="margin-top:12px">
        <a class="btn btn-ghost btn-sm" href="ad.html?id=${esc(a.id)}">View</a>
        <a class="btn btn-ghost btn-sm" href="#/edit/${esc(a.id)}">Edit</a>
        <button class="btn btn-ghost btn-sm" data-del="${esc(a.id)}" style="color:var(--danger)">Delete</button>
      </div></div>`;
  }).join('');
  qsa('[data-del]', list).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Delete this ad permanently?', 'Delete ad', true))) return;
    const ad = ads.find((x) => x.id === b.dataset.del);
    const paths = withThumbs((ad.ad_images || []).map((i) => i.path));
    const { error: e } = await sb.from('ads').delete().select('id').eq('id', ad.id);
    if (e) { errorToast(e, 'delete this ad'); return; }
    if (paths.length) await sb.storage.from('ad-images').remove(paths);
    toast('Ad deleted', 'good');
    myAds();
  }));
}

/* ---------------- Post / edit ---------------- */
async function adEditor(id) {
  mark(id ? 'ads' : 'new'); setTitle(id ? 'Edit ad' : 'Post an ad');
  view.innerHTML = `<h1 style="font-size:1.7rem">${id ? 'Edit your ad' : 'Post a rental ad'}</h1><div id="form-host"></div>`;
  await mountAdForm(qs('#form-host'), {
    adId: id, admin: false,
    onSaved: () => { location.hash = '#/ads'; },
    onCancel: () => { location.hash = '#/ads'; },
  });
}

/* ---------------- My requests (wanted) ---------------- */
async function myRequests() {
  mark('requests'); setTitle('My requests');
  view.innerHTML = skTitleRow(false) + skUsage + skRows(3, false);
  const { data: rows, error } = await sb.from('wanted_requests').select(WANT_SELECT).eq('user_id', uid).order('created_at', { ascending: false });
  if (error) { view.innerHTML = errorBox(error, 'load your requests', { title: 'We could not load your requests' }); return; }

  const open = rows.filter((r) => r.status !== 'fulfilled').length; // rejected and demo ones count too
  view.innerHTML = `
    <div class="row spread" style="margin-bottom:14px"><div><h1 style="font-size:1.7rem;margin:0">My requests</h1>
      <p class="muted small" style="margin:4px 0 0">Things you are looking to rent. Vendors can contact you. Live, waiting and rejected requests all count. Requests marked as found do not.</p></div>
      <a class="btn btn-tag" href="wanted-new.html">+ Post a request</a></div>
    <div class="card pad" style="margin-bottom:14px">
      <div class="row spread"><strong>${open} of ${MAX_WANTED} requests used</strong>
        <span class="muted small">${open < MAX_WANTED ? `You can post ${MAX_WANTED - open} more request${MAX_WANTED - open === 1 ? '' : 's'}` : 'You have reached the limit. Mark one as found or delete one to post a new request.'}</span></div>
      <div style="margin-top:8px;height:8px;border-radius:var(--r);background:var(--bg4);overflow:hidden"><div style="height:100%;width:${Math.round((Math.min(open, MAX_WANTED) / MAX_WANTED) * 100)}%;background:${open < MAX_WANTED ? 'var(--ac)' : 'var(--danger)'}"></div></div>
    </div>
    <div id="req-list"></div>`;

  const list = qs('#req-list');
  if (!rows.length) {
    list.innerHTML = `<div class="card empty">${icon('search')}<h3>You have not posted any requests</h3><p class="muted">Cannot find what you need in the ads? Tell vendors what you are looking for and let them come to you.</p><a class="btn" href="wanted-new.html">Post a request</a></div>`;
    return;
  }
  list.innerHTML = rows.map((r) => {
    const expired = r.status === 'approved' && !wantLive(r);
    const left = wantDaysLeft(r);
    return `<div class="card pad req-row" style="margin-bottom:12px">
      <div class="row" style="gap:8px">${wantBadge(r)}</div>
      <div style="font-weight:600;margin:4px 0;overflow-wrap:anywhere">${esc(r.title)}</div>
      <div class="row small muted" style="gap:12px">${budgetTag(r)}<span>${esc(wantPlace(r, ref))}</span>${r.status === 'approved' && !expired ? `<span>${r.views || 0} views</span><span>${left} day${left === 1 ? '' : 's'} left</span>` : ''}<span>Posted ${esc(timeAgo(r.created_at))}</span></div>
      ${r.status === 'rejected' && r.rejection_reason ? `<div class="notice bad small" style="margin:10px 0 0">${esc(r.rejection_reason)}</div>` : ''}
      ${r.status === 'pending' ? '<div class="muted small" style="margin-top:6px">Waiting for review. Usually within one working day.</div>' : ''}
      ${expired ? '<div class="muted small" style="margin-top:6px">This request has expired. Edit it to post it again.</div>' : ''}
      <div class="row" style="margin-top:12px">
        <a class="btn btn-ghost btn-sm" href="want.html?id=${esc(r.id)}">View</a>
        ${r.status !== 'removed' ? `<a class="btn btn-ghost btn-sm" href="wanted-new.html?id=${esc(r.id)}">Edit</a>` : ''}
        ${r.status === 'approved' && !expired || r.status === 'pending' ? `<button class="btn btn-ghost btn-sm" data-found="${esc(r.id)}">Mark as found</button>` : ''}
        <button class="btn btn-ghost btn-sm" data-delreq="${esc(r.id)}" style="color:var(--danger)">Delete</button>
      </div></div>`;
  }).join('');
  qsa('[data-found]', list).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Close this request? Vendors will no longer see it.', 'I found it'))) return;
    const { error: e } = await sb.from('wanted_requests').update({ status: 'fulfilled' }).eq('id', b.dataset.found);
    if (e) { errorToast(e, 'close this request'); return; }
    toast('Request closed. Glad you found it!', 'good');
    myRequests();
  }));
  qsa('[data-delreq]', list).forEach((b) => (b.onclick = async () => {
    if (!(await confirmBox('Delete this request permanently?', 'Delete request', true))) return;
    const { error: e } = await sb.from('wanted_requests').delete().eq('id', b.dataset.delreq);
    if (e) { errorToast(e, 'delete this request'); return; }
    toast('Request deleted', 'good');
    myRequests();
  }));
}

/* ---------------- Saved: ads and Wanted requests ---------------- */
async function favorites(tab) {
  const reqs = tab === 'requests';
  mark('favorites'); setTitle(reqs ? 'Saved requests' : 'Saved ads');
  const head = `<h1 style="font-size:1.7rem">Saved</h1><div class="chips">
    <a class="chip${reqs ? '' : ' on'}" href="#/favorites"${reqs ? '' : ' aria-current="page"'}>Saved ads</a>
    <a class="chip${reqs ? ' on' : ''}" href="#/favorites/requests"${reqs ? ' aria-current="page"' : ''}>Saved requests</a></div>`;
  view.innerHTML = head + (reqs ? `<div class="listing-grid want-grid">${wantSkeletons(3)}</div>` : `<div class="listing-grid">${adSkeletons(4)}</div>`);
  let html;
  if (reqs) {
    const ids = [...(await wantFavSet())];
    if (!ids.length) html = '<div class="card empty">' + icon('heart') + '<h3>No saved requests yet</h3><p class="muted">Tap Save on any wanted request to keep it here.</p><a class="btn" href="wanted.html">See wanted requests</a></div>';
    else {
      const { data, error } = await sb.from('wanted_requests').select(WANT_CARD_SELECT).in('id', ids).eq('status', 'approved').gt('expires_at', new Date().toISOString());
      if (error) { view.innerHTML = head + errorBox(error, 'load your saved requests', { title: 'We could not load your saved requests' }); return; }
      html = data?.length ? `<div class="listing-grid want-grid">${data.map((r) => wantedCard(r, ref)).join('')}</div>` : '<div class="card empty"><h3>Your saved requests are no longer available</h3><p class="muted">They were found, expired or removed.</p></div>';
    }
  } else {
    const favs = await favSet();
    const ids = [...favs];
    if (!ids.length) html = '<div class="card empty">' + icon('heart') + '<h3>Nothing saved yet</h3><p class="muted">Tap the heart on any ad to keep it here.</p><a class="btn" href="search.html">Browse rentals</a></div>';
    else {
      const { data, error } = await sb.from('ads').select(AD_SELECT).in('id', ids).eq('status', 'approved');
      if (error) { view.innerHTML = head + errorBox(error, 'load your saved ads', { title: 'We could not load your saved ads' }); return; }
      html = data?.length ? `<div class="listing-grid">${data.map((a) => adCard(a, ref, favs)).join('')}</div>` : '<div class="card empty"><h3>Your saved ads are no longer available</h3></div>';
    }
  }
  view.innerHTML = head + html;
  observeCards(view); // cards start invisible and fade in; without this the saved cards stay hidden
}

/* ---------------- Profile ---------------- */
const paintHeaderAvatar = () => qsa('.nav-avatar').forEach((el) => { el.outerHTML = avatarHtml({ ...profile, business_name: profile.business_name || profile.full_name || 'A', full_name: '' }, 'nav-avatar'); });

async function profilePage() {
  mark('profile'); setTitle('My profile');
  view.innerHTML = `${skTitleRow(false)}<div style="max-width:560px">${skForm(5)}</div>`;
  profile = await getProfile(true);
  if (!profile) { view.innerHTML = errorBox(null, 'load your profile', { title: 'We could not load your profile' }); return; }
  view.innerHTML = `<div class="row spread"><h1 style="font-size:1.7rem;margin:0">My profile</h1><a class="btn btn-ghost btn-sm" href="profile.html">View public profile</a></div>
    ${!profile.phone_verified && profile.role !== 'admin' ? '<div class="notice warn" style="max-width:560px;margin-top:14px">Welcome to RentAds! Verify your mobile number so you can post ads, and add your business name.</div>' : ''}
    <form class="card pad" id="p-form" style="max-width:560px;margin-top:14px" novalidate>
      <div class="avatar-edit">
        <div id="av-preview">${avatarHtml(profile, 'lg')}</div>
        <div>
          <div class="row">
            <label class="btn btn-ghost btn-sm" for="av-file" style="margin:0">Upload photo</label>
            <button type="button" class="btn btn-ghost btn-sm" id="av-remove" style="color:var(--danger)${profile.avatar_path ? '' : ';display:none'}">Remove</button>
          </div>
          <input id="av-file" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
          <div class="hint">Your logo or a clear photo of you. It shows on your profile and ads. JPG, PNG or WebP.</div>
          <div id="av-msg"></div>
        </div>
      </div>
      <div class="field"><label for="p-name">Your name</label><input id="p-name" type="text" maxlength="80" value="${esc(profile.full_name || '')}" required></div>
      <div class="field"><label for="p-biz">Business name</label><input id="p-biz" type="text" maxlength="80" value="${esc(profile.business_name || '')}"><div class="hint">Shown on your ads. Leave blank if you rent as an individual.</div></div>
      <div class="field"><label for="p-bio">About you</label><textarea id="p-bio" maxlength="500" style="min-height:110px" placeholder="What you rent out, where you operate, how long you have been in business">${esc(profile.bio || '')}</textarea><div class="hint"><span id="bio-count">0</span> of 500 characters. Shown on your public profile.</div></div>
      <div class="field"><label>Mobile number</label><div id="p-mobile"></div></div>
      <div class="field"><label for="p-email">Email</label><input id="p-email" type="email" value="${esc(session.user.email)}" disabled></div>
      <div id="p-msg"></div>
      <button class="btn" type="submit">Save profile</button>
    </form>
    ${profile.role === 'admin' ? '' : `<div class="card pad" style="max-width:560px;margin-top:18px">
      <h3>Delete my account</h3>
      <p class="muted small">Permanently removes your profile, ads, photos, requests, saved ads and any documents you uploaded. This cannot be undone.</p>
      <button class="btn btn-danger btn-sm" type="button" id="del-account" data-multi>Delete my account</button>
    </div>`}`;

  const bio = qs('#p-bio'), countBio = () => { qs('#bio-count').textContent = bio.value.length; };
  bio.oninput = countBio; countBio();

  /* ---- mobile number: only changed through an SMS code (js/phone-verify.js) ---- */
  const paintMobile = () => {
    qs('#p-mobile').innerHTML = profile.phone_verified
      ? `<div class="row" style="gap:10px;align-items:center"><strong>${esc(phoneLocal(profile.phone))}</strong>
          <span class="badge verified">${icon('check')} Verified</span>
          <button class="btn btn-ghost btn-sm" type="button" id="p-verify" data-multi>Change number</button></div>`
      : `<div class="row" style="gap:10px;align-items:center"><span class="muted">Not verified yet</span>
          <button class="btn btn-sm" type="button" id="p-verify" data-multi>Verify now</button></div>`;
    qs('#p-verify').onclick = () => {
      const m = openModal('<h3>Verify your mobile number</h3><div id="pv-box"></div>');
      const pv = mountPhoneVerify(m.el.querySelector('#pv-box'), {
        profile,
        onVerified: (fresh) => { m.close(); if (fresh) profile = fresh; paintMobile(); qs('.notice.warn', view)?.remove(); },
      });
      m.back.addEventListener('closed', pv.stop);
    };
  };
  paintMobile();
  lockedField('#p-email', 'Your email cannot be changed. It is the Google account you log in with.');
  /* ---- delete my account: files first, then the database rows (the database function removes the rest) ---- */
  async function removeFolder(bucket, prefix) {
    const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 });
    if (error) throw error;
    const files = (data || []).filter((x) => x.id).map((x) => `${prefix}/${x.name}`);
    const folders = (data || []).filter((x) => !x.id).map((x) => `${prefix}/${x.name}`);
    if (files.length) { const r = await sb.storage.from(bucket).remove(files); if (r.error) throw r.error; }
    for (const f of folders) await removeFolder(bucket, f);
  }
  qs('#del-account')?.addEventListener('click', () => {
    const m = openModal(`<h3>Delete your account?</h3>
      <p class="muted">This permanently deletes your profile, all your ads and photos, your requests, your saved ads and any verification documents. It cannot be undone.</p>
      <div class="field"><label for="del-word">Type DELETE to confirm</label><input id="del-word" type="text" autocomplete="off" autocapitalize="characters"></div>
      <div id="del-msg" role="alert"></div>
      <div class="row" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-no data-multi>Cancel</button><button class="btn btn-danger" type="button" data-yes data-multi disabled>Delete my account</button></div>`);
    const word = m.el.querySelector('#del-word'), yes = m.el.querySelector('[data-yes]'), note = m.el.querySelector('#del-msg');
    word.oninput = () => { yes.disabled = word.value.trim() !== 'DELETE'; };
    m.el.querySelector('[data-no]').onclick = m.close;
    yes.onclick = async () => {
      yes.disabled = true; yes.textContent = 'Deleting'; note.innerHTML = '';
      try {
        const check = await sb.rpc('delete_my_account', { p_confirm: false }); // makes sure the account can be deleted before any file is removed
        if (check.error) throw check.error;
        for (const bucket of ['ad-images', 'avatars', 'br-docs']) await removeFolder(bucket, uid);
        const done = await sb.rpc('delete_my_account', { p_confirm: true });
        if (done.error) throw done.error;
        await sb.auth.signOut();
        location.href = 'index.html';
      } catch (err) {
        note.innerHTML = errorNotice(err, 'delete your account');
        yes.disabled = false; yes.textContent = 'Delete my account';
      }
    };
  });

  const avMsg = (t) => { qs('#av-msg').innerHTML = t ? `<div class="err" role="alert">${esc(t)}</div>` : ''; };
  const refreshAvatar = () => {
    qs('#av-preview').innerHTML = avatarHtml(profile, 'lg');
    qs('#av-remove').style.display = profile.avatar_path ? '' : 'none';
    paintHeaderAvatar();
  };

  qs('#av-file').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    avMsg('');
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { avMsg('Choose a JPG, PNG or WebP photo.'); return; }
    if (f.size > 25 * 1024 * 1024) { avMsg('This photo is over 25 MB. Choose a smaller one.'); return; }
    qs('#av-preview').style.opacity = '.5';
    try {
      const blob = await squareAvatar(f);
      const path = `${uid}/avatar-${crypto.randomUUID()}.jpg`;
      // every new picture gets a new name, so browsers and the CDN may keep it for a year
      const up = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' });
      if (up.error) throw up.error;
      const old = profile.avatar_path;
      const { error } = await sb.from('profiles').update({ avatar_path: path }).eq('id', uid);
      if (error) { await sb.storage.from('avatars').remove([path]); throw error; }
      if (old) await sb.storage.from('avatars').remove([old]);
      profile = await getProfile(true);
      refreshAvatar();
      toast('Profile photo updated', 'good');
    } catch (err) {
      qs('#av-msg').innerHTML = errorNotice(err, 'upload your photo');
    } finally { qs('#av-preview').style.opacity = ''; }
  };

  qs('#av-remove').onclick = async () => {
    if (!profile.avatar_path) return;
    if (!(await confirmBox('Remove your profile photo?', 'Remove', true))) return;
    const old = profile.avatar_path;
    const { error } = await sb.from('profiles').update({ avatar_path: null }).eq('id', uid);
    if (error) { qs('#av-msg').innerHTML = errorNotice(error, 'remove your photo'); return; }
    await sb.storage.from('avatars').remove([old]);
    profile = await getProfile(true);
    refreshAvatar();
    toast('Profile photo removed', 'good');
  };

  qs('#p-form').onsubmit = async (e) => {
    e.preventDefault();
    const msg = qs('#p-msg');
    clearErrors(qs('#p-form')); msg.innerHTML = '';
    if (!qs('#p-name').value.trim()) return fieldError('#p-name', 'Enter your name so renters know who they are contacting.');
    const { error } = await sb.from('profiles').update({
      full_name: qs('#p-name').value.trim(), business_name: qs('#p-biz').value.trim() || null,
      bio: bio.value.trim() || null,
    }).eq('id', uid);
    if (error) { msg.innerHTML = errorNotice(error, 'save your profile'); return; }
    profile = await getProfile(true);
    paintHeaderAvatar();
    toast('Profile saved', 'good', null, { ms: 4000, link: { href: `profile.html?id=${encodeURIComponent(uid)}`, label: 'View your profile' } });
  };
}

/* ---------------- router ---------------- */
async function route() {
  const [, name, arg] = (location.hash || '#/ads').split('/');
  window.scrollTo(0, 0);
  try {
    if (name === 'new') return await adEditor(null);
    if (name === 'edit' && arg) return await adEditor(arg);
    if (name === 'requests') return await myRequests();
    if (name === 'favorites') return await favorites(arg);
    if (name === 'profile') return await profilePage();
    return await myAds();
  } catch (err) {
    view.innerHTML = errorBox(err, 'load this page', { title: 'This page could not load' });
  }
}
window.addEventListener('hashchange', route);
route();