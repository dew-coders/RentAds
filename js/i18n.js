// English / Sinhala switch for RentAds.
// How it works: pages are written in English. When the visitor picks Sinhala, this file swaps
// known English text for Sinhala (text, placeholders, tooltips, page title) and keeps doing it for
// anything the page draws later. Switching back restores the English. The choice is remembered.
// Ad titles, descriptions, names and other things vendors type are never touched.
const KEY = 'rentads_lang';
const OFF = /(^|\/)admin(\.html)?$/.test(location.pathname); // admin panel stays English

let lang = 'en';
try {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'si' || q === 'en') localStorage.setItem(KEY, q);
  lang = localStorage.getItem(KEY) === 'si' ? 'si' : 'en';
} catch { /* private mode: English, switch still works for this visit */ }
if (OFF) lang = 'en';

let si = null; // the Sinhala dictionary, loaded only when needed
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'NOSCRIPT', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

function tr(text) {
  const key = collapse(text);
  if (!key) return null;
  if (has(si.DICT, key)) return si.DICT[key];
  for (const [re, fn] of si.PATTERNS) {
    const m = key.match(re);
    if (m) return fn(m, (s) => tr(s) ?? s);
  }
  return null;
}

const skipped = (node) => {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !el || SKIP.has(el.tagName) || !!el.closest('[data-no-i18n]');
};

function doText(node) {
  if (skipped(node)) return;
  if (lang === 'si' && si) {
    if (node.__en !== undefined && node.data === node.__si) return; // already done
    const orig = node.data;
    const out = tr(orig);
    if (out === null) { delete node.__en; delete node.__si; return; }
    node.__en = orig;
    node.__si = (orig.match(/^\s*/)[0]) + out + (orig.match(/\s*$/)[0]);
    node.data = node.__si;
  } else if (node.__en !== undefined) {
    if (node.data === node.__si) node.data = node.__en;
    delete node.__en; delete node.__si;
  }
}

function doAttr(el, name) {
  if (skipped(el) || !el.hasAttribute(name)) return;
  const store = el.__a || (el.__a = {});
  const cur = el.getAttribute(name);
  if (lang === 'si' && si) {
    if (store[name] && cur === store[name][1]) return;
    const out = tr(cur);
    if (out === null) { delete store[name]; return; }
    store[name] = [cur, out];
    el.setAttribute(name, out);
  } else if (store[name]) {
    if (cur === store[name][1]) el.setAttribute(name, store[name][0]);
    delete store[name];
  }
}

function walk(root) {
  if (root.nodeType === 3) { doText(root); return; }
  if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
  const w = document.createTreeWalker(root, 1 | 4);
  let n = root.nodeType === 1 ? root : w.nextNode();
  while (n) {
    if (n.nodeType === 3) doText(n);
    else for (const a of ATTRS) doAttr(n, a);
    n = w.nextNode();
  }
}

/* ---- the switch button ---- */
// site colours (css/app.css) so the button matches the warm greys around it
const BTN_STYLE = 'border:1px solid var(--brd3);background:var(--bg);color:var(--t1);border-radius:999px;padding:5px 11px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;line-height:1.2;margin-right:8px;font-family:inherit';
const HDR_STYLE = 'background:var(--bg);color:var(--t1);border:1px solid var(--brd3);margin-right:8px;white-space:nowrap;font-family:inherit;cursor:pointer';
function makeBtn(floating) {
  const b = document.createElement('button');
  b.type = 'button'; b.setAttribute('data-no-i18n', '');
  b.className = floating ? 'lang-toggle' : 'lang-toggle btn btn-pill btn-sm'; // same look and size as Post an Ad
  b.style.cssText = floating ? BTN_STYLE + ';position:fixed;right:12px;bottom:12px;z-index:60;margin:0;box-shadow:0 2px 10px rgba(0,0,0,.18)' : HDR_STYLE;
  b.onclick = () => setLang(lang === 'si' ? 'en' : 'si');
  return b;
}
function paintBtns() {
  document.querySelectorAll('.lang-toggle').forEach((b) => {
    // short label on phones (CSS in ensureHeaderFit) so the header fits next to the BETA badge
    b.innerHTML = lang === 'si' ? '<span class="lt-full">English</span><span class="lt-short">EN</span>' : '<span class="lt-full">සිංහල</span><span class="lt-short">සිං</span>';
    b.setAttribute('aria-label', lang === 'si' ? 'Switch to English' : 'සිංහලට මාරු වන්න');
  });
}
function ensureBtn() {
  if (OFF || !document.body) return;
  const right = document.querySelector('#site-header .nav-right');
  if (right) {
    if (!right.querySelector('.lang-toggle')) { right.insertBefore(makeBtn(false), right.firstChild); paintBtns(); }
    document.querySelectorAll('.lang-toggle[data-float]').forEach((b) => b.remove());
  } else if (!document.getElementById('site-header') && !document.querySelector('.lang-toggle')) {
    // pages without the normal header (for example sign-in): a small floating button
    const b = makeBtn(true); b.setAttribute('data-float', ''); document.body.appendChild(b); paintBtns();
  }
}

/* ---- phone header: keep logo, language switch and Post an Ad on one line ---- */
// Sign up is hidden on phones because Post an Ad leads to the same sign-in page.
function ensureHeaderFit() {
  if (document.getElementById('hdr-fit')) return;
  const s = document.createElement('style');
  s.id = 'hdr-fit';
  s.textContent =
    '#site-header .nav-right .login-link,#site-header .nav-right .btn{white-space:nowrap}' +
    '.lang-toggle .lt-short{display:none}' +
    '@media (max-width:640px){' +
    '#site-header .lang-toggle .lt-full{display:none}#site-header .lang-toggle .lt-short{display:inline}' +
    '#site-header .nav-right .lang-toggle{padding-left:10px!important;padding-right:10px!important;flex:none}' +
    '#site-header .nav-right{gap:6px;flex-wrap:nowrap;min-width:0}' +
    '#site-header .nav-right .login-link{display:none}' +
    '#site-header .nav-right .btn{padding-left:12px;padding-right:12px;font-size:13px}' +
    '#site-header .nav-right .lang-toggle{min-width:0!important;margin-right:0!important}' +
    '#site-header .logo{font-size:1.2rem}' +
    '}';
  document.head.appendChild(s);
}

/* ---- font for Sinhala letters ---- */
function ensureFont() {
  if (document.getElementById('si-font')) return;
  const l = document.createElement('link');
  l.id = 'si-font'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;500;600&display=swap';
  document.head.appendChild(l);
  const s = document.createElement('style');
  s.id = 'si-style';
  // Sinhala letters are drawn taller than English ones, so the device's own Sinhala font is shrunk
  // to match (size-adjust). The web font is only the fallback for devices that have none.
  s.textContent =
    "@font-face{font-family:'SiScaled';font-weight:100 500;size-adjust:84%;unicode-range:U+0D80-0DFF,U+200C-200D;src:local('Nirmala UI'),local('NirmalaUI'),local('Noto Sans Sinhala'),local('NotoSansSinhala-Regular'),local('Sinhala Sangam MN'),local('Iskoola Pota')}" +
    "@font-face{font-family:'SiScaled';font-weight:600 900;size-adjust:84%;unicode-range:U+0D80-0DFF,U+200C-200D;src:local('Nirmala UI Bold'),local('NirmalaUI-Bold'),local('Noto Sans Sinhala Bold'),local('NotoSansSinhala-Bold'),local('Sinhala Sangam MN Bold'),local('Iskoola Pota Bold')}" +
    "html[lang='si'] body, html[lang='si'] body *{font-family:'Outfit','SiScaled','Noto Sans Sinhala',system-ui,sans-serif}html[lang='si'] body{line-height:1.6}";
  document.head.appendChild(s);
}

/* ---- keep up with what the page draws ---- */
const obs = new MutationObserver((records) => {
  obs.disconnect();
  try {
    ensureBtn();
    if (lang === 'si' && si) {
      for (const r of records) {
        if (r.type === 'childList') r.addedNodes.forEach((n) => walk(n));
        else if (r.type === 'characterData') doText(r.target);
        else if (r.type === 'attributes') doAttr(r.target, r.attributeName);
      }
    }
  } finally { watch(); }
});
function watch() {
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

async function setLang(next) {
  if (OFF) return;
  lang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  document.documentElement.lang = next === 'si' ? 'si' : 'en';
  if (next === 'si') {
    ensureFont();
    if (!si) { try { si = await import('./i18n-si.js'); } catch (e) { console.error('Sinhala text failed to load', e); lang = 'en'; paintBtns(); return; } }
  }
  obs.disconnect();
  try { walk(document.documentElement); paintBtns(); } finally { watch(); }
}

async function start() {
  if (OFF) return;
  document.documentElement.lang = lang === 'si' ? 'si' : 'en';
  if (lang === 'si') {
    ensureFont();
    try { si = await import('./i18n-si.js'); } catch (e) { console.error('Sinhala text failed to load', e); lang = 'en'; }
  }
  ensureHeaderFit(); ensureBtn(); paintBtns();
  if (lang === 'si' && si) { obs.disconnect(); walk(document.documentElement); }
  watch();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
