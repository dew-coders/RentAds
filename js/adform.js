// Post / edit an ad. Used by the vendor dashboard and by the admin panel (admin = true).
import { sb } from './supabase.js';
import { MAX_PHOTOS } from './config.js';

export const MAX_ADS = 10; // active ads (live + waiting) per vendor, same limit as the database
const MAX_UPLOAD = 5 * 1024 * 1024; // stored photo size, same limit as the ad-images bucket
const MAX_ORIGINAL = 15 * 1024 * 1024; // photo picked from the phone, it is shrunk before upload
import {
  qs, qsa, esc, loadRef, getSession, getProfile, optionList, UNIT_OPTIONS, imgUrl, withThumbs, thumbPath, toast, ruleToast, isValidLkPhone, sortedImages,
  icon, fieldError, clearErrors, errorNotice, errorBox, confirmBox, skForm, phoneLocal, lockedField, openModal,
} from './common.js';
import { mountPhoneVerify } from './phone-verify.js';

const ATTR_FIELDS = {
  vehicles: [['year', 'Year', 'number'], ['seats', 'Seats', 'number'], ['transmission', 'Transmission', ['Manual', 'Automatic']],
    ['fuel', 'Fuel', ['Petrol', 'Diesel', 'Hybrid', 'Electric']], ['with_driver', 'Driver', ['Self drive only', 'Driver available', 'Driver included']]],
  properties: [['bedrooms', 'Bedrooms', 'number'], ['bathrooms', 'Bathrooms', 'number'], ['sleeps', 'Sleeps (guests)', 'number'], ['furnished', 'Furnished', ['Yes', 'Partly', 'No']]],
  'equipment-tools': [['capacity', 'Capacity / size', 'text'], ['operator', 'Operator', ['Not included', 'Available', 'Included']], ['delivery', 'Delivery', ['Pickup only', 'Available']]],
  'event-gear': [['min_order', 'Minimum order', 'text'], ['setup', 'Setup and removal', ['Not included', 'Optional', 'Included']], ['delivery', 'Delivery', ['Pickup only', 'Available']]],
  'cameras-av': [['brand', 'Brand', 'text'], ['kit', 'Included in the rental', 'text'], ['operator', 'Operator / pilot', ['Not included', 'Optional', 'Included']]],
  electronics: [['brand', 'Brand', 'text'], ['condition', 'Condition', ['Like new', 'Good', 'Fair']]],
  'fashion-costumes': [['size', 'Sizes available', 'text'], ['fitting', 'Fitting / alterations', ['Not offered', 'Available', 'Included']]],
  'sports-outdoor': [['brand', 'Brand', 'text'], ['sizes', 'Sizes / capacity', 'text'], ['delivery', 'Delivery', ['Pickup only', 'Available']]],
};
const ALL_ATTR_KEYS = new Set(Object.values(ATTR_FIELDS).flat().map((f) => f[0]));

/* Small, faint rentads.lk mark in the middle of every ad photo: it cannot be cropped off, and the
   gallery and cards (which crop to a wide shape) always show it.
   supabase/scripts/watermark-backfill.ps1 draws the same mark on photos uploaded before this. */
const WATERMARK = 'RentAds.lk';
async function addWatermark(ctx, w, h) {
  // sized to the part the gallery shows (a 16:10 strip), so the mark looks the same size on every photo
  const size = Math.max(12, Math.round(Math.min(w, h * 1.6) * 0.024));
  const font = `600 ${size}px Outfit, "Segoe UI", Arial, sans-serif`;
  try { await document.fonts.load(font, WATERMARK); } catch { /* the next font in the list is used */ }
  const x = w / 2, y = h / 2, shift = Math.max(1, Math.round(size / 16));
  ctx.save();
  ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = 0.18; ctx.fillStyle = '#000'; ctx.fillText(WATERMARK, x + shift, y + shift); // soft shadow, so it shows on bright photos
  ctx.globalAlpha = 0.3; ctx.fillStyle = '#fff'; ctx.fillText(WATERMARK, x, y);
  ctx.restore();
}

/* Shrink phone photos before upload (saves the vendor's mobile data and speeds up the site) and add the watermark.
   marked is false only when the browser could not draw the photo; the backfill script marks those later.
   small is the copy the listing cards show (THUMB_WIDTH wide, same watermark); null when it could not be made. */
const THUMB_WIDTH = 640; // a card is at most about 330 px wide on screen, and phones show it at 2 to 3 times that
async function shrink(file, maxSide = 1600, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    await addWatermark(ctx, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    if (blob) {
      let small = null;
      try {
        const tw = Math.min(w, THUMB_WIDTH), th = Math.round(h * (tw / w));
        const c2 = document.createElement('canvas');
        c2.width = tw; c2.height = th;
        const x2 = c2.getContext('2d');
        x2.imageSmoothingQuality = 'high';
        x2.drawImage(canvas, 0, 0, tw, th);
        small = await new Promise((res) => c2.toBlob(res, 'image/jpeg', 0.72));
      } catch { /* the cards fall back to the full photo */ }
      return { blob, small, marked: true };
    }
  } catch { /* fall through to the original file */ }
  return { blob: file, small: null, marked: false };
}

export async function mountAdForm(container, { adId = null, admin = false, onSaved = () => {}, onCancel = () => {} } = {}) {
  container.innerHTML = skForm(7);
  const [ref, session, profile] = await Promise.all([loadRef(), getSession(), getProfile()]);

  let ad = null;
  let activeCount = null; // ads this vendor already has (all statuses), only counted for a new ad
  if (adId) {
    const { data, error } = await sb.from('ads').select('*, ad_images(id, path, sort_order)').eq('id', adId).maybeSingle();
    if (error) { container.innerHTML = errorBox(error, 'load this ad', { title: 'We could not load this ad' }); return; }
    if (!data) { container.innerHTML = `<div class="card empty">${icon('box')}<h3>We could not find this ad</h3><p class="muted">It may have been deleted. Go back to your ads and pick it from the list.</p><a class="btn" href="#/ads">Go to my ads</a></div>`; return; }
    if (!admin && data.vendor_id !== session.user.id) { container.innerHTML = `<div class="card empty">${icon('box')}<h3>You can only edit your own ads</h3><p class="muted">This ad belongs to another vendor. Check that you are logged in with the right account.</p><a class="btn" href="#/ads">Go to my ads</a></div>`; return; }
    ad = data;
  } else if (!admin) {
    // vendors can have 10 active ads (live or waiting for review); the database enforces this too
    const { count } = await sb.from('ads').select('id', { count: 'exact', head: true })
      .eq('vendor_id', session.user.id);
    activeCount = count || 0;
    if (activeCount >= MAX_ADS) {
      container.innerHTML = `<div class="card empty">${icon('box')}<h3>You have ${MAX_ADS} ads</h3>
        <p class="muted">That is the most one profile can have, and rejected ads count too. Delete an ad you no longer need, then post a new one.</p>
        <a class="btn" href="#/ads">Go to my ads</a></div>`;
      return;
    }
    // a new ad needs a verified mobile number (admins are exempt); the database checks this too
    if (profile?.role !== 'admin' && !profile?.phone_verified) {
      container.innerHTML = `<div class="card pad" style="max-width:560px">
        <h3>Verify your mobile number</h3>
        <p class="muted">Before you post your first ad, confirm your mobile number with a code we send by SMS. You only need to do this once.</p>
        <div id="pv-box"></div></div>`;
      mountPhoneVerify(qs('#pv-box', container), {
        profile,
        onVerified: () => mountAdForm(container, { adId, admin, onSaved, onCancel }),
      });
      return;
    }
  }

  // photo list: existing images first, new ones appended
  let photos = ad ? sortedImages(ad).map((i) => ({ id: i.id, path: i.path, url: imgUrl(i.path) })) : [];
  const removed = []; // existing images to delete on save

  const cat = ad ? ref.catById.get(ad.category_id) : null;
  const rootCat = cat ? (cat.parent_id ? ref.catById.get(cat.parent_id) : cat) : null;
  const v = (k, d = '') => (ad && ad[k] !== null && ad[k] !== undefined ? ad[k] : d);
  const attrs = ad?.attributes || {};
  // vendors cannot type contact details: phone and WhatsApp are the verified mobile number, email is the login
  // email (the database sets them the same way). Admins keep free fields.
  const locked = !admin && profile?.role !== 'admin';
  const verifiedPhone = profile?.phone_verified ? phoneLocal(profile.phone) : '';
  const contact = locked
    ? { phone: verifiedPhone || v('phone'), whatsapp: verifiedPhone || v('whatsapp'), email: session?.user?.email || v('email') }
    : { phone: v('phone', phoneLocal(profile?.phone)), whatsapp: v('whatsapp', phoneLocal(profile?.phone)), email: v('email', session?.user?.email || '') };

  container.innerHTML = `
    ${activeCount !== null ? `<div class="card pad" style="margin-bottom:14px">You are using ${activeCount} of ${MAX_ADS} ads. ${MAX_ADS - activeCount - 1 > 0 ? `After this one you can post ${MAX_ADS - activeCount - 1} more.` : 'This is your last free slot.'}</div>` : ''}
    ${ad && !admin && ad.status === 'approved' ? '<div class="notice warn">Saving changes sends this ad back to review. It stays hidden until the RentAds team approves it again.</div>' : ''}
    ${ad && ad.status === 'rejected' && ad.rejection_reason ? `<div class="notice bad"><strong>Why it was not approved:</strong> ${esc(ad.rejection_reason)}<br>Fix this and save to send it for review again.</div>` : ''}
    <form id="ad-form" class="card pad" novalidate>
      <h3>1. What are you renting out?</h3>
      <div class="grid2">
        <div class="field"><label for="a-root">Category</label><select id="a-root" required></select></div>
        <div class="field"><label for="a-cat">Subcategory</label><select id="a-cat" required></select></div>
      </div>
      <div class="field"><label for="a-title">Ad title</label><input id="a-title" type="text" maxlength="120" required value="${esc(v('title'))}" placeholder="e.g. Toyota KDH 14 seater van with driver">
        <div class="hint">Name the item and the main thing renters care about. Use 5 to 120 characters.</div></div>
      <div class="field"><label for="a-desc">Description</label><textarea id="a-desc" maxlength="5000" required placeholder="Condition, what is included, rental terms, deposit, delivery and minimum rental period">${esc(v('description'))}</textarea>
        <div class="hint"><span id="desc-count">0</span> of 5000 characters. Write at least 20.</div></div>
      <div id="attr-box"></div>

      <h3 style="margin-top:22px">2. Price</h3>
      <div class="grid2">
        <div class="field"><label for="a-price">Price (Rs)</label><input id="a-price" type="number" min="0" step="any" inputmode="decimal" value="${esc(v('price'))}"></div>
        <div class="field"><label for="a-unit">Charged</label><select id="a-unit">${UNIT_OPTIONS.map(([k, l]) => `<option value="${k}"${v('price_unit', 'day') === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>

      <h3 style="margin-top:22px">3. Where is it?</h3>
      <div class="grid3">
        <div class="field"><label for="a-prov">Province</label><select id="a-prov" required></select></div>
        <div class="field"><label for="a-dist">District</label><select id="a-dist" required></select></div>
        <div class="field"><label for="a-city">City / town</label><select id="a-city" required></select></div>
      </div>

      <h3 style="margin-top:22px">4. How should renters contact you?</h3>
      <div class="grid3">
        <div class="field"><label for="a-phone">Phone</label><input id="a-phone" type="tel" value="${esc(contact.phone)}" placeholder="07X XXX XXXX"${locked ? ' disabled' : ''}></div>
        <div class="field"><label for="a-wa">WhatsApp</label><input id="a-wa" type="tel" value="${esc(contact.whatsapp)}" placeholder="07X XXX XXXX"${locked ? ' disabled' : ''}></div>
        <div class="field"><label for="a-email">Email</label><input id="a-email" type="email" value="${esc(contact.email)}"${locked ? ' disabled' : ''}></div>
      </div>
      ${locked
        ? '<div class="hint" style="margin:-6px 0 6px">These are shown publicly on your ad. Phone and WhatsApp use your verified mobile number, and email is the one you log in with. <a href="#" id="a-change-number" style="text-decoration:underline">Change number</a></div>'
        : '<div class="hint" style="margin:-6px 0 6px">Add at least one. These are shown publicly on your ad.</div>'}

      <h3 style="margin-top:22px">5. Photos <span class="muted" style="font-weight:400">(at least 1)</span></h3>
      <div class="img-grid" id="photo-grid"></div>
      <label class="drop" for="a-files" id="drop" style="margin-top:10px">${icon('image')} Add 1 to ${MAX_PHOTOS} photos (5 MB each, JPG, PNG or WebP)</label>
      <input id="a-files" type="file" accept="image/jpeg,image/png,image/webp" multiple class="sr-only">
      <div class="hint">The first photo is the cover. Clear, bright photos get more calls. Up to ${MAX_PHOTOS} photos per ad (5 MB each). Big photos from your phone are shrunk for you.</div>
      <div class="hint"><strong>Best photo size: 1600 × 900 px (wide, 16:9).</strong> Your ad page shows the whole photo, but the small photos in lists use this wide shape, so upright or square photos get their top and bottom cut off there. Turn your phone sideways or crop to this size, and keep the item in the middle.</div>

      ${admin && ad ? `
      <h3 style="margin-top:22px">Admin controls</h3>
      <div class="grid3">
        <div class="field"><label for="a-status">Status</label><select id="a-status">
          ${[['pending', 'Pending'], ['approved', 'Live'], ['rejected', 'Rejected'], ['removed', 'Removed']].map(([k, l]) => `<option value="${k}"${ad.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="a-reason">Rejection reason (shown to the vendor)</label><input id="a-reason" type="text" value="${esc(v('rejection_reason'))}"></div>` : ''}

      <div id="form-msg" role="alert"></div>
      <div class="row" style="margin-top:12px">
        <button class="btn" type="submit" id="save-btn">${ad ? (admin ? 'Save changes' : 'Save and send for review') : 'Submit ad for review'}</button>
        <button class="btn btn-ghost" type="button" id="cancel-btn">Cancel</button>
      </div>
      ${!ad ? '<p class="hint">Every ad is checked by the RentAds team before it appears on the site.</p>' : ''}
    </form>`;

  const form = qs('#ad-form', container);
  const $ = (id) => qs(id, container);
  const msg = (t) => { $('#form-msg').innerHTML = t ? `<div class="notice bad" role="alert">${esc(t)}</div>` : ''; };

  /* ---- category cascade ---- */
  $('#a-root').innerHTML = optionList(ref.mains, rootCat?.id, 'Choose a category');
  const fillSub = (rootId, selected) => {
    const subs = rootId ? ref.subsOf(+rootId) : [];
    if (!selected && subs.length === 1) selected = subs[0].id; // only one choice, so pick it (for example Other)
    $('#a-cat').innerHTML = rootId ? optionList(subs, selected, 'Choose a subcategory') : '<option value="">Choose a category first</option>';
  };
  fillSub(rootCat?.id, ad?.category_id);

  function renderAttrs() {
    const root = ref.catById.get(+$('#a-root').value);
    const defs = root ? ATTR_FIELDS[root.slug] || [] : [];
    $('#attr-box').innerHTML = defs.length
      ? `<h3 style="margin-top:18px">Details renters look for <span class="muted" style="font-weight:500;font-size:.85rem">(optional)</span></h3><div class="grid3">${defs.map(([key, label, type]) => {
        const cur = attrs[key] ?? '';
        if (Array.isArray(type)) {
          const opts = type.includes(cur) || cur === '' ? type : [...type, cur];
          return `<div class="field"><label for="attr-${key}">${esc(label)}</label><select id="attr-${key}" data-attr="${key}"><option value="">Not stated</option>${opts.map((o) => `<option${o === cur ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
        }
        return `<div class="field"><label for="attr-${key}">${esc(label)}</label><input id="attr-${key}" data-attr="${key}" type="${type}" ${type === 'number' ? 'min="0"' : 'maxlength="80"'} value="${esc(cur)}"></div>`;
      }).join('')}</div>` : '';
  }
  renderAttrs();
  $('#a-root').onchange = () => { fillSub($('#a-root').value, ''); renderAttrs(); };

  /* ---- location cascade ---- */
  const prov0 = ad?.province_id, dist0 = ad?.district_id, city0 = ad?.city_id;
  $('#a-prov').innerHTML = optionList(ref.provinces, prov0, 'Choose a province');
  const fillDist = (p, sel) => { $('#a-dist').innerHTML = p ? optionList(ref.districtsOf(+p), sel, 'Choose a district') : '<option value="">Choose a province first</option>'; };
  const fillCity = (d, sel) => { $('#a-city').innerHTML = d ? optionList(ref.citiesOf(+d), sel, 'Choose a city') : '<option value="">Choose a district first</option>'; };
  fillDist(prov0, dist0); fillCity(dist0, city0);
  $('#a-prov').onchange = () => { fillDist($('#a-prov').value, ''); fillCity('', ''); };
  $('#a-dist').onchange = () => fillCity($('#a-dist').value, '');

  /* ---- price helper ---- */
  const syncPrice = () => {
    const contact = $('#a-unit').value === 'contact';
    $('#a-price').disabled = contact;
    if (contact) $('#a-price').value = '';
  };
  $('#a-unit').onchange = syncPrice; syncPrice();

  /* ---- description counter ---- */
  if (locked) {
    const phoneNote = 'To use a different number, tap Change number below and verify the new one.';
    lockedField($('#a-phone'), phoneNote);
    lockedField($('#a-wa'), phoneNote);
    lockedField($('#a-email'), 'Your email cannot be changed. It is the Google account you log in with.');
    // change the number in a popup, so the ad being written stays on screen
    $('#a-change-number').onclick = (e) => {
      e.preventDefault();
      const m = openModal('<h3>Verify your mobile number</h3><div id="pv-box"></div>');
      const pv = mountPhoneVerify(m.el.querySelector('#pv-box'), {
        profile,
        onVerified: (fresh) => {
          m.close();
          if (!fresh?.phone_verified) return;
          $('#a-phone').value = $('#a-wa').value = phoneLocal(fresh.phone);
        },
      });
      m.back.addEventListener('closed', pv.stop);
    };
  }
  const count = () => { $('#desc-count').textContent = $('#a-desc').value.length; };
  $('#a-desc').oninput = count; count();

  /* ---- photos ---- */
  // photo error sits right under the upload box, and the whole box turns red
  function clearPhotoErr() {
    container.querySelector('#photo-err')?.remove();
    const d = $('#drop'); if (d) { d.style.borderColor = ''; d.style.background = ''; d.style.color = ''; }
  }
  function showPhotoErr() {
    clearPhotoErr();
    const d = $('#drop'); if (!d) return;
    d.style.borderColor = 'var(--danger)'; d.style.background = 'var(--danger-bg)'; d.style.color = 'var(--danger-dk)';
    d.insertAdjacentHTML('afterend', '<div class="err" id="photo-err" role="alert">Add at least 1 photo. Ads with clear photos get far more enquiries.</div>');
    return d;
  }

  function renderPhotos() {
    if (photos.length) clearPhotoErr();
    $('#photo-grid').innerHTML = photos.map((p, i) => `<div class="img-cell"><img src="${esc(p.url)}" alt="Photo ${i + 1}">
      <button type="button" data-multi data-rm="${i}" aria-label="Remove photo ${i + 1}">${icon('x', 'sm')}</button>
      ${i === 0 ? '<span class="badge featured">Cover</span>'
        : `<button type="button" data-multi class="cover-btn" data-cover="${i}">Make cover</button>`}</div>`).join('');
    $('#drop').classList.toggle('hidden', photos.length >= MAX_PHOTOS);
    qsa('[data-rm]', container).forEach((b) => (b.onclick = () => {
      const [gone] = photos.splice(+b.dataset.rm, 1);
      if (gone.id) removed.push(gone);
      renderPhotos();
    }));
    qsa('[data-cover]', container).forEach((b) => (b.onclick = () => {
      const [p] = photos.splice(+b.dataset.cover, 1);
      photos.unshift(p); renderPhotos();
    }));
  }
  renderPhotos();
  $('#a-files').onchange = (e) => {
    const room = MAX_PHOTOS - photos.length;
    const files = [...e.target.files];
    let skippedBig = 0, skippedType = 0;
    files.slice(0, room).forEach((f) => {
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { skippedType++; return; }
      if (f.size > MAX_ORIGINAL) { skippedBig++; return; }
      photos.push({ file: f, url: URL.createObjectURL(f) });
    });
    if (files.length > room) ruleToast(`Only ${MAX_PHOTOS} photos are allowed per ad.`);
    if (skippedType) ruleToast('Only JPG, PNG or WebP photos can be added.');
    if (skippedBig) ruleToast('A photo was too large (over 15 MB). Choose a smaller one or lower the camera quality.');
    e.target.value = '';
    renderPhotos();
  };

  $('#cancel-btn').onclick = onCancel;

  /* ---- save ---- */
  form.onsubmit = async (e) => {
    e.preventDefault();
    clearErrors(container); msg('');
    const title = $('#a-title').value.trim();
    const description = $('#a-desc').value.trim();
    const catId = +$('#a-cat').value;
    const unit = $('#a-unit').value;
    const priceRaw = $('#a-price').value.trim();
    const phone = $('#a-phone').value.trim(), whatsapp = $('#a-wa').value.trim(), email = $('#a-email').value.trim();

    const errs = [];
    if (!$('#a-root').value) errs.push([$('#a-root'), 'Choose the category that fits your item best.']);
    if (!catId) errs.push([$('#a-cat'), 'Choose a subcategory so renters can find your ad.']);
    if (title.length < 5) errs.push([$('#a-title'), 'The title needs at least 5 characters. Name the item, for example "Toyota KDH 14 seater van".']);
    if (description.length < 20) errs.push([$('#a-desc'), 'The description needs at least 20 characters. Say what is included and the rental terms.']);
    if (unit !== 'contact' && !(Number(priceRaw) > 0)) errs.push([$('#a-price'), 'Enter the price in rupees, or choose Contact for price.']);
    if (!$('#a-prov').value) errs.push([$('#a-prov'), 'Choose the province where the item is.']);
    if (!$('#a-dist').value) errs.push([$('#a-dist'), 'Choose the district where the item is.']);
    if (!$('#a-city').value) errs.push([$('#a-city'), 'Choose the city or town where the item is.']);
    if (!locked) { // locked contact details come from the account, so there is nothing to check
      if (!phone && !whatsapp && !email) errs.push([$('#a-phone'), 'Add at least one way for renters to contact you: phone, WhatsApp or email.']);
      if (phone && !isValidLkPhone(phone)) errs.push([$('#a-phone'), 'This phone number does not look right. Use a Sri Lankan number like 0771234567.']);
      if (whatsapp && !isValidLkPhone(whatsapp)) errs.push([$('#a-wa'), 'This WhatsApp number does not look right. Use a Sri Lankan number like 0771234567.']);
      if (email && !/^\S+@\S+\.\S+$/.test(email)) errs.push([$('#a-email'), 'This email address does not look right. Check it for typing mistakes.']);
    }
    const noPhoto = !photos.length && !admin;
    const photoBox = noPhoto ? showPhotoErr() : (clearPhotoErr(), null);
    // show every problem at once, first one in view
    if (errs.length || noPhoto) {
      const total = errs.length + (noPhoto ? 1 : 0);
      if (photoBox && !errs.length) photoBox.scrollIntoView({ block: 'center', behavior: 'smooth' });
      [...errs].reverse().forEach(([el, text]) => fieldError(el, text));
      msg(total === 1 ? 'One thing needs fixing. It is marked in red.' : `${total} things need fixing. They are all marked in red.`);
      return;
    }

    // keep unknown attribute keys, replace the ones this form manages
    const attributes = { ...attrs };
    ALL_ATTR_KEYS.forEach((k) => delete attributes[k]);
    qsa('[data-attr]', container).forEach((el) => { const val = el.value.trim(); if (val) attributes[el.dataset.attr] = el.tagName === 'INPUT' && el.type === 'number' ? Number(val) : val; });

    const payload = {
      category_id: catId, title, description, price_unit: unit,
      price: unit === 'contact' ? null : Number(priceRaw),
      province_id: +$('#a-prov').value, district_id: +$('#a-dist').value, city_id: +$('#a-city').value,
      phone: phone || null, whatsapp: whatsapp || null, email: email || null, attributes,
    };
    if (admin && ad) {
      payload.status = $('#a-status').value;
      payload.rejection_reason = payload.status === 'rejected' ? ($('#a-reason').value.trim() || null) : null;
    }

    const btn = $('#save-btn');
    const setBtn = (t, dis = true) => { btn.textContent = t; btn.disabled = dis; };
    setBtn('Saving');

    let step = 'saving the ad details';
    try {
      let id = adId;
      if (ad) {
        // select first: ad blockers block web addresses shaped like /ads?id=..., so keep select= at the front
        const { data: saved, error } = await sb.from('ads').update(payload).select('id').eq('id', ad.id);
        if (error) throw error;
        if (!saved || !saved.length) throw new Error('This ad could not be saved. Refresh the page and try again.');
      } else {
        const { data, error } = await sb.from('ads').insert({ ...payload, vendor_id: session.user.id }).select('id').single();
        if (error) throw error;
        id = data.id;
      }

      // remove deleted photos
      step = 'removing old photos';
      if (removed.length) {
        const { error } = await sb.from('ad_images').delete().in('id', removed.map((r) => r.id));
        if (error) throw error;
        const paths = withThumbs(removed.map((r) => r.path));
        if (paths.length) await sb.storage.from('ad-images').remove(paths);
      }

      // upload new photos
      step = 'uploading photos';
      let failed = 0;
      const fresh = photos.filter((p) => p.file);
      for (let i = 0; i < fresh.length; i++) {
        setBtn(`Uploading photo ${i + 1} of ${fresh.length}`);
        const { blob, small, marked } = await shrink(fresh[i].file);
        if (blob.size > MAX_UPLOAD) { failed++; continue; } // could not shrink it under 5 MB
        // "-wm" in the name tells the backfill script this photo already has the watermark
        const path = `${session.user.id}/${id}/${crypto.randomUUID()}${marked ? '-wm' : ''}.jpg`;
        let up;
        // a watermarked photo is never changed again (new name every time), so browsers and the CDN may keep it for a year;
        // an unmarked one is overwritten later by the backfill script, so it keeps the short default
        const cacheControl = marked ? '31536000' : '3600';
        try { up = await sb.storage.from('ad-images').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl }); }
        catch (upErr) { up = { error: upErr }; } // a dropped request must not lose the whole save
        if (up.error) { failed++; console.error('photo upload failed', up.error); continue; }
        // the small copy for the listing cards; if it does not arrive, the cards show the full photo instead
        if (small) {
          try {
            const t = await sb.storage.from('ad-images').upload(thumbPath(path), small, { contentType: 'image/jpeg', upsert: false, cacheControl });
            if (t.error) console.error('small photo upload failed', t.error);
          } catch (tErr) { console.error('small photo upload failed', tErr); }
        }
        fresh[i].path = path;
        const { data, error } = await sb.from('ad_images').insert({ ad_id: id, path, sort_order: 999 }).select('id').single();
        if (error) { failed++; console.error(error); fresh[i].path = null; continue; }
        fresh[i].id = data.id;
      }

      // final cover order
      step = 'ordering photos';
      const ordered = photos.filter((p) => p.id);
      for (let i = 0; i < ordered.length; i++) {
        const { error } = await sb.from('ad_images').update({ sort_order: i }).eq('id', ordered[i].id);
        if (error) console.error(error);
      }

      if (failed) toast(`${failed} photo${failed > 1 ? 's' : ''} could not be uploaded. Open the ad to add ${failed > 1 ? 'them' : 'it'} again.`, 'bad');
      toast(admin ? 'Ad saved' : ad ? 'Saved. Your ad is back in review.' : 'Submitted! Your ad will go live once the team approves it.', 'good');
      onSaved({ id });
    } catch (err) {
      // which step failed goes into the report email, not on screen
      $('#form-msg').innerHTML = errorNotice(err, 'save this ad', `stopped at: ${step}`);
      setBtn(ad ? (admin ? 'Save changes' : 'Save and send for review') : 'Submit ad for review', false);
    }
  };
}
