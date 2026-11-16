// Aevigor beta app: sign-in, consent, connect intervals.icu, Today, Check-in, Guide and Settings.
// Data comes from Supabase; the database only ever returns the signed-in person's own rows.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

const CFG = window.AEVIGOR_BETA || {};
const CONSENT_VERSION = 'beta-2026-11';
const view = document.getElementById('view');
const tabs = document.getElementById('tabs');
const syncBtn = document.getElementById('syncBtn');
const HOME = location.origin + location.pathname;

const STATUS = {
  'GO': { color: '#39ff9a', icon: '🚀', head: 'Go: push day', tag: 'FULL POWER // CLEAR GRID', advice: 'Everything lines up. Do the planned session as written.',
    do: 'The hard session as planned, tests included', avoid: 'Adding unplanned extra volume just because you feel good', watch: 'Sleep tonight, and finish sessions by about 9 pm' },
  'OK': { color: '#00f0ff', icon: '🏍️', head: 'All clear', tag: 'LIGHT CYCLE READY // ENTER THE GRID', advice: 'Green light. Train as planned.',
    do: 'Train as planned, hard sessions included', avoid: 'Max tests if Feel or sleep are only so-so', watch: 'Sleep tonight, and finish sessions by about 9 pm' },
  'CAUTION': { color: '#ffcc00', icon: '⚠️', head: 'Caution', tag: 'GRID SIGNAL FLICKERING', advice: 'Train, but let the warm-up decide.',
    do: 'Full 15-min warm-up, then keep the hard work only if HR and effort feel normal', avoid: 'Max tests, PR attempts, very long threshold efforts',
    watch: 'HR higher than usual at the same power, or effort 1-2 RPE harder: switch to easy' },
  'GO EASY': { color: '#ff3d3d', icon: '😴', head: 'Go easy today', tag: 'LIGHT CYCLE IN THE GARAGE', advice: 'Recovery day. Swap the planned session for something easy.',
    do: 'Easy spin up to 60 min, walk or mobility', avoid: 'Intervals, tests, HIIT, competitive racket sports', watch: 'Sore throat, fever or unusual tiredness: rest fully. Extra sleep tonight' },
  'NO DATA': { color: '#5f7f99', icon: '⏳', head: 'Waiting for data', tag: 'AWAITING UPLINK', advice: 'No reading yet today.',
    do: 'Sync your watch, do your check-in, then tap Sync', avoid: 'Guessing: go by feel and keep it moderate', watch: 'Wear your watch overnight so HRV and resting HR are recorded' }
};
const WEEKLY = {
  'OK': { color: '#00f0ff', icon: '✅', text: 'No deload needed.' },
  'WATCH': { color: '#ffcc00', icon: '👀', text: 'Watch the next 1-2 mornings. Avoid two hard days in a row.' },
  'DELOAD': { color: '#ff6a00', icon: '🔻', text: 'Make this an easier week: cut volume 30-40%, keep one short quality session.' },
  'DELOAD - STRONG': { color: '#ff3d3d', icon: '🛑', text: 'Take 3-5 easy days, extra sleep, good food.' }
};
const QUESTIONS = [
  { key: 'sleep_quality', label: '🌙 Sleep quality', opts: ['Great', 'Good', 'Average', 'Poor'] },
  { key: 'fatigue', label: '🔋 Fatigue', opts: ['Low', 'Average', 'High', 'Extreme'] },
  { key: 'soreness', label: '💪 Muscle soreness', opts: ['Low', 'Average', 'High', 'Extreme'] },
  { key: 'stress', label: '🧠 Stress', opts: ['Low', 'Average', 'High', 'Extreme'] },
  { key: 'mood', label: '😀 Mood', opts: ['Great', 'Good', 'OK', 'Grumpy'] },
  { key: 'motivation', label: '🔥 Motivation', opts: ['Extreme', 'High', 'Average', 'Low'] }
];
const SICK = [['No', 'No'], ['Mild', 'Mild · above the neck'], ['Yes', 'Yes · below the neck']];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (v, unit = '') => (v === null || v === undefined || !isFinite(v) ? '–' : (Math.round(v * 10) / 10) + unit);
const todayIn = (tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); } catch { return new Date().toISOString().slice(0, 10); } };
const niceDay = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

if (!CFG.supabaseUrl || !CFG.anonKey) {
  view.innerHTML = '<h1>Not set up yet</h1><p class="muted">The beta server details have not been added to config.js yet.</p>';
  throw new Error('Aevigor beta: config.js is empty');
}
const sb = createClient(CFG.supabaseUrl, CFG.anonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } });

let session = null, profile = null, recovering = false;
// A refused Google sign-up (not on the invite list) comes back as an error in the address bar
const urlErr = new URLSearchParams(location.search + '&' + location.hash.slice(1)).get('error_description');
if (urlErr) history.replaceState(null, '', location.pathname);

function show(html, withTabs) {
  view.innerHTML = html;
  tabs.classList.toggle('hidden', !withTabs);
  syncBtn.classList.toggle('hidden', !withTabs);
  window.scrollTo(0, 0);
}
function msg(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text; el.className = 'msg show ' + (ok ? 'ok' : 'err');
}
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'WORKING…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}

async function api(name, body = {}) {
  const { data } = await sb.auth.getSession();
  const res = await fetch(CFG.supabaseUrl + '/functions/v1/api/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CFG.anonKey, Authorization: 'Bearer ' + (data.session?.access_token || '') },
    body: JSON.stringify(body)
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || 'Something went wrong (' + res.status + ').');
  return out;
}

async function loadProfile() {
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  profile = data;
}

// ---------- Routing ----------
async function route() {
  if (recovering) return renderReset();
  if (!session) return renderSignIn();
  if (!profile) {
    try { await loadProfile(); } catch (e) { return show('<h1>Could not load your account</h1><p class="muted">' + esc(e.message) + '</p>'); }
  }
  if (!profile) return show('<h1>Account not found</h1><p class="muted">Please sign out and back in.</p><button class="wide" id="out">SIGN OUT</button>');
  if (!profile.consent_at || profile.consent_version !== CONSENT_VERSION) return renderConsent();
  const page = (location.hash || '#today').slice(1);
  if (!profile.intervals_connected_at && page !== 'settings' && page !== 'guide') return renderConnect();
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.p === page));
  if (page === 'checkin') return renderCheckin();
  if (page === 'guide') return renderGuide();
  if (page === 'settings') return renderSettings();
  if (page === 'connect') return renderConnect();
  return renderToday();
}
window.addEventListener('hashchange', route);
view.addEventListener('click', (e) => { if (e.target.id === 'out') signOut(); });

async function signOut() { await sb.auth.signOut(); profile = null; location.hash = ''; }

// ---------- Sign in ----------
function renderSignIn(mode = 'in') {
  const up = mode === 'up';
  show(`
    <h1>${up ? 'Create your account' : 'Sign in'}</h1>
    <p class="muted">Aevigor is invite-only during the beta. Use the email address your invite was sent to.</p>
    <button class="google" id="google" type="button"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>Continue with Google</button>
    <p class="or">or with email</p>
    <form id="f" class="card" novalidate>
      <label for="email">Email</label><input id="email" type="email" autocomplete="email" required>
      <label for="pw">Password</label><input id="pw" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="8" required>
      ${up ? '<p class="muted" style="margin-top:6px">At least 8 characters.</p>' : ''}
      <div id="m" class="msg"></div>
      <button class="primary" id="go" type="submit">${up ? 'CREATE ACCOUNT' : 'SIGN IN'}</button>
    </form>
    <p class="muted" style="text-align:center">
      ${up ? 'Already have an account? <a href="#" id="sw">Sign in</a>' : 'New tester? <a href="#" id="sw">Create your account</a> · <a href="#" id="forgot">Forgot password?</a>'}
    </p>
    <p class="muted" style="text-align:center"><a href="/legal/beta-privacy.html">Beta privacy notice</a> · <a href="/legal/beta-terms.html">Beta terms</a></p>`);
  if (urlErr && mode === 'in') msg('m', friendlyAuthError({ message: urlErr }));
  document.getElementById('sw').onclick = (e) => { e.preventDefault(); renderSignIn(up ? 'in' : 'up'); };
  const forgot = document.getElementById('forgot');
  if (forgot) forgot.onclick = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim();
    if (!email) return msg('m', 'Type your email above first, then tap Forgot password.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: HOME });
    msg('m', error ? error.message : 'If that email has an account, a reset link is on its way.', !error);
  };
  document.getElementById('google').onclick = async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: HOME } });
    if (error) msg('m', error.message);
  };
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value.trim(), password = document.getElementById('pw').value;
    if (!email || password.length < (up ? 8 : 1)) return msg('m', up ? 'Enter your email and a password of at least 8 characters.' : 'Enter your email and password.');
    const btn = document.getElementById('go'); busy(btn, true);
    try {
      if (up) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: HOME } });
        if (error) throw error;
        if (!data.session) msg('m', 'Almost there: check your email and tap the link to confirm your account.', true);
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) { msg('m', friendlyAuthError(err)); }
    busy(btn, false);
  };
}

function friendlyAuthError(err) {
  const m = String(err.message || err);
  if (/invite-only/i.test(m)) return 'Aevigor is invite-only during the beta, and this email is not on the invite list. Join the waitlist at aevigor.com.';
  if (/invalid login/i.test(m)) return 'That email and password do not match.';
  if (/not confirmed/i.test(m)) return 'Please confirm your email first: check your inbox for the link.';
  if (/database error/i.test(m)) return 'This email is not on the invite list yet.';
  return m;
}

function renderReset() {
  show(`<h1>Choose a new password</h1><form id="f" class="card">
    <label for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" minlength="8" required>
    <div id="m" class="msg"></div><button class="primary" id="go" type="submit">SAVE PASSWORD</button></form>`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const password = document.getElementById('pw').value;
    if (password.length < 8) return msg('m', 'At least 8 characters, please.');
    const { error } = await sb.auth.updateUser({ password });
    if (error) return msg('m', error.message);
    recovering = false; msg('m', 'Saved.', true); setTimeout(route, 800);
  };
}

// ---------- Consent ----------
function renderConsent() {
  show(`
    <h1>Before you start</h1>
    <div class="card">
      <h2>WHAT AEVIGOR STORES</h2>
      <ul>
        <li>Your email and name.</li>
        <li>From your intervals.icu account: HRV, resting heart rate, sleep, and your recent and planned workouts.</li>
        <li>Your daily check-in answers, including whether you feel sick.</li>
        <li>Your intervals.icu API key, encrypted.</li>
      </ul>
      <h2>WHY</h2>
      <p>Only to work out your daily training status and show it to you. Your data is not sold, shared or used for ads.</p>
      <h2>WHERE AND WHO</h2>
      <p>Stored with Supabase in Canada. Each tester can only see their own data. Ben (who runs Aevigor) can technically see stored data in the database, and will only look to fix a problem you report.</p>
      <h2>YOUR CHOICES</h2>
      <p>Disconnect intervals.icu or delete your account and all your data at any time in Settings.</p>
      <p class="muted">Full details: <a href="/legal/beta-privacy.html" target="_blank">Beta privacy notice</a> · <a href="/legal/beta-terms.html" target="_blank">Beta terms</a></p>
      <label class="check"><input type="checkbox" id="c1"> I have read the beta privacy notice and terms, and I agree to Aevigor storing and using my health and training data as described.</label>
      <label class="check"><input type="checkbox" id="c2"> I understand Aevigor gives training guidance, not medical advice, and this is an early test version that may have mistakes.</label>
      <div id="m" class="msg"></div>
      <button class="primary" id="go" type="button">I AGREE</button>
      <button class="wide" id="out" type="button">NOT NOW, SIGN OUT</button>
    </div>`);
  document.getElementById('go').onclick = async (e) => {
    if (!document.getElementById('c1').checked || !document.getElementById('c2').checked) return msg('m', 'Please tick both boxes to continue.');
    busy(e.target, true);
    const patch = { consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION };
    const { error } = await sb.from('profiles').update(patch).eq('user_id', session.user.id);
    busy(e.target, false);
    if (error) return msg('m', error.message);
    Object.assign(profile, patch); route();
  };
}

// ---------- Connect intervals.icu ----------
function renderConnect() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Edmonton';
  show(`
    <h1>Connect intervals.icu</h1>
    <p>Aevigor reads your HRV, resting heart rate, sleep and workouts from intervals.icu. You only do this once.</p>
    <div class="card">
      <h2>FIND YOUR API KEY</h2>
      <ol>
        <li>Open <a href="https://intervals.icu/settings" target="_blank" rel="noopener">intervals.icu › Settings</a> (on a computer is easiest).</li>
        <li>Scroll down to <b>Developer Settings</b>.</li>
        <li>Tap <b>Generate</b> (or <b>View</b>) next to API Key, then copy it.</li>
      </ol>
      <p class="muted">Your watch (Garmin, Polar and so on) needs to be linked to intervals.icu so HRV and sleep arrive there.</p>
      <form id="f">
        <label for="key">API key</label><input id="key" autocomplete="off" spellcheck="false" placeholder="Paste your API key">
        <label for="tz">Your time zone</label><select id="tz">${tzOptions(tz)}</select>
        <div id="m" class="msg"></div>
        <button class="primary" id="go" type="submit">CONNECT</button>
      </form>
    </div>
    <p class="muted">Your key is encrypted before it is saved and is never shown again. You can disconnect any time in Settings.</p>
    ${profile.intervals_connected_at ? '<button class="wide" onclick="location.hash=\'#today\'">CANCEL</button>' : '<button class="wide" id="out">SIGN OUT</button>'}`);
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('go'); busy(btn, true, 'CONNECTING… (UP TO 30 S)');
    try {
      const r = await api('connect', { api_key: document.getElementById('key').value.trim(), time_zone: document.getElementById('tz').value });
      await loadProfile();
      msg('m', 'Connected' + (r.athlete?.name ? ' as ' + r.athlete.name : '') + '.', true);
      setTimeout(() => { location.hash = '#today'; route(); }, 900);
    } catch (err) { msg('m', err.message); }
    busy(btn, false);
  };
}

function tzOptions(sel) {
  let list = [];
  try { list = Intl.supportedValuesOf('timeZone'); } catch { list = ['America/Edmonton', 'America/Vancouver', 'America/Toronto']; }
  if (!list.includes(sel)) list.unshift(sel);
  return list.map((z) => `<option${z === sel ? ' selected' : ''}>${esc(z)}</option>`).join('');
}

// ---------- Today ----------
async function renderToday() {
  show('<p class="muted">Loading today…</p>', true);
  const day = todayIn(profile.time_zone);
  const [{ data: rows }, { data: ci }] = await Promise.all([
    sb.from('daily_status').select('*').lte('day', day).order('day', { ascending: false }).limit(1),
    sb.from('checkins').select('day').eq('day', day).maybeSingle()
  ]);
  const r = rows && rows[0];
  if (!r) {
    show(`<h1>Today</h1><div class="card"><p><b>Not enough history yet.</b></p>
      <p class="muted">The status needs a couple of weeks of HRV or resting heart rate from intervals.icu to learn your normal. Keep wearing your watch overnight and doing the check-in; it fills in on its own.</p>
      ${syncLine()}</div>`, true);
    return;
  }
  const st = STATUS[r.status] || STATUS['NO DATA'], wk = WEEKLY[r.weekly] || WEEKLY.OK, s = r.signals || {};
  const stale = r.day !== day;
  const reasons = (r.reasons || []).length ? r.reasons.map((x) => '<li>' + esc(x) + '</li>').join('') : '<li>All signals normal</li>';
  const color = (c) => `<span class="dot" style="background:${c}"></span>`;
  const G = '#00f0ff', W = '#ffcc00', B = '#ff5e1a', N = '#5f7f99';
  const feelC = s.feel === null || s.feel === undefined ? N : s.worst ? B : s.feelNormal !== null && s.feel < s.feelNormal - 1 ? W : G;
  const hrvC = s.hrv7 === null ? N : s.hrv7 < s.hrvLow ? W : s.hrv7 > s.hrvHigh ? W : G;
  const sleepC = s.sleepHours === null ? N : s.sleepHours < 6 ? B : s.sleepHours < 7 ? W : G;
  const rhrC = s.rhr7 === null ? N : s.rhr7 > s.rhrHigh ? W : G;
  const lines = [
    ['Feel', feelC, s.feel === null || s.feel === undefined ? (ci ? 'Not enough answers' : '<a href="#checkin">Do your check-in</a>') : `${fmt(s.feel)}/25 <span class="muted">(normal ${fmt(s.feelNormal)})</span>`],
    ['HRV 7-day', hrvC, `${fmt(s.hrv7, ' ms')} <span class="muted">(normal ${fmt(s.hrvLow)}–${fmt(s.hrvHigh)})</span>`],
    ['Sleep', sleepC, fmt(s.sleepHours, ' h')],
    ['Resting HR', rhrC, `${fmt(s.restingHR, ' bpm')} <span class="muted">(7-day ${fmt(s.rhr7)})</span>`]
  ];
  if (s.sick) lines.push(['Sickness', s.sick === 'Yes' ? B : W, s.sick === 'Yes' ? 'Below the neck' : 'Mild, above the neck']);
  if (r.load && r.load.plan > 0) lines.push(['Load vs plan', r.load.alert ? B : G, `${r.load.act} / ${r.load.plan} <span class="muted">(last 7 days)</span>`]);
  show(`
    <p class="muted" style="text-align:center;margin:0">${esc(niceDay(r.day))}${stale ? ' · <b style="color:#ffcc00">latest available</b>' : ''}</p>
    <div class="card status" style="border-color:${st.color};box-shadow:0 0 18px ${st.color}44">
      <div class="icon">${st.icon}</div>
      <div class="head mono" style="color:${st.color}">${esc(st.head)}</div>
      <div class="tag mono">${esc(st.tag)}</div>
      <p style="margin-top:10px">${esc(st.advice)}</p>
      <div class="dl"><b>Do</b><span>${esc(st.do)}</span><b>Avoid</b><span>${esc(st.avoid)}</span><b>Watch</b><span>${esc(st.watch)}</span></div>
    </div>
    <div class="card"><h2>WHY</h2><ul style="margin:0;padding-left:20px">${reasons}</ul></div>
    <div class="card" style="border-color:${wk.color}"><h2>WEEKLY CHECK</h2>
      <p style="margin:0"><b style="color:${wk.color}">${wk.icon} ${esc(r.weekly)}</b>${r.weekly_why ? ' · <span class="muted">' + esc(r.weekly_why) + '</span>' : ''}</p>
      <p class="muted" style="margin:6px 0 0">${esc(wk.text)}</p></div>
    <div class="card"><h2>SIGNALS</h2>${lines.map(([k, c, v]) => `<div class="line"><span>${color(c)}${k}</span><span class="v">${v}</span></div>`).join('')}</div>
    ${!ci ? '<a href="#checkin"><button class="primary" type="button">DO TODAY\'S CHECK-IN</button></a>' : ''}
    ${syncLine()}
    <p class="muted" style="text-align:center">Training guidance, not medical advice.</p>`, true);
}

function syncLine() {
  const t = profile.last_sync ? new Date(profile.last_sync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
  return `<p class="muted" style="text-align:center">Last synced: ${esc(t)}${profile.last_sync_error ? '<br><span style="color:#ff5e1a">Last sync problem: ' + esc(profile.last_sync_error) + '</span>' : ''}</p>`;
}

syncBtn.onclick = async () => {
  busy(syncBtn, true, '⟳ SYNCING…');
  try { await api('sync'); await loadProfile(); route(); }
  catch (e) { alertCard(e.message); }
  busy(syncBtn, false);
};
function alertCard(text) {
  const d = document.createElement('div');
  d.className = 'msg show err'; d.textContent = text;
  view.prepend(d); setTimeout(() => d.remove(), 8000);
}

// ---------- Check-in ----------
async function renderCheckin() {
  show('<p class="muted">Loading…</p>', true);
  const day = todayIn(profile.time_zone);
  const { data: ex } = await sb.from('checkins').select('*').eq('day', day).maybeSingle();
  const vals = {};
  QUESTIONS.forEach((q) => { if (ex && ex[q.key]) vals[q.key] = ex[q.key]; });
  if (ex && ex.sick) vals.sick = ex.sick;
  const opt = (key, opts) => `<div class="opts${opts.length === 3 ? ' o3' : ''}">${opts.map((o, i) => {
    const v = Array.isArray(o) ? o[0] : i + 1, label = Array.isArray(o) ? o[1] : o;
    return `<button type="button" data-k="${key}" data-v="${v}" class="${String(vals[key]) === String(v) ? 'sel' : ''}">${esc(label)}</button>`;
  }).join('')}</div>`;
  show(`
    <h1>Morning check-in</h1>
    <p class="muted">${esc(niceDay(day))}${ex ? ' · saved, you can change it' : ''}. Answer how you feel right now.</p>
    <div class="card">
      ${QUESTIONS.map((q) => `<div class="q"><div class="lbl">${q.label}</div>${opt(q.key, q.opts)}</div>`).join('')}
      <div class="q"><div class="lbl">🤒 Feeling sick?</div>${opt('sick', SICK)}
        <p class="muted" style="margin-top:6px">Above the neck: runny nose, sore throat. Below the neck: fever, chest, aches, stomach.</p></div>
      <label for="notes">Notes (optional)</label><textarea id="notes" maxlength="2000">${esc(ex?.notes || '')}</textarea>
      <div id="m" class="msg"></div>
      <button class="primary" id="go" type="button">SAVE CHECK-IN</button>
    </div>`, true);
  view.querySelectorAll('.opts button').forEach((b) => b.onclick = () => {
    vals[b.dataset.k] = b.dataset.k === 'sick' ? b.dataset.v : Number(b.dataset.v);
    b.parentNode.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
  });
  document.getElementById('go').onclick = async (e) => {
    const answered = QUESTIONS.filter((q) => vals[q.key]).length;
    if (answered < 3) return msg('m', 'Please answer at least 3 questions so your Feel score can be worked out.');
    busy(e.target, true, 'SAVING…');
    try {
      const r = await api('checkin', { day, ...vals, notes: document.getElementById('notes').value });
      await loadProfile();
      msg('m', 'Saved' + (r.copied ? ' and copied to intervals.icu.' : '.'), true);
      setTimeout(() => { location.hash = '#today'; }, 900);
    } catch (err) { msg('m', err.message); }
    busy(e.target, false);
  };
}

// ---------- Guide ----------
function renderGuide() {
  const pm = (label, q) => `<a href="https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(q)}" target="_blank" rel="noopener">${label}</a>`;
  show(`
    <h1>Guide</h1>
    <p class="muted">How your daily status works and the research behind it. Training guidance, not medical advice.</p>
    <div class="card">
      <details open><summary>🚦 Daily status</summary>
        <p>Signals in order of weight:</p><ul>
        <li><b>Feel</b> (weighted most): fatigue, soreness, sleep quality, stress and mood, scored out of 25 against your own 4-week normal. Well below normal, or any answer at the worst level = <b>GO EASY</b>; a little below = <b>CAUTION</b>.</li>
        <li><b>HRV 7-day trend</b>: the 7-day average of your HRV against your 60-day normal. Below the band, or unusually high = <b>CAUTION</b>. Low HRV plus high resting HR plus low Feel = <b>GO EASY</b>.</li>
        <li><b>Sleep</b>: a night under 6 hours lowers the status one step.</li>
        <li><b>Sickness</b>: Yes (below the neck) = <b>GO EASY</b>; Mild (above the neck) = one step lower, at least CAUTION.</li>
        <li><b>Resting HR</b> only confirms the others.</li></ul>
        <p><b>GO</b> needs Feel at or above normal, 7 h+ sleep, HRV and resting HR in range and no sickness.</p>
        <p class="muted">Based on: ${pm('Saw 2016', 'Saw 2016 subjective objective measures athlete')} · ${pm('Plews 2013', 'Plews 2013 training adaptation heart rate variability elite endurance')} · ${pm('Buchheit 2014', 'Buchheit 2014 monitoring training status heart rate')} · ${pm('Fullagar 2015', 'Fullagar 2015 sleep athletic performance')} · ${pm('Halson 2014', 'Halson 2014 monitoring training load')}</p>
      </details>
      <details><summary>📅 Weekly check</summary>
        <p>7-day HRV below its band 3+ days in a row = <b>DELOAD</b>; with resting HR also above its band 3+ days = <b>DELOAD - STRONG</b>. 1-2 days, resting HR alone, or two short nights in a row = <b>WATCH</b>.</p>
        <p class="muted">Based on: ${pm('Plews 2012', 'Plews 2012 heart rate variability overreaching triathlete')} · ${pm('Meeusen 2013', 'Meeusen 2013 overtraining syndrome consensus')}</p>
      </details>
      <details><summary>📈 Load vs plan</summary>
        <p>If you plan workouts in intervals.icu, Aevigor compares the last 7 days of actual load with the plan. More than 20% above plan is flagged. Only sports you planned are counted.</p>
      </details>
      <details><summary>⏳ Getting started</summary>
        <p>Your normal is learned from your own history, so the status needs a couple of weeks of overnight HRV or resting HR in intervals.icu. The more mornings you check in, the better the Feel score works.</p>
        <p>Data syncs on its own each morning and around noon. Tap <b>⟳ SYNC</b> after your watch has synced to update straight away.</p>
      </details>
      <details><summary>🐞 Beta feedback</summary>
        <p>This is an early test version. If something looks wrong, tell Ben with a screenshot and the date.</p>
      </details>
    </div>`, true);
}

// ---------- Settings ----------
function renderSettings() {
  const prov = (session.user.app_metadata?.providers || [session.user.app_metadata?.provider]).filter(Boolean);
  show(`
    <h1>Settings</h1>
    <div class="card"><h2>ACCOUNT</h2>
      <p>${esc(session.user.email)} <span class="badge">${esc(prov.join(', ') || 'email')}</span></p>
      <label for="name">Name</label><input id="name" value="${esc(profile.display_name || '')}" maxlength="80">
      <label for="tz">Time zone</label><select id="tz">${tzOptions(profile.time_zone)}</select>
      <div id="m1" class="msg"></div>
      <button class="wide" id="save" type="button">SAVE</button>
      ${prov.includes('email') ? '<label for="pw">New password</label><input id="pw" type="password" autocomplete="new-password" minlength="8"><button class="wide" id="pwgo" type="button">CHANGE PASSWORD</button>' : ''}
    </div>
    <div class="card"><h2>INTERVALS.ICU</h2>
      ${profile.intervals_connected_at
        ? `<p>Connected as athlete <b>${esc(profile.intervals_athlete_id)}</b>.</p><button class="wide" id="reconnect" type="button">CHANGE API KEY</button><button class="wide danger" id="disc" type="button">DISCONNECT</button>`
        : '<p class="muted">Not connected.</p><button class="wide" id="reconnect" type="button">CONNECT</button>'}
      <div id="m2" class="msg"></div>
    </div>
    <div class="card"><h2>PRIVACY</h2>
      <p class="muted"><a href="/legal/beta-privacy.html" target="_blank">Beta privacy notice</a> · <a href="/legal/beta-terms.html" target="_blank">Beta terms</a> · You agreed on ${esc(new Date(profile.consent_at).toLocaleDateString())}.</p>
      <label for="del">Delete my account and all my data. This cannot be undone. Type DELETE to confirm.</label>
      <input id="del" autocomplete="off">
      <div id="m3" class="msg"></div>
      <button class="wide danger" id="delgo" type="button">DELETE MY ACCOUNT</button>
    </div>
    <button class="wide" id="out" type="button">SIGN OUT</button>`, true);
  document.getElementById('save').onclick = async () => {
    const patch = { display_name: document.getElementById('name').value.trim() || null, time_zone: document.getElementById('tz').value };
    const { error } = await sb.from('profiles').update(patch).eq('user_id', session.user.id);
    if (error) return msg('m1', error.message);
    Object.assign(profile, patch); msg('m1', 'Saved.', true);
  };
  const pwgo = document.getElementById('pwgo');
  if (pwgo) pwgo.onclick = async () => {
    const password = document.getElementById('pw').value;
    if (password.length < 8) return msg('m1', 'At least 8 characters, please.');
    const { error } = await sb.auth.updateUser({ password });
    msg('m1', error ? error.message : 'Password changed.', !error);
  };
  document.getElementById('reconnect').onclick = () => renderConnect();
  const disc = document.getElementById('disc');
  if (disc) disc.onclick = async () => {
    busy(disc, true);
    try { await api('disconnect'); await loadProfile(); renderSettings(); } catch (e) { msg('m2', e.message); busy(disc, false); }
  };
  document.getElementById('delgo').onclick = async (e) => {
    if (document.getElementById('del').value.trim() !== 'DELETE') return msg('m3', 'Type DELETE in the box to confirm.');
    busy(e.target, true, 'DELETING…');
    try {
      await api('delete-account', { confirm: 'DELETE' });
      await sb.auth.signOut(); profile = null;
      show('<h1>Account deleted</h1><p>Your account and all your Aevigor data have been deleted. Thanks for testing.</p>');
    } catch (err) { msg('m3', err.message); busy(e.target, false); }
  };
}

// ---------- Start ----------
sb.auth.onAuthStateChange((event, s) => {
  const changed = (s?.user?.id || null) !== (session?.user?.id || null);
  session = s;
  if (event === 'PASSWORD_RECOVERY') recovering = true;
  if (changed) profile = null;
  if (changed || event === 'PASSWORD_RECOVERY' || event === 'SIGNED_OUT') setTimeout(route, 0);
});
sb.auth.getSession().then(({ data }) => { session = data.session; route(); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
