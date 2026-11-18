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
export async function fetchWellness(key, athleteId, oldest, newest) {
  const rows = await icu(key, athletePath(athleteId) + '/wellness?oldest=' + oldest + '&newest=' + newest) || [];
  return rows.map((w) => ({
    day: String(w.id).slice(0, 10),
    hrv: w.hrv ?? null, resting_hr: w.restingHR ?? null, sleep_secs: w.sleepSecs ?? null,
    sleep_quality: w.sleepQuality ?? null, fatigue: w.fatigue ?? null, soreness: w.soreness ?? null,
    stress: w.stress ?? null, mood: w.mood ?? null, motivation: w.motivation ?? null
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
