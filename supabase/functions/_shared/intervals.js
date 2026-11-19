// intervals.icu API helpers. Each person uses their own API key; athlete "0" means "the owner of this key".
const BASE = 'https://intervals.icu/api/v1';

export class IntervalsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function icu(key, path, method = 'GET', body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      Authorization: 'Basic ' + btoa('API_KEY:' + key),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    const msg = res.status === 401 || res.status === 403
      ? 'intervals.icu did not accept the API key. Check it in intervals.icu > Settings > Developer Settings.'
      : 'intervals.icu error ' + res.status + ': ' + text.slice(0, 160);
    throw new IntervalsError(res.status, msg);
  }
  return text ? JSON.parse(text) : null;
}

export function athletePath(athleteId) {
  const id = String(athleteId || '0');
  if (!/^i?\d+$/.test(id)) throw new IntervalsError(400, 'That athlete ID does not look right. It looks like i123456.');
  return '/athlete/' + id;
}

// Wellness rows keyed by day, in the shape the rules expect
// Other numbers kept for Trends: custom fields from the check-in and values synced from a watch or scale.
export const EXTRA_FIELDS = ['Sickness', 'MentalClarity', 'Libido', 'Caffeine', 'Alcohol', 'BodyTemp', 'weight', 'bodyFat', 'vo2max', 'steps', 'sleepScore', 'spO2', 'respiration', 'hydrationVolume'];
export function extraOf(w) {
  const o = {};
  for (const k of EXTRA_FIELDS) { const v = Number(w?.[k]); if (w?.[k] !== null && w?.[k] !== undefined && w?.[k] !== '' && Number.isFinite(v)) o[k] = v; }
  return o;
}

export async function fetchWellness(key, athleteId, oldest, newest) {
  const rows = await icu(key, athletePath(athleteId) + '/wellness?oldest=' + oldest + '&newest=' + newest) || [];
  return rows.map((w) => ({
    day: String(w.id).slice(0, 10),
    hrv: w.hrv ?? null, resting_hr: w.restingHR ?? null, sleep_secs: w.sleepSecs ?? null,
    sleep_quality: w.sleepQuality ?? null, fatigue: w.fatigue ?? null, soreness: w.soreness ?? null,
    stress: w.stress ?? null, mood: w.mood ?? null, motivation: w.motivation ?? null,
    extra: extraOf(w)
  }));
}

export async function fetchActivities(key, athleteId, oldest, newest) {
  return await icu(key, athletePath(athleteId) + '/activities?oldest=' + oldest + '&newest=' + newest) || [];
}

export async function fetchEvents(key, athleteId, oldest, newest) {
  return await icu(key, athletePath(athleteId) + '/events?oldest=' + oldest + '&newest=' + newest) || [];
}

// Writes the check-in answers to the person's intervals.icu wellness for that day, so they also show there.
export async function putWellness(key, athleteId, day, body) {
  return await icu(key, athletePath(athleteId) + '/wellness/' + day, 'PUT', { id: day, ...body });
}

// Upload an activity file (.fit, .gpx, .tcx; may be gzipped) to the athlete's intervals.icu, which processes it.
export async function uploadActivity(key, athleteId, name, bytes) {
  const form = new FormData();
  form.append('file', new Blob([bytes]), name);
  const res = await fetch(BASE + athletePath(athleteId) + '/activities', { method: 'POST', headers: { Authorization: 'Basic ' + btoa('API_KEY:' + key) }, body: form });
  const text = await res.text();
  if (!res.ok) throw new IntervalsError(res.status, 'intervals.icu could not take that file (' + res.status + '): ' + text.slice(0, 160));
  return text ? JSON.parse(text) : null;
}

// Profile numbers from intervals.icu (athlete + Sport Settings): thresholds and zones per sport, shown read-only in Profile.
// Only plain numbers and short names are kept.
const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const nums = (a) => (Array.isArray(a) ? a.slice(0, 12).map(num).filter((x) => x !== null) : null);
const names = (a) => (Array.isArray(a) ? a.slice(0, 12).map((x) => String(x).slice(0, 30)) : null);
export function athleteProfile(a) {
  if (!a || typeof a !== 'object') return null;
  const sports = (Array.isArray(a.sportSettings) ? a.sportSettings : []).slice(0, 20).map((s) => ({
    types: Array.isArray(s.types) ? s.types.slice(0, 20).map((t) => String(t).slice(0, 40)) : [],
    ftp: num(s.ftp), indoor_ftp: num(s.indoor_ftp), w_prime: num(s.w_prime), p_max: num(s.p_max),
    lthr: num(s.lthr), max_hr: num(s.max_hr), threshold_pace: num(s.threshold_pace), pace_units: s.pace_units ? String(s.pace_units).slice(0, 20) : null,
    power_zones: nums(s.power_zones), power_zone_names: names(s.power_zone_names),
    hr_zones: nums(s.hr_zones), hr_zone_names: names(s.hr_zone_names),
    pace_zones: nums(s.pace_zones), pace_zone_names: names(s.pace_zone_names)
  })).filter((s) => s.types.length);
  return { weight: num(a.icu_weight ?? a.weight), resting_hr: num(a.icu_resting_hr), sports };
}
export async function fetchAthlete(key, athleteId) {
  return athleteProfile(await icu(key, athletePath(athleteId)));
}
