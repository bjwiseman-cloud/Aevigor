// Lifting log maths and CSV import (run with: node --experimental-strip-types tests/lifting.test.mjs)
import assert from 'node:assert/strict';
const L = await import('../web/src/lib/lifting.ts');

assert.equal(L.e1rm(100, 1), 100);
assert.equal(Math.round(L.e1rm(100, 5) * 10) / 10, 116.7);
assert.equal(L.e1rm(100, 15), null, 'high-rep sets are left out');

// FitNotes: weight column names the unit
let r = L.importCsv('Date,Exercise,Category,Weight (lbs),Reps,Distance,Distance Unit,Time\n2026-11-10,Flat Barbell Bench Press,Chest,225.0,5,,,\n2026-11-10,Flat Barbell Bench Press,Chest,225.0,4,,,\n', 'kg');
assert.equal(r.app, 'FitNotes'); assert.equal(r.sets.length, 2);
assert.deepEqual([r.sets[0].weight, r.sets[0].set_no, r.sets[1].set_no], [102.06, 1, 2]);

// Strong: semicolons, quoted fields, RPE -> RIR, unit not in the file
r = L.importCsv('"Date";"Workout Name";"Exercise Name";"Set Order";"Weight";"Reps";"RPE"\n"2026-11-12 07:30:00";"Legs";"Squat (Barbell)";"1";"140";"5";"8"\n', 'lb');
assert.equal(r.app, 'Strong'); assert.equal(r.unitFound, false);
assert.deepEqual([r.sets[0].day, r.sets[0].exercise, r.sets[0].rir, r.sets[0].weight], ['2026-11-12', 'Squat (Barbell)', 2, 63.5]);

// Liftosaur: warm-up flag, completed reps, unit column
r = L.importCsv('Workout DateTime,Exercise,Is Warmup Set?,Required Reps,Completed Reps,RPE,Completed RPE,Weight Value,Weight Unit\n2026-11-14T06:00:00.000Z,Deadlift,true,5,5,,,60,kg\n2026-11-14T06:10:00.000Z,Deadlift,false,3,2,,,180,kg\n', 'lb');
assert.equal(r.app, 'Liftosaur');
assert.deepEqual(r.sets.map((s) => [s.warmup, s.reps, s.weight]), [[true, 5, 60], [false, 2, 180]]);

// Hevy: set_index starts at 0
r = L.importCsv('title,start_time,exercise_title,set_index,set_type,weight_kg,reps\nPush,2026-11-15 08:00,Bench Press (Barbell),0,normal,100,5\nPush,2026-11-15 08:00,Bench Press (Barbell),1,normal,100,5\n', 'kg');
assert.deepEqual(r.sets.map((s) => s.set_no), [1, 2]);

assert.ok(L.importCsv('foo,bar\n1,2\n', 'kg').error, 'unknown files explain what is missing');

// Weekly volume and e1RM series
const sets = [
  { id: '1', day: '2026-11-10', exercise: 'Squat', set_no: 1, reps: 5, weight: 100, rir: null, warmup: false, note: null, source: 'app' },
  { id: '2', day: '2026-11-10', exercise: 'Squat', set_no: 2, reps: 5, weight: 60, rir: null, warmup: true, note: null, source: 'app' },
  { id: '3', day: '2026-11-16', exercise: 'Squat', set_no: 1, reps: 3, weight: 110, rir: null, warmup: false, note: null, source: 'app' }];
assert.deepEqual(L.weeklyVolume(sets, null).map((w) => [w.week, w.volume, w.sets]), [['2026-11-09', 500, 1], ['2026-11-16', 330, 1]]);
assert.deepEqual(L.e1rmSeries(sets, 'Squat').map((p) => p.day), ['2026-11-10', '2026-11-16']);
console.log('ok lifting');
