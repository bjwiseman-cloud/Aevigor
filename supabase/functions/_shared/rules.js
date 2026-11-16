// Aevigor daily status rules, ported from the v5 Apps Script (part1-core.js, evaluate_).
// Pure functions with no outside dependencies: used by the Supabase edge function and by the tests.
//
// Daily status (endurance only; lifting is not part of the rules):
//   1. Feel: check-in (fatigue, soreness, sleep quality, stress, mood) scored out of 25 against your 4-week normal.
//      Well below normal, or any worst-level answer = GO EASY; a little below = CAUTION.
//   2. HRV: 7-day average of ln(HRV) against your 60-day normal. Below -0.5 SD or above +1 SD = CAUTION.
//      Low HRV plus high resting HR plus soft Feel = GO EASY. Resting HR only confirms.
//   3. Sleep: a night under 6 h lowers the status one step.
//   4. Sickness: Yes (below the neck) = GO EASY; Mild (above the neck) = one step lower, at least CAUTION.
//   GO needs Feel at or above normal, 7 h+ sleep, HRV in its band and no flags.
// Weekly check: 7-day HRV below its band 3+ days = DELOAD (plus resting HR above its band = STRONG);
//   1-2 days, resting HR alone, or two short nights in a row = WATCH.

export const RULES_VERSION = 'v5';
export const BASE_DAYS = 60;
export const AVG_DAYS = 7;
export const STREAK_DAYS = 3;
export const FEEL_DAYS = 28;
export const HISTORY_DAYS = BASE_DAYS + 20;
export const FEEL_KEYS = ['fatigue', 'soreness', 'sleepQuality', 'stress', 'mood'];
const STEP = ['GO', 'OK', 'CAUTION', 'GO EASY'];

export function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
function r1(v) { return v === null || v === undefined || !isFinite(v) ? null : Math.round(v * 10) / 10; }

export function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Mean and sample SD of the non-null values in the `w` days ending at index k
export function stats(arr, k, w) {
  let c = 0, s = 0, ss = 0;
  for (let i = k - w + 1; i <= k; i++) {
    if (i >= 0 && arr[i] !== null && arr[i] !== undefined) { c++; s += arr[i]; ss += arr[i] * arr[i]; }
  }
  if (c < 2) return { mean: null, sd: null };
  const m = s / c;
  return { mean: m, sd: Math.sqrt(Math.max(0, (ss - c * m * m) / (c - 1))) };
}

// Feel score out of 25 from the 1-4 answers (1 = best -> 5 points, 4 = worst -> 1 point). Needs 3+ answers.
export function feelOf(w) {
  if (!w) return { score: null, worst: false, n: 0 };
  let s = 0, n = 0, worst = false;
  FEEL_KEYS.forEach((k) => {
    const v = num(w[k]);
    if (v !== null && v >= 1 && v <= 4) { s += 5 - (v - 1) * 4 / 3; n++; if (v === 4) worst = true; }
  });
  return { score: n >= 3 ? Math.round(s / n * 5 * 10) / 10 : null, worst, n };
}

function sleepOf(w) { return w && num(w.sleepSecs) !== null && w.sleepSecs > 0 ? w.sleepSecs / 3600 : null; }
function lnOf(v) { return v !== null && v > 0 ? Math.log(v) : null; }
function stepDown(s) { const i = STEP.indexOf(s); return i < 0 ? s : STEP[Math.min(3, i + 1)]; }
function maxStatus(a, b) { return STEP.indexOf(a) >= STEP.indexOf(b) ? a : b; }

// days: { 'YYYY-MM-DD': { hrv, restingHR, sleepSecs, fatigue, soreness, sleepQuality, stress, mood, sick } }
export function series(day, days, n) {
  const out = { dates: [], hrv: [], ln: [], rhr: [], sleep: [], feel: [], worst: [], sick: [] };
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(day, -i), w = days[d] || {}, f = feelOf(w);
    out.dates.push(d);
    out.hrv.push(num(w.hrv)); out.ln.push(lnOf(num(w.hrv)));
    out.rhr.push(num(w.restingHR)); out.sleep.push(sleepOf(w));
    out.feel.push(f.score); out.worst.push(f.worst);
    out.sick.push(w.sick === 'Yes' || w.sick === 'Mild' ? w.sick : null);
  }
  return out;
}

// Returns null when there is not enough history for a baseline yet.
// load (optional): { act, plan } of the 7 days before `day`, for the load alert.
export function evaluate(day, days, load) {
  const n = HISTORY_DAYS, S = series(day, days, n), last = n - 1;
  function bands(k) {
    const l7 = stats(S.ln, k, AVG_DAYS).mean, lb = stats(S.ln, k, BASE_DAYS);
    const r7 = stats(S.rhr, k, AVG_DAYS).mean, rb = stats(S.rhr, k, BASE_DAYS);
    return {
      l7, lb: lb.mean, lsd: lb.sd, r7, rb: rb.mean, rsd: rb.sd,
      hlow: l7 !== null && lb.mean !== null && l7 < lb.mean - 0.5 * lb.sd,
      hhigh: l7 !== null && lb.mean !== null && l7 > lb.mean + lb.sd,
      rhigh: r7 !== null && rb.mean !== null && r7 > rb.mean + 0.5 * rb.sd
    };
  }
  const b = bands(last);
  if (b.lb === null && b.rb === null) return null;
  b.h7 = b.l7 === null ? null : Math.exp(b.l7);
  b.hb = b.lb === null ? null : Math.exp(b.lb);
  b.hlo = b.lb === null ? null : Math.exp(b.lb - 0.5 * b.lsd);
  b.hhi = b.lb === null ? null : Math.exp(b.lb + b.lsd);

  let hs = 0, rs = 0;
  for (let k = last; k > last - 14 && bands(k).hlow; k--) hs++;
  for (let k = last; k > last - 14 && bands(k).rhigh; k--) rs++;

  const h = S.hrv[last], r = S.rhr[last], sleep = S.sleep[last];
  const feel = S.feel[last], worst = S.worst[last];
  const fs = stats(S.feel, last - 1, FEEL_DAYS);
  const fsd = fs.sd === null ? null : Math.max(fs.sd, 1.5);
  const feelLow = feel !== null && fs.mean !== null && (feel < fs.mean - fsd || worst);
  const feelSoft = feel !== null && fs.mean !== null && feel < fs.mean - 0.5 * fsd;
  const feelGood = feel !== null && (fs.mean === null || feel >= fs.mean) && !worst;
  const sick = S.sick[last];
  const reasons = [];

  let st = 'OK';
  if (h === null && r === null && feel === null) st = 'NO DATA';
  else {
    if (b.hlow || b.hhigh) { st = 'CAUTION'; reasons.push(b.hlow ? 'HRV 7-day trend below your normal' : 'HRV 7-day trend unusually high'); }
    if (feelSoft) { st = maxStatus(st, 'CAUTION'); reasons.push('Feel a little below your normal'); }
    if (feelLow) { st = 'GO EASY'; reasons.push(worst ? 'A check-in answer at the worst level' : 'Feel well below your normal'); }
    if (b.hlow && b.rhigh && feelSoft) { st = 'GO EASY'; reasons.push('Low HRV and high resting HR confirm the low Feel'); }
    if (st === 'OK' && feelGood && sleep !== null && sleep >= 7 && !b.hlow && !b.hhigh && !b.rhigh && !sick) st = 'GO';
    if (sleep !== null && sleep < 6) { st = stepDown(st); reasons.push('Short night (' + r1(sleep) + ' h)'); }
    if (sick === 'Yes') { st = 'GO EASY'; reasons.push('Sick (below the neck)'); }
    else if (sick === 'Mild') { st = maxStatus(stepDown(st), 'CAUTION'); reasons.push('Mild sickness (above the neck)'); }
  }

  const short2 = S.sleep[last] !== null && S.sleep[last] < 6 && S.sleep[last - 1] !== null && S.sleep[last - 1] < 6;
  let weekly = 'OK', weeklyWhy = '';
  if (hs >= STREAK_DAYS && rs >= STREAK_DAYS) { weekly = 'DELOAD - STRONG'; weeklyWhy = 'HRV low ' + hs + ' d and resting HR high ' + rs + ' d'; }
  else if (hs >= STREAK_DAYS) { weekly = 'DELOAD'; weeklyWhy = '7-day HRV below its band ' + hs + ' days in a row'; }
  else if (hs > 0 || rs >= STREAK_DAYS || short2) {
    weekly = 'WATCH';
    weeklyWhy = [hs ? 'HRV below its band ' + hs + ' d' : '', rs >= STREAK_DAYS ? 'resting HR high ' + rs + ' d (HRV normal)' : '', short2 ? 'two short nights in a row' : ''].filter(String).join(', ');
  }

  let loadOut = null;
  if (load && (load.plan > 0 || load.act > 0)) {
    const ratio = load.plan > 0 ? load.act / load.plan : null;
    loadOut = { act: Math.round(load.act), plan: Math.round(load.plan), ratio: ratio === null ? null : Math.round(ratio * 100) / 100, alert: ratio !== null && ratio > 1.2 };
  }

  return {
    day, status: st, reasons, weekly, weeklyWhy,
    signals: {
      hrv: h, restingHR: r, sleepHours: r1(sleep), feel, feelNormal: r1(fs.mean), worst, sick,
      hrv7: r1(b.h7), hrvNormal: r1(b.hb), hrvLow: r1(b.hlo), hrvHigh: r1(b.hhi),
      rhr7: r1(b.r7), rhrNormal: r1(b.rb), rhrHigh: r1(b.rb === null ? null : b.rb + 0.5 * b.rsd),
      hrvLowDays: hs, rhrHighDays: rs
    },
    checkin: feel !== null,
    load: loadOut
  };
}

// ---------- Training load vs plan (intervals.icu activities and planned workouts) ----------
const RIDE_TYPES = ['Ride', 'VirtualRide', 'GravelRide', 'MountainBikeRide', 'EBikeRide'];
const RUN_TYPES = ['Run', 'VirtualRun', 'TrailRun'];
function sportOf(t) { return RIDE_TYPES.includes(t) ? 'ride' : RUN_TYPES.includes(t) ? 'run' : 'other'; }

// Load per activity: intervals.icu's own training load; without one, session RPE (RPE x minutes / 10).
export function loadOf(a) {
  const l = num(a.icu_training_load);
  if (l !== null) return l;
  const rpe = num(a.icu_rpe) || num(a.perceived_exertion);
  const min = (num(a.moving_time) || 0) / 60;
  return rpe ? Math.round(rpe * min / 10) : 0;
}

// Compares like with like: only sports with planned workouts in the window count on the actual side.
export function loadVsPlan(day, acts, events) {
  const from = addDays(day, -7), to = addDays(day, -1), sports = {};
  let act = 0, plan = 0;
  (events || []).forEach((e) => {
    if (e.category && e.category !== 'WORKOUT') return;
    const d = String(e.start_date_local || '').slice(0, 10);
    if (d < from || d > to) return;
    plan += num(e.icu_training_load) || num(e.load_target) || 0;
    sports[sportOf(e.type || 'Ride')] = true;
  });
  (acts || []).forEach((a) => {
    const d = String(a.start_date_local || '').slice(0, 10);
    if (d >= from && d <= to && sports[sportOf(a.type)]) act += loadOf(a);
  });
  return { act, plan };
}

// ---------- Daily load per sport, for the Load and Trends pages ----------
export const TEST_RE = { ftp: /ftp|20.?min.*(test|tt)/i, vo2: /vo2|5.?min.*test/i, dur: /durab/i };

// Rows of { day, sport, actual, planned, rpe, sessions } for every day/sport with anything in it.
export function dailyLoadRows(acts, events) {
  const out = {};
  const row = (day, sport) => out[day + '|' + sport] || (out[day + '|' + sport] = { day, sport, actual: 0, planned: 0, rpe: null, sessions: 0 });
  (acts || []).forEach((a) => {
    const day = String(a.start_date_local || '').slice(0, 10);
    if (!day) return;
    const r = row(day, sportOf(a.type));
    r.actual += loadOf(a); r.sessions++;
    const rpe = num(a.icu_rpe) || num(a.perceived_exertion);
    if (rpe !== null && (r.rpe === null || rpe > r.rpe)) r.rpe = rpe;
  });
  (events || []).forEach((e) => {
    if (e.category && e.category !== 'WORKOUT') return;
    const day = String(e.start_date_local || '').slice(0, 10);
    if (!day) return;
    row(day, sportOf(e.type || 'Ride')).planned += num(e.icu_training_load) || num(e.load_target) || 0;
  });
  return Object.values(out).map((r) => ({ ...r, actual: Math.round(r.actual), planned: Math.round(r.planned) }));
}

// Planned tests found by name in the intervals.icu calendar, from `from` onwards
export function plannedTests(events, from) {
  return (events || []).filter((e) => !e.category || e.category === 'WORKOUT').map((e) => {
    const name = String(e.name || ''), day = String(e.start_date_local || '').slice(0, 10);
    const kind = TEST_RE.ftp.test(name) ? 'FTP test' : TEST_RE.vo2.test(name) ? 'VO2 test' : TEST_RE.dur.test(name) ? 'Durability test' : '';
    return kind && day >= from ? { day, kind, name: name.slice(0, 120) } : null;
  }).filter(Boolean).filter((t, i, all) => all.findIndex((x) => x.day === t.day && x.kind === t.kind) === i)
    .sort((a, b) => (a.day < b.day ? -1 : 1));
}
