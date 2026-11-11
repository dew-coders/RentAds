// Shared helpers: icons, formatting, auth, reference data, header/footer, toasts, modals, ad cards.
import { sb, cached, forgetCached, remember, recall } from './supabase.js';
import { SUPABASE_URL, SUPPORT_EMAIL, SOCIAL_LINKS } from './config.js';
import { trackError, cleanUrl } from './monitor.js';
import './i18n.js'; // English / Sinhala switch, runs on every page that uses these helpers

/* ---------------- tiny DOM + text helpers ---------------- */
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setTitle(title) {
  // pages the Worker has already given a full search-friendly title keep it
  if (document.querySelector('meta[name="rentads-seo"]')) return;
  document.title = title ? `${title} | RentAds.lk` : 'RentAds.lk | Rent anything in Sri Lanka';
}

/* ---------------- clean links (the Worker in worker.js serves these) ---------------- */
/* BASE is the folder the site lives in: "/beta/" now, "/" once the site moves to the root. */
export const BASE = new URL('../', import.meta.url).pathname;

/* Same rules as slugify() in worker.js, so a link built here is already the canonical one. */
export function slugify(text, fallback = 'rental') {
  const s = String(text || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60).replace(/-+$/, '');
  return s || fallback;
}
/* Relative on purpose: it works from every page under BASE, and the Worker adds a base tag to the ad pages. */
export const adPath = (ad) => `rental/${slugify(ad.title, 'rental')}-${ad.id}`;
export const wantPath = (r) => `request/${slugify(r.title, 'request')}-${r.id}`;

const UUID_AT_END = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
/* The id of the ad or request being viewed: from the clean link, or from an old ?id= link. */
export function pageId() {
  const m = location.pathname.match(UUID_AT_END);
  return m ? m[1] : new URLSearchParams(location.search).get('id');
}

/* The current page as a path under BASE, for ?next= after logging in (clean links included). */
export function hereForNext() {
  const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.split('/').pop();
  return path + location.search + location.hash;
}

/* ---------------- icons (one style: 1.6px line, round caps) ---------------- */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
  tent: '<path d="M3.5 21 14 3M20.5 21 10 3M15.5 21 12 15l-3.5 6M2 21h20"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  laptop: '<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.3 2.3c.3.6-.1 1.7-1 1.7H3.7c-.9 0-1.3-1.1-1-1.7L4 16"/>',
  shirt: '<path d="M20.4 6.7 16 3l-4 2-4-2-4.4 3.7a1 1 0 0 0-.3 1.1l1.3 3.5a1 1 0 0 0 1.2.6L8 13v8h8v-8l1.2.1a1 1 0 0 0 1.2-.6l1.3-3.5a1 1 0 0 0-.3-1.1z"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2z"/>',
  box: '<path d="m21 8-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  down: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  wifi: '<path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0"/><circle cx="12" cy="19.5" r=".8"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.5" r=".8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5"/><circle cx="12" cy="7.5" r=".8"/>',
  facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  instagram: '<rect width="20" height="20" x="2" y="2" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8"/>',
  tiktok: '<path d="M15 3v12.5a4.5 4.5 0 1 1-4.5-4.5"/><path d="M15 3c.4 2.6 2.2 4.4 5 4.6"/>',
};
const CAT_ICON = {
  all: 'grid', vehicles: 'car', properties: 'home', 'equipment-tools': 'wrench', 'event-gear': 'tent',
  'cameras-av': 'camera', electronics: 'laptop', 'fashion-costumes': 'shirt', 'sports-outdoor': 'mountain', other: 'box',
};
export const icon = (name, cls = '') =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ICONS.box}</svg>`;
export const catIcon = (slug, cls = '') => icon(CAT_ICON[slug] || 'box', cls);

/* ---------------- category illustrations (flat, one blue accent + neutrals) ---------------- */
/* Colours come from the classes in app.css (.cat-art .a, .al, .d ...), so they follow the design system. */
const CAT_ART = {
  all: '<circle class="halo" cx="112" cy="78" r="56"/>'
    + '<rect class="w o" x="40" y="48" width="64" height="76" rx="6"/><rect class="g" x="46" y="54" width="52" height="36" rx="3"/>'
    + '<rect class="g" x="46" y="97" width="36" height="5" rx="2.5"/><rect class="a" x="46" y="108" width="24" height="7" rx="3.5"/>'
    + '<rect class="w o" x="112" y="30" width="64" height="76" rx="6"/><rect class="a" x="118" y="36" width="52" height="36" rx="3"/>'
    + '<rect class="g" x="118" y="79" width="36" height="5" rx="2.5"/><rect class="d" x="118" y="90" width="24" height="7" rx="3.5"/>'
    + '<circle class="w" cx="160" cy="46" r="8"/><path class="st s2 ck" d="M156.5 46.5l2.4 2.4 4.6-4.8"/>',
  vehicles: '<circle class="halo" cx="108" cy="74" r="54"/><rect class="g" x="14" y="118" width="172" height="8" rx="4"/>'
    + '<path class="a" d="M30 104V90Q30 84 36 82L60 78L76 58Q80 54 86 54H134Q140 54 144 58L158 78L172 82Q178 84 178 90V104Z"/>'
    + '<polygon class="al2" points="82,60 70,77 104,77 104,60"/><polygon class="al2" points="110,60 110,77 152,77 140,60"/>'
    + '<rect class="w" x="166" y="86" width="9" height="6" rx="2"/><rect class="ad" x="30" y="96" width="148" height="8"/>'
    + '<circle class="d" cx="62" cy="106" r="15"/><circle class="g" cx="62" cy="106" r="6"/>'
    + '<circle class="d" cx="146" cy="106" r="15"/><circle class="g" cx="146" cy="106" r="6"/>',
  properties: '<circle class="halo" cx="110" cy="78" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<rect class="w o" x="84" y="34" width="62" height="90" rx="4"/>'
    + '<rect class="al2" x="94" y="46" width="14" height="12" rx="2"/><rect class="al2" x="122" y="46" width="14" height="12" rx="2"/>'
    + '<rect class="al2" x="94" y="68" width="14" height="12" rx="2"/><rect class="a" x="122" y="68" width="14" height="12" rx="2"/>'
    + '<rect class="a" x="106" y="98" width="18" height="26" rx="2"/>'
    + '<path class="a" d="M26 124V90L52 68L78 90V124Z"/><path class="ad" d="M20 92L52 64L84 92Z"/>'
    + '<rect class="al2" x="43" y="98" width="18" height="26" rx="2"/>'
    + '<rect class="d" x="162" y="98" width="5" height="26"/><circle class="a" cx="164.5" cy="88" r="16"/>',
  'equipment-tools': '<circle class="halo" cx="106" cy="78" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<path class="st" d="M154 70H168V112"/><rect class="d" x="68" y="42" width="64" height="7" rx="3.5"/>'
    + '<rect class="a" x="46" y="52" width="108" height="64" rx="9"/><rect class="al2" x="54" y="60" width="92" height="48" rx="6"/>'
    + '<rect class="a" x="62" y="67" width="34" height="22" rx="3"/><circle class="d" cx="73" cy="78" r="3.5"/><circle class="d" cx="86" cy="78" r="3.5"/>'
    + '<rect class="al" x="106" y="68" width="30" height="4" rx="2"/><rect class="al" x="106" y="77" width="30" height="4" rx="2"/>'
    + '<rect class="al" x="106" y="86" width="30" height="4" rx="2"/><rect class="al" x="106" y="95" width="30" height="4" rx="2"/>'
    + '<circle class="al2" cx="78" cy="99" r="4"/>'
    + '<circle class="d" cx="62" cy="120" r="9"/><circle class="g" cx="62" cy="120" r="3.5"/>'
    + '<circle class="d" cx="138" cy="120" r="9"/><circle class="g" cx="138" cy="120" r="3.5"/>',
  'event-gear': '<circle class="halo" cx="104" cy="76" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<rect class="d" x="98" y="20" width="4" height="18"/><path class="a" d="M102 20L118 25L102 30Z"/>'
    + '<path class="a" d="M100 36L158 72H42Z"/><path class="ad" d="M100 36L120 72H80Z"/>'
    + '<rect class="w o" x="52" y="72" width="96" height="52"/>'
    + '<circle class="a" cx="60" cy="72" r="8"/><circle class="w o" cx="76" cy="72" r="8"/><circle class="a" cx="92" cy="72" r="8"/>'
    + '<circle class="w o" cx="108" cy="72" r="8"/><circle class="a" cx="124" cy="72" r="8"/><circle class="w o" cx="140" cy="72" r="8"/>'
    + '<path class="d" d="M86 124V98Q100 84 114 98V124Z"/>'
    + '<circle class="a" cx="40" cy="84" r="4"/><circle class="al2" cx="162" cy="62" r="5"/><circle class="a" cx="170" cy="82" r="3"/>',
  'cameras-av': '<circle class="halo" cx="106" cy="76" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<path class="a" d="M80 54L88 40H122L130 54Z"/><rect class="a" x="50" y="52" width="108" height="66" rx="10"/>'
    + '<rect class="al2" x="50" y="64" width="108" height="10"/><rect class="ad" x="132" y="58" width="14" height="8" rx="2"/>'
    + '<circle class="ad" cx="104" cy="92" r="27"/><circle class="d" cx="104" cy="92" r="20"/><circle class="a" cx="104" cy="92" r="12"/>'
    + '<circle class="w" cx="98" cy="86" r="3.5"/><circle class="a" cx="68" cy="60" r="4"/>',
  electronics: '<circle class="halo" cx="104" cy="76" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<rect class="a" x="40" y="40" width="98" height="64" rx="7"/><rect class="al2" x="46" y="46" width="86" height="52" rx="3"/>'
    + '<rect class="al2" x="54" y="54" width="34" height="6" rx="3"/><rect class="al" x="54" y="66" width="52" height="5" rx="2.5"/><rect class="al" x="54" y="76" width="40" height="5" rx="2.5"/>'
    + '<path class="g o" d="M30 106H148L143 118Q142 121 139 121H39Q36 121 35 118Z"/><rect class="al2" x="74" y="107" width="30" height="4" rx="2"/>'
    + '<rect class="a" x="146" y="62" width="32" height="58" rx="7"/><rect class="al2" x="150" y="68" width="24" height="44" rx="3"/><circle class="a" cx="162" cy="90" r="7"/>',
  'fashion-costumes': '<circle class="halo" cx="104" cy="78" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<path class="st" d="M100 40V34A5 5 0 1 1 106 39"/><path class="st s2" d="M100 41L76 58H124Z"/>'
    + '<path class="a" d="M84 62Q100 74 116 62L112 84H88Z"/>'
    + '<path class="a" d="M88 84H112L140 122H60Z"/><path class="ad" d="M100 84L112 122H96Z"/><rect class="d" x="86" y="82" width="28" height="5" rx="2.5"/>'
    + '<path class="a" d="M44 52l3.5 9.5L57 65l-9.5 3.5L44 78l-3.5-9.5L31 65l9.5-3.5Z"/>'
    + '<path class="al2" d="M158 80l2.5 6.5L167 89l-6.5 2.5L158 98l-2.5-6.5L149 89l6.5-2.5Z"/>',
  'sports-outdoor': '<circle class="halo" cx="112" cy="70" r="54"/><circle class="w" cx="156" cy="40" r="10"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<path class="al2" d="M72 124L116 56L160 124Z"/><path class="w" d="M116 56L128 75L120 72L116 78L110 71L104 74Z"/>'
    + '<path class="a" d="M20 124L68 64L116 124Z"/><path class="ad" d="M68 64L80 79L73 76L68 82L62 75L56 78Z"/>'
    + '<path class="d" d="M138 124L156 98L174 124Z"/><path class="al" d="M156 108L149 124H163Z"/>',
  box: '<circle class="halo" cx="104" cy="76" r="54"/><rect class="g" x="14" y="122" width="172" height="6" rx="3"/>'
    + '<path class="a" d="M100 38L148 60V102L100 124L52 102V60Z"/><path class="al2" d="M100 38L148 60L100 82L52 60Z"/>'
    + '<path class="ad" d="M100 82V124L52 102V60Z"/><path class="st s2 w-st" d="M100 82V124"/><rect class="w" x="106" y="92" width="22" height="6" rx="3"/>',
};
export const catArt = (slug) =>
  `<svg class="cat-art" viewBox="0 0 200 140" aria-hidden="true" focusable="false">${CAT_ART[slug] || CAT_ART.box}</svg>`;

/* ---------------- formatting ---------------- */
export const UNITS = { hour: 'hour', day: 'day', week: 'week', month: 'month', event: 'event' };
export const UNIT_OPTIONS = [
  ['day', 'per day'], ['hour', 'per hour'], ['week', 'per week'],
  ['month', 'per month'], ['event', 'per event'], ['contact', 'Contact for price'],
];

export function priceTag(ad, big = false) {
  const cls = big ? ' big' : '';
  if (ad.price_unit === 'contact' || ad.price === null || ad.price === undefined || ad.price === '') {
    return `<span class="price contact${cls}">Contact for price</span>`;
  }
  const n = Number(ad.price).toLocaleString('en-LK', { maximumFractionDigits: 0 });
  return `<span class="price${cls}">Rs ${esc(n)} <small>per ${esc(UNITS[ad.price_unit] || ad.price_unit)}</small></span>`;
}

export function timeAgo(iso) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? 's' : ''} ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export const imgUrl = (path) =>
  /^https?:\/\//.test(path) ? path : `${SUPABASE_URL}/storage/v1/object/public/ad-images/${path.split('/').map(encodeURIComponent).join('/')}`;

/* Small copy of an ad photo for cards and thumbnails (640 px wide, about a quarter of the size), stored next to
   the photo: ".../abc-wm.jpg" -> ".../abc-wm-t.jpg". Made at upload (js/adform.js) and by the backfill script
   for older photos. Photos from other sites (http links) have none. */
export const thumbPath = (path) => (/^https?:\/\//.test(path) ? null : `${String(path).replace(/\.[a-z0-9]+$/i, '')}-t.jpg`);
/* Every stored file for these photos, small copies included: for deleting. */
export const withThumbs = (paths) => paths.filter((p) => p && !/^https?:\/\//.test(p)).flatMap((p) => [p, thumbPath(p)]);
/* An <img> showing the small copy. If it is missing (an old photo not done yet), the error handler in
   installGlobals() swaps in the full photo from data-full. */
export function photoImg(path, alt = '', extra = '') {
  const small = thumbPath(path);
  const full = imgUrl(path);
  return small
    ? `<img src="${esc(imgUrl(small))}" data-full="${esc(full)}" alt="${esc(alt)}"${extra}>`
    : `<img src="${esc(full)}" alt="${esc(alt)}"${extra}>`;
}

/* Profile pictures live in the public "avatars" bucket, one folder per user. */
export const avatarUrl = (path) =>
  path ? `${SUPABASE_URL}/storage/v1/object/public/avatars/${String(path).split('/').map(encodeURIComponent).join('/')}` : '';

/* A round avatar: the photo when there is one, otherwise the first letter of the name.
   cls is an extra class, for example "lg" for the big profile picture. */
export function avatarHtml(p, cls = '') {
  const name = p?.business_name || p?.full_name || '';
  const letter = esc(name.trim().charAt(0).toUpperCase() || 'R');
  const img = p?.avatar_path ? `<img src="${esc(avatarUrl(p.avatar_path))}" alt="" loading="lazy" decoding="async">` : '';
  return `<span class="avatar ${cls}" aria-hidden="true">${img || letter}</span>`;
}

/* Crop the middle square out of the photo and shrink it, so avatars are small and load fast.
   Used by Edit profile and by the Google photo copy at first sign-in (js/auth.js). */
export async function squareAvatar(file, size = 400, quality = 0.85) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(size, side);
  canvas.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not read this photo');
  return blob;
}

/* Sri Lankan numbers: 0771234567 / 077 123 4567 / +94771234567 -> 94771234567 */
export function phoneIntl(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('94')) return d;
  if (d.startsWith('0')) return '94' + d.slice(1);
  if (d.length === 9) return '94' + d;
  return d;
}
export const telLink = (raw) => `tel:+${phoneIntl(raw)}`;
export const waLink = (raw, text = '') =>
  `https://wa.me/${phoneIntl(raw)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const isValidLkPhone = (raw) => /^94\d{9}$/.test(phoneIntl(raw));
/* 94771234567 -> 077 123 4567 (how Sri Lankans write it); anything else is returned as it is */
export function phoneLocal(raw) {
  const d = phoneIntl(raw);
  return /^94\d{9}$/.test(d) ? `0${d.slice(2, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : String(raw || '');
}

export function cleanSearch(q) {
  return String(q || '').replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function safeNext(raw, fallback = 'dashboard.html') {
  if (!raw) return fallback;
  if (/^[a-z0-9_\-./#?=&]+$/i.test(raw) && !raw.startsWith('//') && !raw.includes(':')) return raw;
  return fallback;
}

const STATUS_LABEL = { pending: 'Pending', approved: 'Live', rejected: 'Rejected', removed: 'Removed', fulfilled: 'Found' };
export const statusBadge = (s) => `<span class="badge ${esc(s)}">${esc(STATUS_LABEL[s] || s)}</span>`;

/* Sample ads and requests (is_demo, set by admins only) shown until real ones arrive. */
export const demoBadge = () => '<span class="badge demo" title="Sample post to show how RentAds works">Demo</span>';
export const demoNotice = (kind) => `<div class="notice demo-note">${icon('info', 'sm')}<span>This is a sample ${kind} to show how RentAds works. The contact details are not real.</span></div>`;

/* ---------------- errors ----------------
   Every error says in plain words what went wrong and what to do next. Technical details are never
   shown on screen; they go into the "Report this problem" email so the team can see what happened. */

/* Turn any error into a plain sentence that says what is wrong and what to do. */
export function explain(err, doing = 'finish this action') {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  const status = Number(err?.status || 0);
  if (!navigator.onLine) return `You are not connected to the internet, so we could not ${doing}. Check your wifi or mobile data, then try again.`;
  // waited twice for a slow connection (see patientFetch in supabase.js)
  if (/slowconnection|too slow|aborterror|signal is aborted/i.test(msg) || err?.name === 'SlowConnection') return `Your internet connection is very slow right now, so we could not ${doing}. Wait a moment, then try again.`;
  if (/failed to fetch|networkerror|load failed|network request|blocked/i.test(msg)) return `We could not reach RentAds, so we could not ${doing}. Check your connection. If you use an ad blocker, turn it off for RentAds.lk, then try again.`;
  if (/jwt|token.*expired|refresh token|session.*(expired|missing)/i.test(msg) || status === 401) return 'You have been logged out. Log In again, then try once more.';
  if (/row-level security|permission denied|not authorized/i.test(msg) || code === '42501' || status === 403) return `You are not allowed to ${doing}. Make sure you are logged in with the right account, then try again.`;
  if (code === '23505' || /duplicate key/i.test(msg)) return 'That already exists. Use a different name and try again.';
  if (code === '23503') return 'This is still in use by other records. Move or remove those first, then try again.';
  if (code === '23514' || /violates check constraint/i.test(msg)) return 'One of the details is not allowed. Check the form, then try again.';
  if (code === '22001' || /value too long/i.test(msg)) return 'Some of the text you typed is too long. Shorten it, then try again.';
  if (code === '23502' || /null value in column/i.test(msg)) return 'Something you need to fill in is missing. Check the form, then try again.';
  if (['22P02', '22007', '22008', '22003'].includes(code) || /invalid input syntax|out of range/i.test(msg)) return 'One of the details is in the wrong format. Check the form, then try again.';
  if (code === 'PGRST116') return 'We could not find that. It may have been removed. Go back and try again.';
  if (['57014', '53300', '53400', '40001', '40P01'].includes(code) || /^PGRST00\d$/.test(code) || /statement timeout|too many connections|deadlock/i.test(msg)) return `RentAds is very busy right now, so we could not ${doing}. Wait a minute, then try again.`;
  if (/rate limit|too many requests/i.test(msg) || status === 429) return 'Too many tries in a short time. Wait a few minutes, then try again.';
  if (/payload too large|too large|exceeded the maximum/i.test(msg) || status === 413) return 'That file is too large. Choose a smaller one and try again.';
  if (/timeout|timed out/i.test(msg) || status >= 500) return `RentAds is not answering right now, so we could not ${doing}. Wait a minute, then try again.`;
  // messages our database writes for people (for example "You already have 10 ads...") are already plain
  if (code === 'P0001' && /^[A-Z].*\.$/.test(msg)) return msg;
  return `We could not ${doing} just now. Please try again in a moment. If it keeps happening, tap Report this problem.`;
}

/* A mailto link to the team, with the page, time, device and error details filled in. */
export function reportHref(doing = '', err = null, shown = '', note = '') {
  const tech = [err?.code, err?.status, err?.message || (typeof err === 'string' ? err : ''), note].filter(Boolean).join(' | ').slice(0, 400);
  const lines = [
    'Hi RentAds team,', '', 'Something went wrong on the website.', '',
    `What I was trying to do: ${doing || ''}`,
    shown ? `What the website said: ${shown}` : null,
    `Page: ${cleanUrl()}`,
    `Time: ${new Date().toString()}`,
    `Device: ${navigator.userAgent}`,
    tech ? `Error details: ${tech}` : null,
    '', 'Anything else you want to tell us:', '',
  ].filter((l) => l !== null);
  const subject = `Problem on RentAds.lk${doing ? `: could not ${doing}` : ''}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export function reportBtn(doing, err, shown, cls = 'btn btn-ghost') {
  return `<a class="${cls}" data-multi href="${esc(reportHref(doing, err, shown))}">${icon('mail', 'sm')} Report this problem</a>`;
}

/* The error card that takes the place of content that could not load.
   retry: true reloads the page, a string gives the Try again button that id (the page wires it up), false hides it. */
export function errorBox(err, doing, { title = 'This part could not load', retry = true, track = true } = {}) {
  if (err) console.error(err);
  const text = explain(err, doing);
  if (track) trackError(err, doing, text);
  const again = typeof retry === 'string' ? `<button class="btn" type="button" data-multi id="${esc(retry)}">Try again</button>`
    : retry ? '<button class="btn" type="button" data-multi data-reload>Try again</button>' : '';
  return `<div class="card empty err-box" role="alert">${icon('alert')}<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
    <div class="row" style="justify-content:center">${again}${reportBtn(doing, err, text)}</div></div>`;
}

/* A rule of the site (a limit the database states in plain words, or "too many tries"), not a fault.
   These show without "Report this problem" and are not sent to error tracking. */
export function isRule(err) {
  const msg = String(err?.message || '');
  return (String(err?.code || '') === 'P0001' && /^[A-Z].*\.$/.test(msg))
    || Number(err?.status || 0) === 429 || /rate limit|too many requests/i.test(msg);
}

/* A red note inside a form or popup (saving failed), with the report link under it. */
export function errorNotice(err, doing, note = '') {
  const text = explain(err, doing);
  if (isRule(err)) return `<div class="notice bad" role="alert">${esc(text)}</div>`;
  if (err) console.error(err, note);
  trackError(err, doing, text, note);
  return `<div class="notice bad" role="alert">${esc(text)}<a class="report-link" data-multi href="${esc(reportHref(doing, err, text, note))}">${icon('mail', 'sm')} Report this problem</a></div>`;
}

/* A short error message at the bottom of the screen, for actions such as delete or approve. */
export function errorToast(err, doing) {
  const text = explain(err, doing);
  if (isRule(err)) { ruleToast(text); return; }
  if (err) console.error(err);
  trackError(err, doing, text);
  toast(text, 'bad', { doing, err });
}

/* A red message for a rule the person ran into (for example "Only 5 photos are allowed per ad").
   It is not a fault on our side, so there is no "Report this problem" link. */
export function ruleToast(message) {
  toast(message, 'bad', null, { noReport: true });
}

/* ---------------- field errors (shown under the field they belong to) ---------------- */
export function clearErrors(root = document) {
  qsa('.err', root).forEach((e) => e.remove());
  qsa('.bad', root).forEach((e) => e.classList.remove('bad'));
}
export function fieldError(el, text) {
  if (typeof el === 'string') el = qs(el);
  if (!el) return false;
  const wrap = el.closest('.field') || el.parentElement;
  wrap.querySelectorAll(':scope > .err').forEach((e) => e.remove());
  const d = document.createElement('div');
  d.className = 'err'; d.setAttribute('role', 'alert'); d.textContent = text;
  wrap.appendChild(d);
  el.classList.add('bad');
  if (el.focus) el.focus({ preventScroll: false });
  el.scrollIntoView?.({ block: 'center' });
  const off = () => { el.classList.remove('bad'); d.remove(); el.removeEventListener('input', off); el.removeEventListener('change', off); };
  el.addEventListener('input', off); el.addEventListener('change', off);
  return false;
}

/* A greyed-out (disabled) field people cannot change: tapping it shows why, under the field.
   Disabled inputs swallow taps, so the input lets them through to its .field box. */
export function lockedField(el, text) {
  if (typeof el === 'string') el = qs(el);
  if (!el) return;
  el.style.pointerEvents = 'none';
  const wrap = el.closest('.field') || el.parentElement;
  wrap.addEventListener('click', () => {
    if (wrap.querySelector(':scope > .locked-note')) return;
    const d = document.createElement('div');
    d.className = 'hint locked-note'; d.setAttribute('role', 'status'); d.textContent = text;
    wrap.appendChild(d);
  });
}

/* ---------------- toasts & modals ---------------- */
/* opts.link = { href, label } adds a link under the message (for example "View saved ads"); opts.ms changes how long it stays. */
export function toast(message, type = '', report = null, opts = {}) {
  let box = qs('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = message;
  // every error message can be sent to the team in one tap (not rule messages, see ruleToast)
  if (type === 'bad' && !opts.noReport) {
    const a = document.createElement('a');
    a.className = 'report-link';
    a.href = reportHref(report?.doing || '', report?.err || null, message);
    a.innerHTML = `${icon('mail', 'sm')} Report this problem`;
    t.appendChild(a);
  }
  if (opts.link) {
    const a = document.createElement('a');
    a.className = 'toast-link';
    a.href = opts.link.href;
    a.innerHTML = `${esc(opts.link.label)} ${icon('next', 'sm')}`;
    t.classList.add('has-link'); // message on the left, link on the right
    t.appendChild(a);
  }
  box.appendChild(t);
  setTimeout(() => t.remove(), opts.ms || (type === 'bad' ? 12000 : 3200));
}

let modalCount = 0;
export function openModal(innerHtml) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="x" type="button" aria-label="Close">${icon('x')}</button>${innerHtml}</div>`;
  document.body.appendChild(back);
  modalCount++; document.body.classList.add('locked');
  const close = () => {
    if (!back.isConnected) return;
    back.remove(); document.removeEventListener('keydown', onKey);
    modalCount = Math.max(0, modalCount - 1);
    if (!modalCount) document.body.classList.remove('locked');
    back.dispatchEvent(new Event('closed'));
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('.x').onclick = close;
  return { el: back.firstElementChild, close, back };
}

export function confirmBox(message, okText = 'Confirm', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(`<h3>${esc(message)}</h3>
      <div class="row" style="justify-content:flex-end;margin-top:20px">
        <button class="btn btn-ghost" data-no>Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : ''}" data-yes>${esc(okText)}</button>
      </div>`);
    const done = (v) => { if (answered) return; answered = true; m.close(); resolve(v); };
    m.back.addEventListener('closed', () => done(false));
    m.el.querySelector('[data-no]').onclick = () => done(false);
    m.el.querySelector('[data-yes]').onclick = () => done(true);
  });
}

/* Ask for a short note (for example a rejection reason). Resolves to a string, or null if cancelled. */
export function askNote({ title, label, presets = [], okText = 'Save', required = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const chips = presets.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p)}</button>`).join(' ');
    const m = openModal(`<h3>${esc(title)}</h3>
      <div class="field"><label for="note-text">${esc(label)}</label>
      <textarea id="note-text" style="min-height:96px"></textarea></div>
      ${chips ? `<div class="chips">${chips}</div>` : ''}
      <div class="row" style="justify-content:flex-end;margin-top:10px">
        <button class="btn btn-ghost" data-no>Cancel</button>
        <button class="btn" data-yes>${esc(okText)}</button>
      </div>`);
    const done = (v) => { if (answered) return; answered = true; m.close(); resolve(v); };
    const ta = m.el.querySelector('#note-text');
    m.back.addEventListener('closed', () => done(null));
    m.el.querySelectorAll('[data-preset]').forEach((b) => (b.onclick = () => { ta.value = presets[+b.dataset.preset]; ta.dispatchEvent(new Event('input')); }));
    m.el.querySelector('[data-no]').onclick = () => done(null);
    m.el.querySelector('[data-yes]').onclick = () => {
      const v = ta.value.trim();
      if (required && !v) { fieldError(ta, 'Write a short reason so the vendor knows what to fix.'); return; }
      done(v);
    };
    ta.focus();
  });
}

/* ---------------- auth ---------------- */
let _session, _profile;
export async function getSession() {
  if (_session !== undefined) return _session;
  const { data } = await sb.auth.getSession();
  _session = data.session || null;
  return _session;
}
export async function getProfile(force = false) {
  const s = await getSession();
  if (!s) return null;
  if (_profile && !force) return _profile;
  // phone numbers in profiles are private, so your own profile comes through my_profile()
  const { data } = await sb.rpc('my_profile').maybeSingle();
  _profile = data;
  return _profile;
}
/* A different person may now be looking: pages kept for a short time could show what only the last one may see.
   supabase-js also says SIGNED_IN on every page load and whenever the tab comes back into view, for the same person.
   Forgetting then would also lose the lists kept for the Back button, so only a real change of person counts. */
const WHO = 'rs:who';
sb.auth.onAuthStateChange((event, session) => {
  _session = session; _profile = undefined;
  const who = session?.user?.id || '';
  let before = null;
  try { before = sessionStorage.getItem(WHO); sessionStorage.setItem(WHO, who); } catch { /* storage unavailable */ }
  if (event === 'USER_UPDATED' || (before !== null && before !== who)) forgetCached();
});

export async function requireLogin() {
  const s = await getSession();
  if (!s) {
    const here = hereForNext();
    location.replace(`login.html?next=${encodeURIComponent(here)}`);
    return null;
  }
  return s;
}

export async function requireAdmin() {
  const s = await requireLogin();
  if (!s) return null;
  const p = await getProfile();
  if (!p || p.role !== 'admin') {
    document.body.innerHTML = `<div class="wrap"><div class="card pad" style="max-width:480px;margin:60px auto;text-align:center">
      <h2>Admins only</h2><p class="muted">This area is for the RentAds team. Go back and use your vendor dashboard instead.</p><a class="btn" href="dashboard.html">Open Dashboard</a></div></div>`;
    return null;
  }
  return p;
}

export async function logout() {
  await sb.auth.signOut();
  location.href = 'index.html';
}

/* ---------------- reference data (categories + locations) ----------------
   Pages call loadRef() before initPage() so the lists download while the menu is drawn.
   Every caller shares the same request; a failed one is forgotten so the next call tries again.
   The lists are also kept in this tab for 5 minutes (an admin change clears them, see cached() in supabase.js). */
const REF_TTL = 5 * 60 * 1000;
let _refP;
export function loadRef() {
  if (!_refP) {
    _refP = fetchRef();
    _refP.catch(() => { _refP = undefined; });
  }
  return _refP;
}
async function fetchRef() {
  const { cats, locs } = await cached('ref', REF_TTL, async () => {
    const [c, l] = await Promise.all([
      sb.from('categories').select('id, parent_id, name, slug, icon, sort_order').order('sort_order').order('name'),
      sb.from('locations').select('id, parent_id, name, type').order('name'),
    ]);
    if (c.error) throw c.error;
    if (l.error) throw l.error;
    return { cats: c.data, locs: l.data };
  });
  return {
    cats, locs,
    catById: new Map(cats.map((x) => [x.id, x])),
    catBySlug: new Map(cats.map((x) => [x.slug, x])),
    locById: new Map(locs.map((x) => [x.id, x])),
    mains: cats.filter((x) => !x.parent_id),
    subsOf: (id) => cats.filter((x) => x.parent_id === id),
    provinces: locs.filter((x) => x.type === 'province'),
    districtsOf: (id) => locs.filter((x) => x.type === 'district' && x.parent_id === id),
    citiesOf: (id) => locs.filter((x) => x.type === 'city' && x.parent_id === id),
    allDistricts: locs.filter((x) => x.type === 'district'),
    rootCat(catId) {
      const c1 = this.catById.get(catId);
      if (!c1) return null;
      return c1.parent_id ? this.catById.get(c1.parent_id) : c1;
    },
  };
}
export function resetRef() { _refP = undefined; }

export const optionList = (items, selected, placeholder) =>
  (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
  items.map((i) => `<option value="${esc(i.id)}"${String(i.id) === String(selected) ? ' selected' : ''}>${esc(i.name)}</option>`).join('');

/* ---------------- favourites ----------------
   Saved ads (data-fav buttons, table favorites) and saved Wanted requests (data-fav-want buttons, table wanted_favorites). */
const FAV_KINDS = {
  ad: { table: 'favorites', col: 'ad_id', attr: 'data-fav', list: 'saved ads', page: 'dashboard.html#/favorites' },
  want: { table: 'wanted_favorites', col: 'wanted_id', attr: 'data-fav-want', list: 'saved requests', page: 'dashboard.html#/favorites/requests' },
};
const _favsP = {};
function loadFavsOf(kind) {
  if (!_favsP[kind]) {
    const k = FAV_KINDS[kind];
    _favsP[kind] = (async () => {
      const s = await getSession();
      if (!s) return new Set();
      const { data } = await sb.from(k.table).select(k.col);
      return new Set((data || []).map((r) => r[k.col]));
    })();
  }
  return _favsP[kind];
}
export const loadFavs = () => loadFavsOf('ad');
export const favSet = loadFavs;
export const wantFavSet = () => loadFavsOf('want');

async function toggleFav(kind, id) {
  const s = await getSession();
  if (!s) { location.href = `login.html?next=${encodeURIComponent(hereForNext())}`; return; }
  const k = FAV_KINDS[kind];
  const favs = await loadFavsOf(kind);
  const on = favs.has(id);
  const { error } = on
    ? await sb.from(k.table).delete().eq(k.col, id).eq('user_id', s.user.id)
    : await sb.from(k.table).insert({ [k.col]: id, user_id: s.user.id });
  if (error) { errorToast(error, `update your ${k.list}`); return; }
  if (on) favs.delete(id); else favs.add(id);
  qsa(`[${k.attr}="${id}"]`).forEach((b) => {
    b.classList.toggle('on', !on);
    b.setAttribute('aria-pressed', String(!on));
    if (b.dataset.label) b.innerHTML = `${icon('heart', 'sm')} ${!on ? 'Saved' : 'Save'}`;
  });
  if (on) toast(`Removed from ${k.list}`);
  else toast(`Saved to your ${k.list}`, 'good', null, { ms: 4000, link: { href: k.page, label: `View ${k.list}` } });
}

/* ---------------- ad card ---------------- */
/* Only what a listing card shows (see adCard): lists stay small, about a quarter of the full ad.
   The ad page loads everything else when someone opens the ad. */
export const AD_SELECT = 'id, title, price, price_unit, category_id, city_id, district_id, is_demo, ad_images(path, sort_order)';

export function sortedImages(ad) {
  return [...(ad.ad_images || [])].sort((a, b) => a.sort_order - b.sort_order);
}

/* Ad photos: no right-click / long-press menu and no dragging a photo out. The CSS in app.css does the rest. */
const PHOTO_AREA = '.gallery-main, .thumbs, .listing-media, .thumb-sm';
const onPhoto = (e) => e.target instanceof Element && e.target.closest(PHOTO_AREA);
document.addEventListener('contextmenu', (e) => { if (onPhoto(e)) e.preventDefault(); });
document.addEventListener('dragstart', (e) => { if (onPhoto(e)) e.preventDefault(); });

export function placeholder(ad, ref) {
  const root = ref.rootCat(ad.category_id);
  return `<div class="ph">${catIcon(root?.slug)}<span>No photo yet</span></div>`;
}

export function adCard(ad, ref, favs = new Set(), opts = {}) {
  const imgs = sortedImages(ad);
  const media = imgs.length
    ? photoImg(imgs[0].path, ad.title, ' loading="lazy" decoding="async"')
    : placeholder(ad, ref);
  const city = ad.city_id ? ref.locById.get(ad.city_id)?.name : '';
  const dist = ad.district_id ? ref.locById.get(ad.district_id)?.name : '';
  const where = [city, dist && dist !== city ? dist : ''].filter(Boolean).join(', ');
  const featured = ad.is_demo ? demoBadge() : ''; // Promoted badge is off in the beta (no paid promotion yet); the Demo tag uses its spot
  // the Save heart lives on the ad page only; pass { fav: true } to show it on a card
  const heart = !opts.fav ? '' : `<button class="fav-btn${favs.has(ad.id) ? ' on' : ''}" data-fav="${esc(ad.id)}" aria-label="Save to saved ads" aria-pressed="${favs.has(ad.id)}">${icon('heart')}</button>`;
  return `<article class="listing-card">
    ${heart}
    <a href="${esc(adPath(ad))}">
      <div class="listing-media">${media}${featured}</div>
      <div class="listing-body">
        <div class="listing-title">${esc(ad.title)}</div>
        <div class="listing-meta">${icon('pin')}<span>${esc(where || 'Sri Lanka')}</span></div>
        ${priceTag(ad)}
      </div>
    </a>
  </article>`;
}

/* ---------------- lists remembered for the Back button ----------------
   Search, Wanted and the home feed keep what was on screen, and where, in this tab for 5 minutes. Coming back
   from an ad then shows the same list at the same spot at once, without asking the database again.
   Saving or deleting anything forgets them (they live in the short-term memory in supabase.js). */
const LIST_TTL = 5 * 60 * 1000;
export const saveList = (key, state) => remember(`list:${key}`, state);
export const readList = (key) => recall(`list:${key}`, LIST_TTL) || null;
/* true when this page was opened with the browser's Back or Forward button */
export const cameBack = () => (performance.getEntriesByType?.('navigation')?.[0]?.type || 'navigate') === 'back_forward';
/* js/restore.js held the old height of the list (and the page) so the Back spot was right from the first frame.
   Call this once the real list is on screen. */
export function releaseHeld() {
  qsa('[data-held]').forEach((el) => { el.style.minHeight = ''; el.removeAttribute('data-held'); });
}

/* Filters: the Show results button sits at the bottom of a long form. Once a filter changes and that
   button is out of view, a copy of it floats at the bottom of the screen. Returns a function to call
   after the page refills the form. */
export function floatingApply(form, formToParams) {
  const main = form.querySelector('[type="submit"]');
  const float = main.cloneNode(true);
  float.classList.add('filters-float', 'hidden');
  form.append(float);
  const norm = (p) => [...p].map(([k, v]) => [k, v.trim()]).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).sort().join('&');
  const check = () => {
    const changed = norm(formToParams()) !== norm(new URLSearchParams(location.search));
    const r = main.getBoundingClientRect();
    const inView = r.bottom > 0 && r.top < window.innerHeight;
    float.classList.toggle('hidden', !changed || inView);
  };
  // scrolling the page (computer) or the filters panel (phone) can bring the real button into view
  if ('IntersectionObserver' in window) new IntersectionObserver(check).observe(main);
  form.addEventListener('input', check);
  form.addEventListener('change', check);
  return check;
}

/* Cards fade in a little before they scroll into view, so there is no dead space followed by a pop. */
let _io;
export function observeCards(root = document) {
  const cards = qsa('.listing-card:not(.in)', root);
  if (!('IntersectionObserver' in window)) { cards.forEach((c) => c.classList.add('in')); return; }
  _io = _io || new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); _io.unobserve(e.target); } });
  }, { threshold: 0.01, rootMargin: '600px' });
  cards.forEach((c) => _io.observe(c));
}

/* ---------------- Loading skeletons ----------------
   Every page loads with grey blocks in the same places as the real content, never a spinner,
   so the page has its shape straight away and nothing jumps when the data arrives. */

/* Loading placeholders shaped like a real ad card (photo, title, place, price). */
export function adSkeletons(n = 8) {
  const one = '<div class="sk-card" aria-hidden="true"><div class="sk sk-media"></div><div class="sk-body"><div class="sk sk-title"></div><div class="sk sk-meta"></div><div class="sk sk-price"></div></div></div>';
  return one.repeat(n);
}

/* Shaped like a Wanted card (tag, title, description, budget, place, footer). */
export function wantSkeletons(n = 6) {
  const one = `<div class="sk-want" aria-hidden="true">
    <div class="row spread"><div class="sk" style="width:84px;height:24px"></div><div class="sk sk-t" style="width:30%;height:11px"></div></div>
    <div class="sk sk-t" style="height:18px;width:88%;margin-top:2px"></div><div class="sk sk-t" style="height:18px;width:52%"></div>
    <div class="sk sk-t" style="height:11px;width:96%;margin-top:4px"></div><div class="sk sk-t" style="height:11px;width:80%"></div>
    <div class="sk sk-t" style="width:46%;height:15px;margin-top:6px"></div><div class="sk sk-t" style="width:38%;height:11px"></div><div class="sk sk-t" style="width:42%;height:11px"></div>
    <div class="row spread" style="margin-top:8px;padding-top:12px;border-top:1px dashed var(--brd2)"><div class="sk sk-t" style="width:40%;height:11px"></div><div class="sk sk-t" style="width:80px;height:14px"></div></div>
  </div>`;
  return one.repeat(n);
}

export function skHeading(width = '38%') {
  return `<div class="sk sk-h" aria-hidden="true" style="width:${width};max-width:320px;margin-bottom:16px"></div>`;
}

/* Number tiles (dashboard, admin, profile). */
export function skStats(n = 4) {
  const one = '<div class="card stat"><div class="sk" style="height:30px;width:42%"></div><div class="sk sk-t" style="width:72%;margin-top:9px"></div></div>';
  return `<div class="stat-grid" aria-hidden="true">${one.repeat(n)}</div>`;
}

/* List rows like "My ads" and the admin lists: optional small photo, badge, title, details, buttons. */
export function skRows(n = 3, thumb = true) {
  const btn = '<div class="sk" style="width:64px;height:32px;border-radius:var(--rlg)"></div>';
  const one = `<div class="card pad" style="margin-bottom:12px"><div class="row" style="align-items:flex-start;flex-wrap:nowrap">
    ${thumb ? '<div class="sk" style="width:84px;height:64px;flex:none"></div>' : ''}
    <div class="grow sk-stack" style="gap:8px"><div class="sk" style="width:66px;height:20px"></div><div class="sk sk-t" style="height:16px;width:62%"></div><div class="sk sk-t" style="width:40%"></div></div></div>
    <div class="row" style="margin-top:14px">${btn.repeat(3)}</div></div>`;
  return `<div aria-hidden="true">${one.repeat(n)}</div>`;
}

/* Admin tables: photo, title, then status and buttons on wider screens. */
export function skTable(n = 6, thumb = true) {
  const row = `<div class="row" style="flex-wrap:nowrap;gap:12px;padding:12px;border-bottom:1px solid var(--brd)">
    ${thumb ? '<div class="sk" style="width:62px;height:46px;flex:none"></div>' : ''}
    <div class="grow sk-stack" style="gap:7px"><div class="sk sk-t" style="width:55%"></div><div class="sk sk-t" style="width:30%;height:11px"></div></div>
    <div class="sk hide-m" style="width:80px;height:22px"></div><div class="sk hide-m" style="width:150px;height:32px;border-radius:var(--rlg)"></div></div>`;
  return `<div class="card" aria-hidden="true">${row.repeat(n)}</div>`;
}

/* A form card: section title, labelled fields, save button. */
export function skForm(fields = 6) {
  const field = '<div class="field"><div class="sk sk-t" style="width:96px;height:12px;margin-bottom:9px"></div><div class="sk sk-b"></div></div>';
  return `<div class="card pad" aria-hidden="true"><div class="sk sk-t" style="width:46%;height:18px;margin-bottom:18px"></div>${field.repeat(fields)}<div class="sk sk-b" style="width:150px;margin-top:6px"></div></div>`;
}

/* ---------------- Wanted requests: renters post what they cannot find, vendors reply ---------------- */
export const WANT_SELECT = '*, profiles!wanted_requests_user_id_fkey(id, business_name, full_name, avatar_path, created_at)';
/* Only what a Wanted card shows (see wantedCard), for lists. */
export const WANT_CARD_SELECT = 'id, title, description, category_id, budget_max, budget_unit, needed_from, needed_until, city_id, district_id, '
  + 'approved_at, created_at, expires_at, is_demo, profiles!wanted_requests_user_id_fkey(business_name, full_name)';
export const WANT_UNITS = { hour: 'per hour', day: 'per day', week: 'per week', month: 'per month', event: 'per event' };
export const WANT_UNIT_OPTIONS = [
  ['day', 'per day'], ['hour', 'per hour'], ['week', 'per week'],
  ['month', 'per month'], ['event', 'per event'], ['flexible', 'Flexible, no budget set'],
];

/* A request is live when it is approved and its 30 days are not over. */
export const wantLive = (r) => r.status === 'approved' && new Date(r.expires_at) > new Date();
export const wantDaysLeft = (r) => Math.max(0, Math.ceil((new Date(r.expires_at) - Date.now()) / 864e5));

export function wantBadge(r) {
  if (r.status === 'approved' && !wantLive(r)) return '<span class="badge">Expired</span>';
  return statusBadge(r.status);
}

export function budgetTag(r, big = false) {
  const cls = big ? ' big' : '';
  if (r.budget_unit === 'flexible' || r.budget_max === null || r.budget_max === undefined || r.budget_max === '') {
    return `<span class="price contact${cls}">Budget is flexible</span>`;
  }
  const n = Number(r.budget_max).toLocaleString('en-LK', { maximumFractionDigits: 0 });
  return `<span class="price${cls}"><small>Up to</small> Rs ${esc(n)} <small>${esc(WANT_UNITS[r.budget_unit] || '')}</small></span>`;
}

/* Dates come from a date column as 2026-11-12, so read them at midday to stay on the same day everywhere. */
const dayText = (d) => fmtDate(`${d}T12:00:00`);
export function neededText(r) {
  if (r.needed_from && r.needed_until) return `${dayText(r.needed_from)} to ${dayText(r.needed_until)}`;
  if (r.needed_from) return `From ${dayText(r.needed_from)}`;
  if (r.needed_until) return `Until ${dayText(r.needed_until)}`;
  return 'Dates are flexible';
}

export function wantPlace(r, ref) {
  const city = r.city_id ? ref.locById.get(r.city_id)?.name : '';
  const dist = r.district_id ? ref.locById.get(r.district_id)?.name : '';
  return [city, dist && dist !== city ? dist : ''].filter(Boolean).join(', ');
}

/* The Wanted card looks different from an ad card on purpose: no photo, a dashed blue frame and a Wanted tag. */
export function wantedCard(r, ref) {
  const cat = ref.catById.get(r.category_id);
  const who = r.profiles?.business_name || r.profiles?.full_name || '';
  const desc = r.description.length > 130 ? `${r.description.slice(0, 127).trimEnd()}...` : r.description;
  const left = r.is_demo ? 0 : wantDaysLeft(r); // sample requests do not count down
  return `<article class="listing-card want-card">
    <a href="${esc(wantPath(r))}">
      <div class="want-top"><span class="row" style="gap:6px;flex-wrap:nowrap"><span class="want-tag">${icon('search', 'sm')} Wanted</span>${r.is_demo ? demoBadge() : ''}</span><span class="want-cat">${esc(cat?.name || '')}</span></div>
      <h3 class="want-title">${esc(r.title)}</h3>
      <p class="want-desc">${esc(desc)}</p>
      <div class="want-facts">
        ${budgetTag(r)}
        <div class="listing-meta">${icon('pin')}<span>${esc(wantPlace(r, ref) || 'Sri Lanka')}</span></div>
        <div class="listing-meta">${icon('calendar')}<span>${esc(neededText(r))}</span></div>
      </div>
      <div class="want-foot"><span>${who ? `${esc(who)}, ` : ''}${esc(timeAgo(r.approved_at || r.created_at))}${left ? `, ${left} day${left > 1 ? 's' : ''} left` : ''}</span><span class="want-cta">I can help ${icon('next', 'sm')}</span></div>
    </a>
  </article>`;
}

/* ---------------- header, footer and global behaviour ---------------- */
let _globals = false;
function installGlobals() {
  if (_globals) return;
  _globals = true;

  // broken images become a branded tile, never an empty grey box.
  // A missing small copy (see photoImg) first gets one more try with the full photo.
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.dataset.full) {
      const full = t.dataset.full;
      delete t.dataset.full;
      t.src = full;
      return;
    }
    if (t && t.tagName === 'IMG' && !t.dataset.failed) {
      t.dataset.failed = '1';
      const d = document.createElement('div');
      d.className = 'fb';
      d.innerHTML = '<b>RentAds</b><span>Photo unavailable</span>';
      t.replaceWith(d);
    }
  }, true);

  // phones: no pinch zoom and no double-tap zoom (the viewport tag covers Android, these cover iOS Safari)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  // every action button works on a single click
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button.btn');
    if (!b || b.hasAttribute('data-multi')) return;
    if (b.dataset.busy) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    b.dataset.busy = '1'; b.classList.add('dim');
    setTimeout(() => { delete b.dataset.busy; b.classList.remove('dim'); }, 1400);
  }, true);

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fav], [data-fav-want]');
    if (b) { e.preventDefault(); e.stopPropagation(); toggleFav(b.dataset.fav ? 'ad' : 'want', b.dataset.fav || b.dataset.favWant); }
  });

  // "Refresh page" buttons (no inline code, so the strict content security policy can stay on)
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-reload]')) location.reload();
  });

  // Safety net: if a page script fails before the page is drawn, show a clear error card
  // instead of leaving the grey loading placeholders on screen forever.
  let leaving = false;
  window.addEventListener('pagehide', () => { leaving = true; });
  window.addEventListener('beforeunload', () => { leaving = true; });
  const stuck = (err) => setTimeout(() => {
    if (leaving) return;
    qsa('#site-header .sk, #site-header .sk-links').forEach((el) => el.remove());
    const sk = qs('main .sk');
    if (!sk) return; // the page already shows its content or its own message
    const host = (sk.closest('[aria-hidden="true"]') || sk).parentElement;
    host.innerHTML = errorBox(err, 'load this page', { title: 'This page could not load', track: false });
  }, 1200);
  // every script error is also logged to Better Stack, even when the page itself keeps working
  window.addEventListener('error', (e) => {
    if (e.filename && !e.filename.startsWith(location.origin)) return; // other sites' scripts (Google sign-in, browser add-ons)
    trackError(e.error || e.message, 'page script');
    stuck(e.error || e.message);
  });
  window.addEventListener('unhandledrejection', (e) => { trackError(e.reason, 'page script'); stuck(e.reason); });

  // friendly offline screen
  const off = document.createElement('div');
  off.className = 'offline'; off.setAttribute('role', 'alert');
  off.innerHTML = `<div class="logo">RentAds.lk</div>${icon('wifi', 'lg')}<h3>You are offline</h3>
    <p>Check your wifi or mobile data. RentAds will come back as soon as your connection does.</p>
    <button class="btn" data-multi id="offline-retry">Try again</button>`;
  document.body.appendChild(off);
  const sync = () => off.classList.toggle('show', !navigator.onLine);
  window.addEventListener('offline', sync);
  window.addEventListener('online', () => { sync(); toast('You are back online', 'good'); });
  qs('#offline-retry', off).onclick = () => { if (navigator.onLine) location.reload(); else ruleToast('Still no connection. Check your wifi or mobile data.'); };
  sync();
}

export async function initPage(active = '') {
  installGlobals();
  const [session, profile] = await Promise.all([getSession(), getProfile()]);
  const header = qs('#site-header');
  if (header) {
    const loggedIn = !!session;
    const isAdmin = profile?.role === 'admin';
    const displayName = profile?.business_name || profile?.full_name || session?.user?.email?.split('@')[0] || 'Account';
    header.className = 'site-header';
    const links = [
      ['search.html', 'Browse Rentals', active === 'browse'],
      ['wanted.html', 'Wanted', active === 'wanted'],
      ...(loggedIn ? [['dashboard.html', 'Dashboard', active === 'dashboard'], ['profile.html', 'My Profile', active === 'profile']] : []),
      ...(isAdmin ? [['admin.html', 'Admin', active === 'admin']] : []),
    ];
    header.innerHTML = `<div class="wrap">
      <button class="nav-toggle" aria-label="Open menu" aria-expanded="false">${icon('menu')}</button>
      <span class="brand"><a class="logo" href="index.html" aria-label="RentAds.lk home">RentAds.lk</a><button type="button" class="beta-badge" data-beta aria-label="What is beta?" title="What is beta?">Beta</button></span>
      <nav class="nav-links" aria-label="Main">${links.map(([h, t, on]) => `<a href="${h}" class="${on ? 'active' : ''}">${t}</a>`).join('')}<button type="button" data-beta>What is beta?</button></nav>
      <div class="nav-right">
        ${loggedIn
    ? `<a class="btn btn-pill btn-sm" href="dashboard.html#/new">Post an Ad</a>
        <div class="user-wrap">
          <button type="button" class="user-btn" id="user-btn" aria-haspopup="true" aria-expanded="false" aria-label="Your account">
            ${avatarHtml({ ...profile, business_name: displayName, full_name: '' }, 'nav-avatar')}<span class="user-name hide-m">${esc(displayName)}</span>${icon('chevron', 'sm')}
          </button>
          <div class="user-menu" id="user-menu">
            <div class="user-menu-head"><strong>${esc(displayName)}</strong><span>${esc(session.user.email || '')}</span></div>
            <a href="dashboard.html#/ads">My ads</a>
            <a href="dashboard.html#/requests">My requests</a>
            <a href="dashboard.html#/favorites">Saved</a>
            <a href="profile.html">My profile</a>
            <a href="dashboard.html#/profile">Edit profile</a>
            ${isAdmin ? '<a href="admin.html">Admin</a>' : ''}
            <button type="button" id="logout-btn">Log Out</button>
          </div>
        </div>`
    : `<a class="login-link" href="login.html">Sign up</a><a class="btn btn-pill btn-sm" href="login.html?next=dashboard.html%23%2Fnew">Post an Ad</a>`}
      </div>
      <div class="nav-panel" id="nav-panel">
        ${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}
        <button type="button" data-beta>What is beta?</button>
      </div></div>`;
    const toggle = qs('.nav-toggle', header), panel = qs('#nav-panel', header);
    toggle.onclick = () => {
      const o = panel.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(o));
      toggle.innerHTML = icon(o ? 'x' : 'menu');
    };
    panel.querySelectorAll('a, button').forEach((a) => a.addEventListener('click', () => { panel.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); toggle.innerHTML = icon('menu'); }));
    header.querySelectorAll('[data-beta]').forEach((b) => b.addEventListener('click', () => showBetaNotice()));
    const ub = qs('#user-btn', header), um = qs('#user-menu', header);
    if (ub && um) {
      const setOpen = (o) => { um.classList.toggle('open', o); ub.setAttribute('aria-expanded', String(o)); };
      ub.onclick = (e) => { e.stopPropagation(); setOpen(!um.classList.contains('open')); };
      document.addEventListener('click', (e) => { if (!um.contains(e.target)) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setOpen(false); });
      qs('#logout-btn', header).onclick = logout;
    }
    if (isAdmin) adminQueue(header, active); // not awaited: the page does not wait for it
  }
  const footer = qs('#site-footer');
  if (footer) {
    footer.className = 'site-footer';
    footer.innerHTML = `<div class="wrap">
      <div class="footer-grid">
        <div><a class="logo" href="index.html">RentAds.lk</a>
          <p style="margin-top:10px;max-width:38ch">Sri Lanka's rental directory. Find vehicles, homes, equipment and event gear, then contact the vendor directly.</p>
          <div class="social">${SOCIAL_LINKS.map((s) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="RentAds.lk on ${s.name}" title="${s.name}">${icon(s.icon)}</a>`).join('')}</div></div>
        <div><h4>Renting</h4><ul><li><a href="search.html">Browse all rentals</a></li><li><a href="search.html?cat=vehicles">Vehicles</a></li><li><a href="search.html?cat=properties">Properties</a></li><li><a href="search.html?cat=event-gear">Event gear</a></li><li><a href="wanted-new.html">Cannot find it? Post a request</a></li></ul></div>
        <div><h4>Vendors</h4><ul><li><a href="login.html">Sign up as a vendor</a></li><li><a href="dashboard.html#/new">Post an ad</a></li><li><a href="wanted.html">Browse wanted requests</a></li></ul></div>
        <div><h4>Help</h4><ul><li><a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></li><li><a href="terms.html">Terms and Conditions</a></li><li><a href="privacy.html">Privacy Policy</a></li></ul></div>
      </div>
      <p class="disclaimer">RentAds.lk is an advertising directory. We do not take part in, guarantee or process rental agreements or payments, and we never hold deposits. Always check the item, the vendor and the terms before you pay.</p>
    </div>`;
  }
  if (session) loadFavs();
  betaNotice();
  return { session, profile };
}

/* Admins only: how many ads and Wanted requests wait for approval. A number next to every "Admin" link in the
   header, and a bar under the header with a link to the queue. Not on the admin panel itself (its side menu has
   its own numbers). Two small count requests, never made for other users; if they fail nothing is shown. */
async function adminQueue(header, active) {
  if (active === 'admin') return;
  try {
    const [a, w] = await Promise.all([
      sb.from('ads').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      sb.from('wanted_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);
    const ads = a.count || 0, reqs = w.count || 0;
    if (!ads && !reqs) return;
    header.querySelectorAll('a[href="admin.html"]').forEach((l) => l.insertAdjacentHTML('beforeend', ` <span class="admin-count" aria-label="${ads + reqs} waiting">${ads + reqs}</span>`));
    const what = [ads && `${ads} ad${ads > 1 ? 's' : ''}`, reqs && `${reqs} request${reqs > 1 ? 's' : ''}`].filter(Boolean).join(' and ');
    const bar = document.createElement('div');
    bar.className = 'admin-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = `<div class="wrap"><span>You have <strong>${what}</strong> to approve.</span>
      <a href="admin.html#/${ads ? 'moderation' : 'wanted'}">Review now ${icon('next', 'sm')}</a></div>`;
    header.insertAdjacentElement('afterend', bar);
  } catch { /* a missing reminder is not worth an error message */ }
}

/* Welcome note for the beta. Opens by itself once per browser (remembered in localStorage), and any time
   from the BETA badge next to the logo or "What is beta?" in the menu. Remove all three at the official launch. */
const BETA_KEY = 'rentads_beta_seen';
function betaNotice() {
  try {
    if (localStorage.getItem(BETA_KEY)) return;
    localStorage.setItem(BETA_KEY, '1');
  } catch { return; } // storage blocked: skip the note rather than show it on every page
  showBetaNotice();
}
export function showBetaNotice() {
  const m = openModal(`<span class="beta-tag">Beta version</span>
    <h3>Welcome to the RentAds.lk beta version</h3>
    <p>This is an early version of RentAds.lk, open before the official launch. We are still testing and improving it, so some things may change.</p>
    <p>Everything on RentAds.lk is completely free right now.</p>
    <p>Have a suggestion or found a problem? Email us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
    <button type="button" class="btn" data-try>Try the beta version</button>`);
  m.back.classList.add('beta-back');
  m.el.querySelector('[data-try]').onclick = m.close;
}
