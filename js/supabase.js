import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

/* ---------------- short-term memory for pages (this browser tab only) ----------------
   Ad pages, profiles and the category and place lists are kept for a short time so going back and forth
   is instant. Anything saved, edited or deleted from this tab, and signing in or out, forgets them all
   at once (see patientFetch below and onAuthStateChange in common.js), so owners always see their changes. */
const MEMO = 'rs:memo:';
export function forgetCached() {
  try { Object.keys(sessionStorage).filter((k) => k.startsWith(MEMO)).forEach((k) => sessionStorage.removeItem(k)); } catch { /* storage unavailable */ }
}
export function remember(key, v) {
  try { sessionStorage.setItem(MEMO + key, JSON.stringify({ t: Date.now(), v })); } catch { /* full or blocked: fine */ }
}
/* What was kept under this key, if it is younger than ttlMs; otherwise undefined. */
export function recall(key, ttlMs) {
  try {
    const hit = JSON.parse(sessionStorage.getItem(MEMO + key) || 'null');
    if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  } catch { /* storage unavailable or damaged */ }
  return undefined;
}
/* load() runs only when there is nothing fresh; failures are never kept. */
export async function cached(key, ttlMs, load) {
  const hit = recall(key, ttlMs);
  if (hit !== undefined) return hit;
  const v = await load();
  remember(key, v);
  return v;
}

/* ---------------- slow internet ----------------
   Reads get a time limit and one patient second try, so a slow mobile connection is waited for, not shown as
   broken (the grey placeholders stay on screen meanwhile). Saves, uploads and sign-in are never repeated
   automatically, so nothing can be posted twice. The time limit covers the wait for the answer to start;
   a big answer that is already arriving is never cut off. */
const WAITS = [12000, 25000]; // first try, second try (milliseconds)
// database functions that only read, so repeating them is harmless
const READ_RPCS = new Set(['rank_ads', 'rank_wanted', 'my_profile', 'admin_stats', 'admin_wanted_stats', 'admin_vendors', 'category_counts']);
// view counters and the Wanted contact lookup change no page, so they do not clear the short-term memory
// (they are counted by the database, so they are never repeated either)
const COUNTER_RPCS = new Set(['increment_ad_views', 'increment_wanted_views', 'wanted_contact']);

function kindOf(url, method) {
  const rpc = (url.match(/\/rest\/v1\/rpc\/([a-z_]+)/) || [])[1];
  if (rpc) return READ_RPCS.has(rpc) ? 'read' : COUNTER_RPCS.has(rpc) ? 'other' : 'write';
  if (/\/auth\/v1\//.test(url) || /\/functions\/v1\//.test(url)) return 'other'; // sign-in, SMS codes: never repeated
  if (/\/storage\/v1\/object\/list\//.test(url)) return 'other'; // listing files
  if (method === 'GET' || method === 'HEAD') return /\/(rest|storage)\/v1\//.test(url) ? 'read' : 'other';
  return 'write'; // saving, editing, deleting, uploading
}

const slowError = () => Object.assign(new Error('The connection is too slow (timed out)'), { name: 'SlowConnection' });

export async function patientFetch(input, init = {}, waits = WAITS) {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || input.method || 'GET').toUpperCase();
  const kind = kindOf(url, method);
  if (kind === 'write') forgetCached();
  if (kind !== 'read') return fetch(input, init);

  for (let i = 0; i < waits.length; i++) {
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, waits[i]);
    const outer = init.signal;
    const passOn = () => ctl.abort();
    if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener('abort', passOn, { once: true }); }
    try {
      return await fetch(input, { ...init, signal: ctl.signal });
    } catch (e) {
      if (outer?.aborted) throw e; // the page itself cancelled it
      const last = i === waits.length - 1;
      if (last) throw timedOut ? slowError() : e;
      if (!timedOut) await new Promise((r) => setTimeout(r, 1500)); // the line dropped: a short pause, then the second try
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', passOn);
    }
  }
  throw slowError(); // not reached
}

// pkce: after the Google redirect the address holds a one-time code instead of the sign-in tokens themselves
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { flowType: 'pkce' }, global: { fetch: patientFetch } });
