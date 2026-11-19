// Sync test with a fake intervals.icu and an in-memory store. Run: node tests/sync.test.mjs
import assert from 'node:assert/strict';
import { syncUser, mergeDays, todayIn } from '../supabase/functions/_shared/sync.js';
import { addDays } from '../supabase/functions/_shared/rules.js';
import { encrypt, decrypt } from '../supabase/functions/_shared/crypto.js';

const now = new Date('2026-11-16T15:00:00Z');
const day = todayIn('America/Edmonton', now);
assert.equal(day, '2026-11-16');
assert.equal(todayIn('America/Edmonton', new Date('2026-11-17T05:00:00Z')), '2026-11-16', 'still the 16th in Alberta');

const calls = [];
globalThis.fetch = async (url, opts) => {
  calls.push({ url, auth: opts.headers.Authorization });
  const u = new URL(url), oldest = u.searchParams.get('oldest');
  let body = [];
  if (u.pathname.endsWith('/wellness')) {
    for (let d = oldest; d <= day; d = addDays(d, 1)) body.push({ id: d, hrv: 65 + (d.charCodeAt(9) % 5), restingHR: 50, sleepSecs: 7.5 * 3600, fatigue: 2, soreness: 2, sleepQuality: 2, stress: 2, mood: 2 });
  } else if (u.pathname.endsWith('/activities')) body = [{ id: 'i9', start_date_local: addDays(day, -2) + 'T08:00:00', type: 'Ride', icu_training_load: 300, icu_average_watts: 210, icu_efficiency_factor: 1.6, icu_power_hr: [1, 2] }];
  else if (u.pathname.endsWith('/activity/i9/power-curve')) body = { secs: [1, 5, 300, 301], watts: [950, 900, 320, 319] };
  else if (u.pathname.endsWith('/power-curves')) body = { list: [{ id: 'all', label: 'All time', secs: [5, 300], values: [1000, 350], watts_per_kg: [13.3, 4.67] }] };
  else if (u.pathname.endsWith('/pace-curves')) body = { list: [{ id: '1y-f1', label: '1 year', distance: [400, 1000.4], values: [80, 230], activity_id: ['i7', 'i8'], paceModels: [{ type: 'CS', criticalSpeed: 3.9, dPrime: 210 }] }, { id: 'bad' }] };
  else if (u.pathname === '/api/v1/athlete/0') body = { icu_weight: 75.2, icu_resting_hr: 44, secret: 'x', sportSettings: [{ types: ['Ride', 'VirtualRide'], ftp: 280, w_prime: 21000, lthr: 165, max_hr: 188, power_zones: [55, 75, 90, 105, 120, 150, 999], power_zone_names: ['Z1', 'Z2'], hr_zones: [130, 150, 165, 175, 188], notes: 'drop me' }, { types: [] }] };
  else if (u.pathname.endsWith('/events')) body = [
    { start_date_local: addDays(day, -2) + 'T00:00:00', type: 'Ride', category: 'WORKOUT', icu_training_load: 100 },
    { id: 1, start_date_local: addDays(day, 9) + 'T00:00:00', type: 'VirtualRide', category: 'WORKOUT', name: 'FTP test 20 min', icu_training_load: 90 },
    { id: 2, start_date_local: addDays(day, 9) + 'T00:00:00', type: 'VirtualRide', category: 'WORKOUT', name: 'FTP test (copy)', icu_training_load: 0 },
    { id: 3, start_date_local: addDays(day, 20) + 'T00:00:00', category: 'RACE_A', name: 'Provincial TT' },
    { start_date_local: addDays(day, 5) + 'T00:00:00', type: 'WeightTraining', category: 'WORKOUT', name: 'Squat day', icu_training_load: 30 },
    { start_date_local: addDays(day, 3) + 'T00:00:00', type: 'Run', category: 'WORKOUT', icu_training_load: 40 },
    { start_date_local: addDays(day, 4) + 'T00:00:00', category: 'NOTE', name: 'vo2 note not a workout' }];
  return new Response(JSON.stringify(body), { status: 200 });
};

const db = { wellness: [], status: [], profile: {}, acts: [], curves: [], pace: [] };
const store = {
  checkins: async () => [{ day, fatigue: 4, soreness: 2, sleep_quality: 2, stress: 2, mood: 2, sick: 'Mild' }],
  upsertWellness: async (rows) => { db.wellness.push(...rows); },
  upsertStatus: async (rows) => { db.status.push(...rows); },
  updateProfile: async (_id, p) => Object.assign(db.profile, p),
  replaceLoad: async (_id, from, to, rows) => { db.load = { from, to, rows }; },
  replaceTests: async (_id, rows) => { db.tests = rows; },
  knownBests: async () => new Set(),
  upsertActivities: async (rows) => { db.acts = rows; },
  pruneActivities: async () => {},
  replaceCurves: async (_id, rows) => { db.curves = rows; },
  replacePaceCurves: async (_id, rows) => { db.pace = rows; },
  replaceCalendar: async (_id, rows) => { db.cal = rows; }
};
const res = await syncUser({ userId: 'u1', key: 'abc123', athleteId: '0', timeZone: 'America/Edmonton', store, now });
assert.ok(res.ok);
assert.equal(db.status.length, 7, 'last 7 days computed');
assert.equal(res.today.status, 'GO EASY', 'worst-level fatigue answer from the check-in wins over intervals.icu');
assert.ok(res.today.reasons.includes('Mild sickness (above the neck)'));
assert.equal(res.today.load.alert, true, '300 vs 100 planned -> load alert');
assert.ok(calls.every((c) => c.auth === 'Basic ' + btoa('API_KEY:abc123')));
assert.ok(calls.every((c) => c.url.includes('/athlete/0/') || c.url.endsWith('/athlete/0') || c.url.includes('/activity/i9/')), 'athlete calls use the key owner');
assert.equal(db.profile.last_sync_error, null);
assert.equal(db.profile.athlete.sports.length, 1, 'sport settings saved, empty ones dropped');
assert.equal(db.profile.athlete.sports[0].ftp, 280);
assert.equal(db.profile.athlete.resting_hr, 44);
assert.equal(db.profile.athlete.secret, undefined, 'only known fields kept');
assert.equal(db.profile.athlete.sports[0].notes, undefined);
// Load page data
const ride2 = db.load.rows.find((r) => r.day === addDays(day, -2) && r.sport === 'ride');
assert.deepEqual([ride2.actual, ride2.planned, ride2.sessions], [300, 100, 1]);
assert.equal(db.load.rows.find((r) => r.day === addDays(day, 9)).planned, 90);
assert.equal(db.load.rows.find((r) => r.day === addDays(day, 3)).sport, 'run');
assert.ok(db.load.rows.every((r) => r.user_id === 'u1' && r.day >= db.load.from && r.day <= db.load.to));
assert.deepEqual(db.tests.map((t) => [t.day, t.kind]), [[addDays(day, 9), 'FTP test']], 'one FTP test, notes ignored');
assert.ok(calls.some((c) => c.url.includes('/events?oldest=' + addDays(day, -365) + '&newest=' + addDays(day, 180))));
assert.deepEqual(db.cal.map((t) => [t.day, t.kind]), [[addDays(day, 4), 'Event'], [addDays(day, 9), 'FTP test'], [addDays(day, 9), 'FTP test'], [addDays(day, 20), 'Race A']], 'tests, races and calendar notes');
assert.equal(db.load.rows.find((r) => r.day === addDays(day, 5)).sport, 'WeightTraining', 'other sports keep their own type');

// Performance data
assert.equal(db.acts.length, 1);
assert.deepEqual(db.acts[0].best, { 1: 950, 5: 900, 300: 320 }, 'bests at standard durations only');
assert.equal(db.acts[0].raw.icu_efficiency_factor, 1.6);
assert.equal(db.acts[0].raw.icu_power_hr, undefined, 'arrays are not stored');
assert.deepEqual([db.curves[0].curve, db.curves[0].watts, db.curves[0].wkg], ['all', [1000, 350], [13.3, 4.67]]);
assert.equal(res.performance.bests, 1);
assert.equal(db.pace.length, 1, 'curves without distances are dropped');
assert.deepEqual([db.pace[0].curve, db.pace[0].meters, db.pace[0].secs, db.pace[0].critical_speed], ['1y', [400, 1000.4], [80, 230], 3.9]);
assert.ok(calls.some((c) => c.url.includes('/pace-curves?type=Run&gap=false')));

// mergeDays keeps intervals.icu answers when no check-in exists
const m = mergeDays([{ day: '2026-11-01', hrv: 60, fatigue: 3 }], []);
assert.equal(m['2026-11-01'].fatigue, 3);

// Failed sync records the error
globalThis.fetch = async () => new Response('nope', { status: 401 });
await assert.rejects(() => syncUser({ userId: 'u1', key: 'bad', athleteId: '0', timeZone: 'America/Edmonton', store, now }));
assert.match(db.profile.last_sync_error, /did not accept the API key/);

// Encryption round trip
const k = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64');
const c = await encrypt('secret-key', k);
assert.notEqual(c, 'secret-key');
assert.equal(await decrypt(c, k), 'secret-key');
// Extra wellness numbers and sickness typed in intervals.icu
import('../supabase/functions/_shared/intervals.js').then(({ extraOf }) => {
  assert.deepEqual(extraOf({ MentalClarity: 4, Libido: null, weight: '81.5', steps: 'x', Sickness: 0 }), { MentalClarity: 4, weight: 81.5, Sickness: 0 });
  const m = mergeDays([{ day: '2026-11-10', extra: { Sickness: 2 } }, { day: '2026-11-11', extra: { Sickness: 1 } }], [{ day: '2026-11-11', sick: 'No' }]);
  assert.equal(m['2026-11-10'].sick, 'Yes');
  assert.equal(m['2026-11-11'].sick, 'No', 'the check-in answer wins');
  console.log('ok sync, merge, extras, errors and encryption');
});

// Own zones sent to intervals.icu: only known fields, sane numbers, rising zones
{
  const { sportSettingsBody } = await import('../supabase/functions/_shared/intervals.js');
  const b = sportSettingsBody({ ftp: '285', lthr: 168, max_hr: 400, threshold_pace: 4.2, w_prime: 21000, junk: 5,
    power_zones: [55, 75, 90, 105, 120, 150, 999], hr_zones: [140, 130, 160] });
  assert.deepEqual(b, { ftp: 285, w_prime: 21000, lthr: 168, threshold_pace: 4.2, power_zones: [55, 75, 90, 105, 120, 150, 999] });
  assert.deepEqual(sportSettingsBody({}), {});
  console.log('ok own zones body');
}
