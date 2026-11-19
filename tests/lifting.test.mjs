// Lifting log maths and CSV import (run with: node --experimental-strip-types tests/lifting.test.mjs)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// Photo of my log: text from the photo reader turned into exercises and sets
{
  const R = await import('../web/src/lib/logreader.ts');
  const names = ['Barbell Squat', 'Barbell Bench Press - Medium Grip', 'Barbell Deadlift', 'Pullups', 'Dumbbell Bicep Curl'];
  const out = R.parseLog('Back squat\n100 x 5, 105 x 5, 110kg x 3\nBench 80 x 8 RIR 2\nDeadlift 3x5 140kg\nPull ups 3 x 8\nDB curl 12kg x 10 x 3', names);
  assert.deepEqual(out.map((l) => l.name), ['Barbell Squat', 'Barbell Bench Press - Medium Grip', 'Barbell Deadlift', 'Pullups', 'Dumbbell Bicep Curl']);
  assert.deepEqual(out[0].sets.map((s) => s.kg + 'x' + s.reps), ['100x5', '105x5', '110x3']);
  assert.deepEqual(out[1].sets[0], { kg: '80', reps: '8', rir: '2' });
  assert.equal(out[2].sets.length, 3);
  assert.equal(out[3].sets[0].kg, '', 'sets x reps with no weight');
  assert.equal(R.readSets('225 lb x 5', 'kg')[0].kg, '102.06', 'pounds converted to kg');
  assert.equal(R.parseLog('Notes: felt good', names).length, 0);
    // A Liftosaur screenshot (dark theme), as the on-phone reader returned it after the contrast fix
  const lifto = R.parseLog(readFileSync('tests/fixtures/liftosaur-ocr.txt', 'utf8'), ['Machine Chest Press', 'Seated Cable Row', 'Barbell Shoulder Press', 'Lying Leg Curls', 'Dumbbell Flyes'], 'lb');
  assert.deepEqual(lifto.map((l) => [l.name, l.sets.map((x) => `${x.kg}x${x.reps}`).join(' ')]), [
    ['Machine Chest Press', '100x10 100x10'], ['Machine Flye', '90x13 90x13'], ['Seated Cable Row', '236x16 236x15'],
    ['Barbell Shoulder Press', '115x13 115x13 115x12'], ['Seated Hammer Curls', '30x25 30x25 30x25'], ['Single-Leg Leg Curl', '50x25']
  ], 'name, then a WEIGHT / REPS table; muscle tags, equipment lines and icons ignored; weak matches keep the name as read');
  // Same screenshot read at a smaller size, where one "115" came out as "15"
  const lifto2 = R.parseLog(readFileSync('tests/fixtures/liftosaur-ocr-2.txt', 'utf8'), [], 'lb');
  assert.equal(lifto2.find((l) => /Shoulder/.test(l.name)).sets.map((x) => x.kg).join(' '), '115 115 115', 'a dropped leading 1 is put back');
  console.log('ok photo log reader');
}
