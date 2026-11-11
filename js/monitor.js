// Sends the errors visitors run into to Better Stack error tracking, so the team sees every problem
// without anyone having to press Report. It uses the same small message format as the Sentry browser
// code (which Better Stack understands) without loading that code, because it is too heavy for phones.
// What is sent: the page link, the browser, what the visitor was doing, what the site told them and the
// technical details. Never names, phone numbers or anything typed into a form.
import { ERROR_DSN } from './config.js';

const dsn = /^https:\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(ERROR_DSN || '');
const ENDPOINT = dsn ? `https://${dsn[2]}/api/${dsn[3]}/envelope/?sentry_key=${dsn[1]}&sentry_version=7` : '';

// pages stop on purpose with these after showing their own message (not found, redirect to login...)
const ON_PURPOSE = /^(bad id|not found|not logged in|not admin|login first|profile not found|wanted limit|not owner|no profile)$/;
const MAX_PER_PAGE = 10; // a broken page must not send hundreds
let sent = 0;
const seen = new Set();

/* The page link without sign-in codes or tokens (Google sign-in puts them in the address for a moment). */
const SECRET_PARAM = /^(code|token|access_token|refresh_token|provider_token|provider_refresh_token|id_token|token_hash)$/i;
export function cleanUrl(href = location.href) {
  try {
    const u = new URL(href);
    [...u.searchParams.keys()].filter((k) => SECRET_PARAM.test(k)).forEach((k) => u.searchParams.set(k, 'removed'));
    if (/(access|refresh|provider|id)_token=|(^|[#&])code=/.test(u.hash)) u.hash = '#removed';
    return u.href;
  } catch { return `${location.origin}${location.pathname}`; }
}

/* Turn a browser stack trace into the frames Better Stack shows (oldest call first). */
function frames(stack) {
  return String(stack || '').split('\n')
    .map((l) => l.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?$/) || l.match(/^(.*?)@(.+?):(\d+):(\d+)$/))
    .filter(Boolean)
    .map((m) => ({ function: m[1] || '?', filename: m[2], abs_path: m[2], lineno: +m[3], colno: +m[4], in_app: m[2].startsWith(location.origin) }))
    .reverse();
}

export function trackError(err, doing = '', shown = '', note = '') {
  try {
    if (!ENDPOINT || !navigator.onLine || sent >= MAX_PER_PAGE) return;
    const isErr = err instanceof Error;
    const message = String(err?.message || (typeof err === 'string' ? err : '') || shown || 'Unknown error');
    if (ON_PURPOSE.test(message) || message === 'Script error.') return; // Script error. = another site's script, no details
    const key = `${doing}|${message}`;
    if (seen.has(key)) return;
    seen.add(key); sent++;
    const stack = isErr ? frames(err.stack) : [];
    const id = (crypto.randomUUID?.() || `${Date.now()}${Math.random()}`).replace(/[^0-9a-f]/g, '').padEnd(32, '0').slice(0, 32);
    const event = {
      event_id: id,
      timestamp: Date.now() / 1000,
      platform: 'javascript',
      level: 'error',
      environment: location.hostname,
      transaction: location.pathname,
      request: { url: cleanUrl(), headers: { 'User-Agent': navigator.userAgent } },
      tags: { doing: doing || 'unknown', language: document.documentElement.lang || 'en' },
      extra: { shown_to_visitor: shown || null, step: note || null, code: err?.code || null, status: err?.status || null, details: err?.details || null, hint: err?.hint || null },
      exception: { values: [{ type: isErr ? err.name || 'Error' : err?.code ? `Database error ${err.code}` : 'Error', value: message, ...(stack.length ? { stacktrace: { frames: stack } } : {}) }] },
    };
    const body = `${JSON.stringify({ event_id: id, sent_at: new Date().toISOString() })}\n{"type":"event"}\n${JSON.stringify(event)}`;
    fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } }).catch(() => {});
  } catch { /* error tracking must never break the page */ }
}