// Verify a mobile number with an SMS code (edge functions send-otp and verify-otp).
// Used on the post-ad page (a card in place of the form) and on My profile (in a popup).
// Step 1: number + Send code. Step 2: 6 code boxes + a big Verify button, with small Resend code (60 s wait)
// and Change number buttons under it. Everything is centred (css/app.css, "Mobile number check").
import { sb } from './supabase.js';
import { qs, esc, phoneLocal, fieldError, clearErrors, errorNotice, toast, getProfile } from './common.js';

const RESEND_SECONDS = 60; // same wait as the database (otp_issue)
const DIGITS = 6; // length of the SMS code (one box per digit)

// wording for the error codes the edge functions send back
const MESSAGES = {
  bad_phone: 'Enter a Sri Lankan mobile number, for example 0771234567.',
  same_number: 'This number is already verified on your account.',
  phone_taken: 'This number is already verified on another RentAds account. Use a different number, or email team@rentads.lk if it is yours.',
  cooldown: 'Please wait a minute before asking for another code.',
  too_many_user: 'You have asked for 3 codes in the last hour. Please try again later.',
  too_many_user_day: 'You have asked for 9 codes today. Please try again tomorrow.',
  too_many_phone: 'Too many codes were sent to this number today. Please try again tomorrow.',
  daily_cap: 'We cannot send codes right now. Please try again later.',
  sms_failed: 'We could not send the SMS. Check the number and try again.',
  bad_code: 'Enter the 6-digit code from the SMS.',
  expired: 'This code has expired. Tap Resend code to get a new one.',
  locked: 'Too many wrong tries. Ask for a new code.',
  none: 'Ask for a code first.',
  not_ready_send: 'We cannot send codes right now. Please try again later.',
  not_ready_check: 'We cannot check codes right now. Please try again later.',
};

/* Same rules as the edge functions: 07XXXXXXXX, 7XXXXXXXX, +947XXXXXXXX, 947XXXXXXXX -> 947XXXXXXXX. Landlines are refused. */
export function normaliseMobile(raw) {
  const d = String(raw || '').replace(/[\s\-()]/g, '');
  const m = d.match(/^0(7\d{8})$/) || d.match(/^(7\d{8})$/) || d.match(/^\+?94(7\d{8})$/);
  return m ? `94${m[1]}` : null;
}

/* Calls an edge function. Returns its answer ({ ok, error, ... }) or { fault } when it could not be reached. */
async function call(name, body) {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    // FunctionsFetchError: no connection. FunctionsHttpError: logged out (401) or the server failed.
    const status = Number(error.context?.status || 0);
    return { fault: { message: error.name === 'FunctionsFetchError' ? 'Failed to fetch' : error.message, status } };
  }
  if (!data) return { fault: { message: 'empty answer' } };
  // the server is not set up (a secret is missing): say so in plain words
  if (data.error === 'not_configured') return { ...data, error: name === 'send-otp' ? 'not_ready_send' : 'not_ready_check' };
  return data;
}

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* Draws the two steps into box. onVerified(profile) runs once the number is verified. */
export function mountPhoneVerify(box, { profile = null, onVerified = () => {} } = {}) {
  let phone = null; // the number the last code went to (947XXXXXXXX)
  let resendAt = 0; // when Resend code unlocks (ms)
  let timer = null;
  const start = profile?.phone && !profile.phone_verified ? phoneLocal(profile.phone) : '';

  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
  // the popup or card around the steps is drawn centred (css/app.css, .pv-shell)
  (box.closest('.modal, .card') || box).classList.add('pv-shell');

  function stepNumber(value = start) {
    stopTimer();
    box.innerHTML = `<form class="pv-form" novalidate>
      <div class="field"><label for="pv-phone">Mobile number</label>
        <input id="pv-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="16" placeholder="07X XXX XXXX" value="${esc(value)}">
        <div class="hint">Sri Lankan mobile numbers only. Your verified number stays private. Renters only see the contact details you put on each ad.</div></div>
      <div id="pv-msg"></div>
      <button class="btn pv-main" type="submit" data-multi>Send code</button>
    </form>`;
    const form = qs('form', box), input = qs('#pv-phone', box), btn = qs('button[type="submit"]', box);
    form.onsubmit = async (e) => {
      e.preventDefault();
      clearErrors(form); qs('#pv-msg', box).innerHTML = '';
      const p = normaliseMobile(input.value);
      if (!p) return fieldError(input, MESSAGES.bad_phone);
      btn.disabled = true;
      const r = await call('send-otp', { phone: p });
      btn.disabled = false;
      if (r.fault) { qs('#pv-msg', box).innerHTML = errorNotice(r.fault, 'send the code'); return; }
      if (!r.ok) return fieldError(input, MESSAGES[r.error] || MESSAGES.sms_failed);
      phone = p;
      stepCode(RESEND_SECONDS);
    };
    input.focus();
  }

  function stepCode(waitSeconds) {
    // one box per digit. The first box takes the whole code too: SMS autofill on phones and pasting put
    // all 6 digits there, and they are spread over the boxes.
    const boxesHtml = Array.from({ length: DIGITS }, (_, i) => `<input type="text" inputmode="numeric" pattern="[0-9]*"
      maxlength="${i ? 1 : DIGITS}" autocomplete="${i ? 'off' : 'one-time-code'}" aria-label="Digit ${i + 1} of 6">`).join('');
    box.innerHTML = `<form class="pv-form" novalidate>
      <p class="pv-sent">We sent a 6-digit code to ${esc(phoneLocal(phone))}.</p>
      <div class="field"><label id="pv-code-label">6-digit code</label>
        <div class="pv-code" id="pv-code" role="group" aria-labelledby="pv-code-label">${boxesHtml}</div></div>
      <div id="pv-msg"></div>
      <button class="btn pv-main" type="submit" data-multi>Verify</button>
      <div class="pv-more">
        <button class="btn btn-ghost btn-sm" type="button" id="pv-resend" data-multi disabled></button>
        <button class="btn btn-ghost btn-sm" type="button" id="pv-change" data-multi>Change number</button>
      </div>
    </form>`;
    const form = qs('form', box), group = qs('#pv-code', box), verifyBtn = qs('button[type="submit"]', box);
    const boxes = [...group.querySelectorAll('input')];
    const resend = qs('#pv-resend', box);
    const codeValue = () => boxes.map((b) => b.value).join('');
    const clearCode = () => { boxes.forEach((b) => { b.value = ''; }); boxes[0].focus(); };
    // writes digits into the boxes from box `from` onwards and moves to the next empty one
    const fill = (from, digits) => {
      let i = from;
      for (const d of digits) { if (i >= DIGITS) break; boxes[i++].value = d; }
      boxes[Math.min(i, DIGITS - 1)].focus();
    };
    boxes.forEach((b, i) => {
      b.addEventListener('input', () => {
        const d = b.value.replace(/\D/g, '');
        if (d.length <= 1) { b.value = d; if (d && i < DIGITS - 1) boxes[i + 1].focus(); return; }
        b.value = ''; fill(i, d); // pasted or filled in from the SMS
      });
      b.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !b.value && i > 0) { e.preventDefault(); boxes[i - 1].value = ''; boxes[i - 1].focus(); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < DIGITS - 1) { e.preventDefault(); boxes[i + 1].focus(); }
      });
      b.addEventListener('paste', (e) => {
        const d = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
        if (d) { e.preventDefault(); fill(d.length >= DIGITS ? 0 : i, d.slice(0, DIGITS)); }
      });
      b.addEventListener('focus', () => b.select());
    });

    const tick = () => {
      if (!box.isConnected) { stopTimer(); return; }
      const left = Math.ceil((resendAt - Date.now()) / 1000);
      if (left > 0) { resend.disabled = true; resend.textContent = `Resend code in ${clock(left)}`; return; }
      resend.disabled = false; resend.textContent = 'Resend code';
      stopTimer();
    };
    const countdown = (s) => { resendAt = Date.now() + s * 1000; stopTimer(); tick(); timer = setInterval(tick, 1000); };
    countdown(waitSeconds);

    form.onsubmit = async (e) => {
      e.preventDefault();
      clearErrors(form); qs('#pv-msg', box).innerHTML = '';
      const code = codeValue();
      if (!/^\d{6}$/.test(code)) {
        fieldError(group, MESSAGES.bad_code);
        (boxes.find((b) => !b.value) || boxes[0]).focus();
        return;
      }
      verifyBtn.disabled = true;
      const r = await call('verify-otp', { phone, code });
      verifyBtn.disabled = false;
      if (r.fault) { qs('#pv-msg', box).innerHTML = errorNotice(r.fault, 'check the code'); return; }
      if (!r.ok) {
        const text = r.error === 'wrong_code'
          ? `That code is not correct. ${r.tries_left} ${r.tries_left === 1 ? 'try' : 'tries'} left.`
          : MESSAGES[r.error] || MESSAGES.expired;
        fieldError(group, text);
        clearCode();
        return;
      }
      stopTimer();
      const fresh = await getProfile(true);
      toast('Mobile number verified', 'good');
      onVerified(fresh);
    };

    resend.onclick = async () => {
      clearErrors(form); qs('#pv-msg', box).innerHTML = '';
      resend.disabled = true;
      const r = await call('send-otp', { phone });
      if (r.fault) { tick(); qs('#pv-msg', box).innerHTML = errorNotice(r.fault, 'send the code'); return; }
      if (!r.ok) {
        if (r.error === 'cooldown' && r.wait) countdown(r.wait); else tick();
        fieldError(resend, MESSAGES[r.error] || MESSAGES.sms_failed);
        return;
      }
      countdown(RESEND_SECONDS);
      clearCode();
    };

    qs('#pv-change', box).onclick = () => stepNumber(phoneLocal(phone));
    boxes[0].focus();
  }

  stepNumber();
  return { stop: stopTimer };
}
