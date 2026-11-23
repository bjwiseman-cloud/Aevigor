// Performance data from intervals.icu: one summary row per activity (with its best powers), and the
// athlete's power curves for the longer ranges. Every call is defensive: a missing field or a failed
// request only leaves that card empty, it never breaks the sync.
import { icu, athletePath } from './intervals.js';

export const BEST_SECS = [1, 5, 15, 30, 60, 180, 300, 480, 720, 1200, 1800, 3600, 5400, 7200, 10800];
export const CURVE_IDS = ['s0', '1y', 'all'];   // 30/60/90 days are worked out in the app from each ride's bests
export const CURVE_FETCH_CAP = 25;              // per-ride power curves fetched per sync (older rides fill in over later syncs)
const RIDE = /ride/i, RUN = /run/i;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Scalar fields only (no streams or arrays), so the app can show any metric intervals.icu provides.
export function scalars(a) {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'number' || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 200)) out[k] = v;
  }
  return out;
}

export function activityRow(a, userId) {
  const start = String(a.start_date_local || '');
  return {
    user_id: userId, id: String(a.id), day: start.slice(0, 10), start_local: start || null,
    type: a.type ? String(a.type) : 'Other', name: a.name ? String(a.name).slice(0, 200) : null,
    moving_time: num(a.moving_time), distance: num(a.distance), load: num(a.icu_training_load),
    raw: { ...scalars(a), ...zoneTimes(a), ...strainFields(a) }
  };
}

// intervals.icu Strain Score (SS) and its three sub-strains (SS CP, SS W′, SS Pmax). Top-level numbers are already
// kept by scalars(); if intervals.icu sends them grouped in an object, flatten that object as <key>_<child>.
export function strainFields(a) {
  const out = {};
  for (const [k, v] of Object.entries(a || {})) {
    if (!/strain|^ss_?/i.test(k) || !v || typeof v !== 'object' || Array.isArray(v)) continue;
    for (const [c, x] of Object.entries(v)) if (typeof x === 'number' && Number.isFinite(x)) out[`${k}_${c}`] = x;
  }
  return out;
}

// Time in each zone (seconds), as intervals.icu worked it out with the athlete's own zones. Stored as
// comma-separated text because the activity row keeps scalar fields only. Sweet spot (SS) overlaps zones, so it is left out.
export function zoneTimes(a) {
  const out = {};
  const secsOf = (x) => (typeof x === 'number' ? x : typeof x?.secs === 'number' ? x.secs : null);
  const put = (key, list) => {
    if (!Array.isArray(list) || !list.length) return;
    const v = list.filter((x) => !(x && typeof x === 'object' && /^SS$/i.test(String(x.id ?? '')))).map(secsOf);
    if (v.some((x) => x == null) || !v.some((x) => x > 0)) return;
    out[key] = v.map((x) => Math.round(x)).join(',');
  };
  put('zt_power', a?.icu_zone_times);
  put('zt_hr', a?.icu_hr_zone_times);
  put('zt_pace', a?.pace_zone_times);
  return out;
}

// Picks watts at the standard durations from a curve given as { secs: [], watts|values: [] }.
export function bestFromCurve(c) {
  const secs = c?.secs, w = c?.watts ?? c?.values;
  if (!Array.isArray(secs) || !Array.isArray(w)) return null;
  const out = {};
  for (const s of BEST_SECS) {
    const i = secs.indexOf(s);
    if (i >= 0 && num(w[i]) && w[i] > 0) out[s] = Math.round(w[i]);
  }
  return out;
}

export async function fetchActivityCurve(key, id) {
  const r = await icu(key, '/activity/' + encodeURIComponent(id) + '/power-curve');
  return bestFromCurve(Array.isArray(r) ? r[0] : r) ?? {};
}

// Ride power curves, then running power curves (from a running power meter such as Stryd or a Garmin watch)
export async function fetchAthleteCurves(key, athleteId, userId) {
  const ride = await fetchCurves(key, athleteId, userId, 'Ride', 'ride');
  const run = await fetchCurves(key, athleteId, userId, 'Run', 'run').catch(() => []);
  return [...ride, ...run];
}

async function fetchCurves(key, athleteId, userId, type, sport) {
  const get = (ids) => icu(key, athletePath(athleteId) + '/power-curves?type=' + type + '&curves=' + ids.join(','));
  const r = await get(CURVE_IDS).catch(() => get(['1y', 'all']));
  const list = Array.isArray(r?.list) ? r.list : Array.isArray(r) ? r : [];
  return list.filter((c) => Array.isArray(c?.secs) && Array.isArray(c?.values ?? c?.watts)).map((c) => ({
    user_id: userId, sport, curve: String(c.id ?? c.label ?? ''),
    label: c.label ? String(c.label).slice(0, 60) : null,
    secs: c.secs.map(Number), watts: (c.values ?? c.watts).map((x) => Math.round(Number(x) || 0)),
    wkg: Array.isArray(c.watts_per_kg) ? c.watts_per_kg.map((x) => Math.round((Number(x) || 0) * 100) / 100) : null,
    activity_ids: Array.isArray(c.activity_id) ? c.activity_id.map((x) => (x == null ? null : String(x))) : null,
    synced_at: new Date().toISOString()
  })).filter((c) => c.curve && c.watts.some((w) => w > 0));
}

// Running pace curves: best time for each distance (intervals.icu pace-curves, real pace, not grade-adjusted).
export const RUN_CURVE_IDS = ['84d', '1y', 'all'];
export async function fetchPaceCurves(key, athleteId, userId) {
  const r = await icu(key, athletePath(athleteId) + '/pace-curves?type=Run&gap=false&pmType=CS&curves=' + RUN_CURVE_IDS.join(','));
  const list = Array.isArray(r?.list) ? r.list : Array.isArray(r) ? r : [];
  return list.filter((c) => Array.isArray(c?.distance) && Array.isArray(c?.values) && c.distance.length).map((c) => {
    const cs = (Array.isArray(c.paceModels) ? c.paceModels : []).find((m) => m?.type === 'CS') ?? {};
    return {
      user_id: userId, curve: String(c.id ?? '').replace(/-f\d+$/, ''),
      label: c.label ? String(c.label).slice(0, 60) : null,
      meters: c.distance.map((x) => Math.round((Number(x) || 0) * 10) / 10),
      secs: c.values.map((x) => Math.round(Number(x) || 0)),
      activity_ids: Array.isArray(c.activity_id) ? c.activity_id.map((x) => (x == null ? null : String(x))) : null,
      critical_speed: num(cs.criticalSpeed), d_prime: num(cs.dPrime),
      synced_at: new Date().toISOString()
    };
  }).filter((c) => c.curve);
}

/**
 * Saves the activity rows, fills in best powers for rides that don't have them yet, and refreshes the curves.
 * store: { knownBests(userId, ids) -> Set of ids that already have bests, upsertActivities(rows), pruneActivities(userId, from, to, keepIds), replaceCurves(userId, rows), replacePaceCurves?(userId, rows) }
 */
export async function syncPerformance({ userId, key, athleteId, acts, from, to, store }) {
  if (!store.upsertActivities) return { activities: 0 };
  const rows = acts.filter((a) => a?.id && a.start_date_local).map((a) => activityRow(a, userId));
  const have = await store.knownBests(userId, rows.map((r) => r.id));
  const need = rows.filter((r) => (RIDE.test(r.type) || RUN.test(r.type)) && !have.has(r.id) && (r.raw.icu_average_watts || r.raw.average_watts))
    .sort((a, b) => b.day.localeCompare(a.day)).slice(0, CURVE_FETCH_CAP);
  for (const r of need) {
    try { r.best = await fetchActivityCurve(key, r.id); } catch { /* try again next sync */ }
  }
  await store.upsertActivities(rows);
  await store.pruneActivities(userId, from, to, rows.map((r) => r.id));
  const curves = await fetchAthleteCurves(key, athleteId, userId).catch(() => []);
  if (curves.length) await store.replaceCurves(userId, curves);
  let pace = [];
  if (store.replacePaceCurves) {
    pace = await fetchPaceCurves(key, athleteId, userId).catch(() => []);
    if (pace.length) await store.replacePaceCurves(userId, pace);
  }
  return { activities: rows.length, bests: need.filter((r) => r.best).length, curves: curves.length, paceCurves: pace.length };
}

// Streams for one activity (Sessions detail and the W′ card), fetched on demand.
export async function fetchStreams(key, id) {
  const r = await icu(key, '/activity/' + encodeURIComponent(id) + '/streams?types=time,watts,heartrate,cadence,velocity_smooth,altitude,distance');
  const out = {};
  for (const s of Array.isArray(r) ? r : []) if (s?.type && Array.isArray(s.data)) out[s.type] = s.data.map((x) => (x == null ? null : Number(x)));
  return out;
}
