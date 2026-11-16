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
  } else if (u.pathname.endsWith('/activities')) body = [{ start_date_local: addDays(day, -2) + 'T08:00:00', type: 'Ride', icu_training_load: 300 }];
  else if (u.pathname.endsWith('/events')) body = [{ start_date_local: addDays(day, -2) + 'T00:00:00', type: 'Ride', category: 'WORKOUT', icu_training_load: 100 }];
  return new Response(JSON.stringify(body), { status: 200 });
};

const db = { wellness: [], status: [], profile: {} };
const store = {
  checkins: async () => [{ day, fatigue: 4, soreness: 2, sleep_quality: 2, stress: 2, mood: 2, sick: 'Mild' }],
  upsertWellness: async (rows) => { db.wellness.push(...rows); },
  upsertStatus: async (rows) => { db.status.push(...rows); },
  updateProfile: async (_id, p) => Object.assign(db.profile, p)
};
const res = await syncUser({ userId: 'u1', key: 'abc123', athleteId: '0', timeZone: 'America/Edmonton', store, now });
assert.ok(res.ok);
assert.equal(db.status.length, 7, 'last 7 days computed');
assert.equal(res.today.status, 'GO EASY', 'worst-level fatigue answer from the check-in wins over intervals.icu');
assert.ok(res.today.reasons.includes('Mild sickness (above the neck)'));
assert.equal(res.today.load.alert, true, '300 vs 100 planned -> load alert');
assert.ok(calls.every((c) => c.auth === 'Basic ' + btoa('API_KEY:abc123')));
assert.ok(calls.every((c) => c.url.includes('/athlete/0/')));
assert.equal(db.profile.last_sync_error, null);

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
console.log('ok sync, merge, errors and encryption');
