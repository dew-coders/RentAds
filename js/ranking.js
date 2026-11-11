// Ranked results: asks the database (rank_ads / rank_wanted) for the best order, then loads the cards in that order.
import { sb } from './supabase.js';
import { AD_SELECT, WANT_CARD_SELECT, cleanSearch } from './common.js';

/* A fresh random seed gives a fresh order: every visitor and every refresh sees a different feed.
   The same seed keeps the order steady while the visitor presses Load more. */
export const newSeed = () => Math.random().toString(36).slice(2, 10);

/* What the visitor looks at is remembered in this browser only (nothing is sent anywhere):
   the last categories of ads they opened, and the last district they searched in. */
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
export function noteInterest(rootCategoryId) {
  if (!rootCategoryId) return;
  const list = (store.get('rs:interest') || []).filter((x) => x !== rootCategoryId);
  store.set('rs:interest', [rootCategoryId, ...list].slice(0, 5));
}
export const interests = () => { const l = store.get('rs:interest'); return Array.isArray(l) && l.length ? l : null; };
export const noteDistrict = (id) => { if (id) store.set('rs:district', +id); };
export const lastDistrict = () => store.get('rs:district') || null;

const num = (v) => (v !== null && v !== undefined && v !== '' && !isNaN(+v) ? +v : null);

// loads the rows for these ids and puts them back in the ranked order
async function byIds(table, select, ids) {
  if (!ids.length) return [];
  const { data, error } = await sb.from(table).select(select).in('id', ids);
  if (error) throw error;
  const m = new Map(data.map((r) => [r.id, r]));
  return ids.map((id) => m.get(id)).filter(Boolean);
}

/* Ads, best first. from = how many to skip, n = how many to return (the database allows up to 100).
   districtId gives that district an advantage (it does not hide the others), strictDistrict makes it a filter.
   cityId is always a filter. sort 'price_asc' / 'price_desc' keeps the same matches in price order. */
export async function rankedAds({ q, categoryId, districtId, provinceId, cityId, min, max, sort, strictDistrict = false, seed = null, interest } = {}, from = 0, n = 16) {
  const args = {
    p_q: cleanSearch(q) || null,
    p_category: categoryId || null,
    p_district: districtId || null,
    p_province: provinceId || null,
    p_min: num(min),
    p_max: num(max),
    p_strict_district: !!strictDistrict,
    p_limit: n,
    p_offset: from,
    p_seed: seed || null,
    p_interest: interest === undefined ? interests() : interest,
  };
  // only sent when used, so the plain feed keeps working with an older database function
  if (cityId) args.p_city = cityId;
  if (sort) args.p_sort = sort;
  const { data: rows, error } = await sb.rpc('rank_ads', args);
  if (error) throw error;
  // fetched: how far the next page starts (rows the database ranked, even if one was removed a moment ago)
  return { data: await byIds('ads', AD_SELECT, rows.map((r) => r.id)), count: rows.length ? Number(rows[0].total) : 0, fetched: rows.length, rows };
}

/* Wanted requests, best first. Same idea as rankedAds. sort 'ending' / 'budget' keeps the same matches in that order. */
export async function rankedWanted({ q, categoryId, districtId, provinceId, sort, strictDistrict = false, seed = null } = {}, from = 0, n = 16) {
  const args = {
    p_q: cleanSearch(q) || null,
    p_category: categoryId || null,
    p_district: districtId || null,
    p_province: provinceId || null,
    p_strict_district: !!strictDistrict,
    p_limit: n,
    p_offset: from,
    p_seed: seed || null,
  };
  if (sort) args.p_sort = sort;
  const { data: rows, error } = await sb.rpc('rank_wanted', args);
  if (error) throw error;
  return { data: await byIds('wanted_requests', WANT_CARD_SELECT, rows.map((r) => r.id)), count: rows.length ? Number(rows[0].total) : 0, fetched: rows.length, rows };
}