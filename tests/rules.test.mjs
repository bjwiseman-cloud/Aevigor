// Parity test: the ported rules must give the same status as the live v5 Apps Script on the same data.
// Run: node tests/rules.test.mjs [path-to-v5-folder]
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { evaluate, addDays } from '../supabase/functions/_shared/rules.js';

const dir = process.argv[2];
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function makeDays(end, n, profile) {
  const days = {};
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(end, -i), late = i < 10;
    const w = {
      hrv: rand() < 0.05 ? null : Math.round(60 + rand() * 20 - (late && profile.lowHrv ? 18 : 0)),
      restingHR: rand() < 0.05 ? null : Math.round(48 + rand() * 6 + (late && profile.highRhr ? 6 : 0)),
      sleepSecs: Math.round((6.2 + rand() * 2.5 - (i < 2 && profile.short ? 1.5 : 0)) * 3600)
    };
    if (rand() < 0.85) ['fatigue', 'soreness', 'sleepQuality', 'stress', 'mood'].forEach((k) => {
      w[k] = Math.min(4, 1 + Math.floor(rand() * 3) + (i === 0 && profile.tired ? 1 : 0));
    });
    if (i === 0 && profile.sick) w.sick = profile.sick;
    days[d] = w;
  }
  return days;
}

const end = '2026-11-16';
const profiles = [];
for (const lowHrv of [false, true]) for (const highRhr of [false, true]) for (const short of [false, true])
  for (const tired of [false, true]) for (const sick of [null, 'Mild', 'Yes']) profiles.push({ lowHrv, highRhr, short, tired, sick });

let orig = null;
if (dir) {
  const src = ['part1-core.js', 'part2-data.js', 'part6-email-helpers.js'].map((f) => fs.readFileSync(dir + '/' + f, 'utf8')).join('\n');
  const ctx = { console, Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) }, Math, JSON, Date, Object, Number, String, Array, isFinite };
  vm.createContext(ctx);
  vm.runInContext(src + '\nthis.evaluate_ = evaluate_;', ctx);
  orig = ctx.evaluate_;
}

const seen = {};
for (let rep = 0; rep < 20; rep++) for (const p of profiles) {
  const days = makeDays(end, 90, p);
  const mine = evaluate(end, days);
  assert.ok(mine, 'should evaluate');
  seen[mine.status] = (seen[mine.status] || 0) + 1;
  seen['w:' + mine.weekly] = (seen['w:' + mine.weekly] || 0) + 1;
  if (p.sick === 'Yes') assert.equal(mine.status, 'GO EASY');
  if (p.sick === 'Mild') assert.ok(['CAUTION', 'GO EASY'].includes(mine.status));
  if (orig) {
    const wellness = {}, sick = {};
    for (const [d, w] of Object.entries(days)) { const { sick: s, ...rest } = w; wellness[d] = rest; if (s) sick[d] = s; }
    const theirs = orig(end, { wellness, extras: { sick, ride: {} }, daily: {}, acts: [], events: [] });
    assert.equal(mine.status, theirs.status, JSON.stringify(p));
    assert.equal(mine.weekly, theirs.weekly, JSON.stringify(p));
    assert.equal(JSON.stringify(mine.reasons), JSON.stringify(theirs.reasons));
  }
}
assert.equal(evaluate(end, {}), null, 'no history -> null');
console.log('ok', profiles.length * 20, 'cases', orig ? '(matched v5 Apps Script)' : '(v5 source not given, parity skipped)', seen);
