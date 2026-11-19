// Post Activity reminder selection and the reminder email. Run: node tests/notify.test.mjs
import assert from 'node:assert/strict';
import { dueActivities, reminderEmail } from '../supabase/functions/_shared/notify.js';

const now = Date.parse('2026-11-19T20:00:00Z');
const since = Date.parse('2026-11-19T00:00:00Z');
const act = (id, startIso, secs, extra = {}) => ({ id, start_date: startIso, elapsed_time: secs, moving_time: secs, name: 'Ride ' + id, type: 'Ride', ...extra });
const acts = [
  act('i1', '2026-11-19T18:00:00Z', 3600),            // ended 19:00, 60 min ago: due
  act('i2', '2026-11-19T19:00:00Z', 3540),            // ended 19:59, 1 min ago: too soon
  act('i3', '2026-11-19T17:00:00Z', 3600),            // already filled in
  act('i4', '2026-11-19T18:30:00Z', 600),             // 10 min: too short
  act('i5', '2026-11-18T22:00:00Z', 3600),            // started before reminders were switched on
  act('i6', '2026-11-19T17:30:00Z', 3600, { external_id: 'aevigor-abc-2026-11-19-1730' }),   // logged in Aevigor
  act('i7', '2026-11-19T19:00:00Z', 3300)             // ended 19:55, 5 min ago: due
];
const due = dueActivities(acts, { nowMs: now, sinceMs: since, logged: new Set(['i3']) });
assert.deepEqual(due.map((a) => a.id), ['i1', 'i7']);
assert.equal(due[0].name, 'Ride i1');
assert.deepEqual(dueActivities(acts, { nowMs: now + 25 * 3600000, sinceMs: since, logged: new Set() }), [], 'nothing older than a day');
assert.deepEqual(dueActivities(null, { nowMs: now, sinceMs: since, logged: new Set() }), []);

const m = reminderEmail({ heading: 'Hi <you>', lines: ['A & B'], button: 'Go', url: 'https://aevigor.com/beta/#/checkin' });
assert.ok(m.html.includes('Hi &lt;you&gt;') && m.html.includes('A &amp; B'), 'escaped');
assert.ok(m.text.includes('https://aevigor.com/beta/#/checkin') && m.text.includes('not medical advice'));
console.log('ok notify');
