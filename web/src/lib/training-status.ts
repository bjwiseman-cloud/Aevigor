// Training status: one word for how training is going, ported from the live app (Apps Script V16+, Ben 2026-11-18).
// Overreaching needs all three: high load, a performance drop and 2+ signs of strain (Meeusen 2013: performance
// down plus symptoms). Load alone never gives Overreaching. Missing data is never treated as a drop.
// Training guidance, not a diagnosis.
import { addDays, series, stats, AVG_DAYS, BASE_DAYS, FEEL_DAYS } from '@rules';
import type { PmcPoint } from '@/lib/metrics';
import { isRide, n, type Activity, type TestResult } from '@/lib/perf';
import { e1rm, type LiftSet } from '@/lib/lifting';

// Colours follow Garmin's Training Status look (Ben 2026-11-19): Recovery blue, Maintaining yellow, Productive green,
// Strained magenta, Overreaching red, Peaking purple, Unproductive orange, Detraining grey.
export const TS_ORDER: [string, string, string][] = [
  ['Detraining', '#9ca3af', 'Load and Fitness are falling. Fitness is slipping away.'],
  ['Recovery', '#1e88e5', 'A lighter spell. Fitness is holding while fatigue clears.'],
  ['Peaking', '#7c3aed', 'Fresh and near your best Fitness: a good time for a test or race.'],
  ['Maintaining', '#f5bd2a', 'Load is steady, so Fitness is holding.'],
  ['Productive', '#16a34a', 'Load is rising and your body is handling it.'],
  ['Unproductive', '#f97316', 'Training is normal but performance is down. Check sleep, fuelling and stress.'],
  ['Strained', '#d63ad6', 'Your body is showing signs of strain. Ease off until they settle.'],
  ['Overreaching', '#e5303a', 'High load, performance down and several signs of strain. Plan easier days.']
];
export const statusColor = (w: string) => TS_ORDER.find((t) => t[0] === w)?.[1] ?? '#9ca3af';

export type Days = Record<string, Record<string, unknown>>;
export type StatusInput = { days: Days; all: PmcPoint[]; acts: Activity[]; tests: TestResult[]; lifts: LiftSet[] };
export type Status = { word: string; chips: [string, boolean][]; perf: string[]; sym: string[] };

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const median = (a: (number | null)[]) => { const v = a.filter(isNum).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1 = (v: number) => Math.round(v * 10) / 10;

export function trainingStatus(day: string, I: StatusInput, wpc: number | null): Status {
  const N = BASE_DAYS + 20, S = series(day, I.days, N), L = N - 1;
  const chips: [string, boolean][] = [], sym: string[] = [], perf: string[] = [];
  const lastK = <T,>(arr: T[], k: number) => arr.slice(L - k + 1, L + 1);
  const count = (arr: (number | null | string)[], fn: (v: number) => boolean) => arr.filter((v) => v !== null && v !== undefined && fn(v as number)).length;

  // ---- signs of strain: 3 of the last 4 days, against your own normal ----
  const fs = stats(S.feel, L - 4, FEEL_DAYS), fsd = fs.sd === null ? null : Math.max(fs.sd, 1.5);
  if (fs.mean !== null && fsd !== null && count(lastK(S.feel, 4), (v) => v < fs.mean! - 0.5 * fsd) >= 3) sym.push('Feel ↓');
  if (count(lastK(S.sleep, 4), (v) => v < 7) >= 3) sym.push('Sleep ↓');
  const sore: (number | null)[] = []; for (let i = L - 3; i <= L; i++) { const v = I.days[S.dates[i]]?.soreness; sore.push(isNum(v) ? v : null); }
  if (count(sore, (v) => v >= 3) >= 3) sym.push('Soreness ↑');
  let hl = 0, rh = 0;
  for (let k = L; k > L - 4; k--) {
    const l7 = stats(S.ln, k, AVG_DAYS).mean, lb = stats(S.ln, k, BASE_DAYS), r7 = stats(S.rhr, k, AVG_DAYS).mean, rb = stats(S.rhr, k, BASE_DAYS);
    if (l7 !== null && lb.mean !== null && l7 < lb.mean - 0.5 * lb.sd!) hl++;
    if (r7 !== null && rb.mean !== null && r7 > rb.mean + 0.5 * rb.sd!) rh++;
  }
  if (hl >= 3) sym.push('HRV ↓');
  if (rh >= 3) sym.push('Resting HR ↑');
  const sick14 = lastK(S.sick, 14).filter(Boolean).length;
  if (sick14 >= 2) sym.push(`Sick ${sick14} days`);

  // ---- performance drops (each check counts only with enough data) ----
  const rides = I.acts.filter((a) => isRide(a) && a.day <= day).sort((a, b) => a.day.localeCompare(b.day));
  const R = rides.filter((a) => a.day >= addDays(day, -84));
  const ef = R.filter((a) => (a.moving_time ?? 0) >= 3600 && isNum(n(a, 'icu_efficiency_factor'))).map((a) => ({ day: a.day, ef: n(a, 'icu_efficiency_factor')!, dc: n(a, 'decoupling') }));
  let have = 0, up = 0;
  if (ef.length >= 4) {
    have++;
    const lowAt = (i: number) => {
      const prior = ef.filter((q, j) => j < i && q.day >= addDays(ef[i].day, -28)).map((q) => q.ef);
      const st = stats(prior, prior.length - 1, prior.length);
      return st.mean !== null && ef[i].ef < st.mean - Math.max(st.sd ?? 0, 0.02);
    };
    const i = ef.length - 1;
    if (ef[i].day >= addDays(day, -10) && lowAt(i) && lowAt(i - 1)) perf.push('EF ↓ 2 rides');
    const dcs = ef.map((m) => m.dc).filter(isNum);
    if (dcs.length >= 4 && dcs[dcs.length - 1] > 5 && dcs[dcs.length - 2] > 5 && (median(dcs.slice(0, -2)) ?? 99) < 5) perf.push('Decoupling ↑');
  }
  const rpeOf = (a: Activity) => n(a, 'icu_rpe', 'perceived_exertion');
  const ifOf = (a: Activity) => { const v = n(a, 'icu_intensity'); return v == null ? null : v > 3 ? v : v * 100; };
  const rated = rides.filter((a) => rpeOf(a) && ifOf(a));
  if (rated.length >= 4) have++;
  const bucket = (a: Activity) => Math.round(ifOf(a)! / 10);
  const recentR = rated.filter((a) => a.day >= addDays(day, -14)).slice(-2);
  if (recentR.length === 2 && recentR.every((a) => {
    const base = median(rated.filter((b) => b.day < addDays(day, -14) && bucket(b) === bucket(a)).map(rpeOf));
    return base !== null && rpeOf(a)! >= base + 2;
  })) perf.push('Effort feels harder');
  const hard = rides.filter((a) => (ifOf(a) ?? 0) >= 85 && n(a, 'max_heartrate'));
  if (hard.length >= 3) have++;
  const hardNow = hard.filter((a) => a.day >= addDays(day, -14));
  const hardBase = median(hard.filter((a) => a.day < addDays(day, -14)).map((a) => n(a, 'max_heartrate')));
  if (hardNow.length && hardBase !== null && Math.max(...hardNow.map((a) => n(a, 'max_heartrate')!)) <= hardBase - 8) perf.push('Max HR ↓');
  // eFTP trend from intervals.icu
  const eftp = rides.map((a) => ({ d: a.day, v: n(a, 'icu_rolling_ftp', 'icu_pm_ftp') })).filter((x) => x.v);
  const eNow = eftp.filter((x) => x.d >= addDays(day, -14)).map((x) => x.v), ePrev = eftp.filter((x) => x.d < addDays(day, -28) && x.d >= addDays(day, -56)).map((x) => x.v);
  if (eNow.length && ePrev.length) {
    have++;
    const a1 = median(eNow)!, a0 = median(ePrev)!;
    if (a1 < a0 * 0.97) perf.push(`eFTP ↓ ${Math.round((1 - a1 / a0) * 100)}%`); else if (a1 > a0 * 1.01) up++;
  }
  // 5-min best: last 4 weeks vs the 8 weeks before (only after hard rides lately)
  const hardLately = rides.some((a) => a.day >= addDays(day, -28) && (ifOf(a) ?? 0) >= 85);
  const p5 = (a: Activity) => a.best?.[300] ?? null;
  const b4 = R.filter((a) => a.day >= addDays(day, -28) && p5(a)).map((a) => p5(a)!), b8 = R.filter((a) => a.day < addDays(day, -28) && p5(a)).map((a) => p5(a)!);
  if (b4.length && b8.length && hardLately) {
    have++;
    const x1 = Math.max(...b4), x0 = Math.max(...b8);
    if (x1 < x0 * 0.95) perf.push(`5-min best ↓ ${Math.round((1 - x1 / x0) * 100)}%`); else if (x1 > x0 * 1.02) up++;
  }
  // FTP and VO2 tests: latest vs the one before
  for (const kind of ['FTP', 'VO2']) {
    const T = I.tests.filter((t) => t.kind.startsWith(kind) && t.day <= day && t.day >= addDays(day, -180)).sort((a, b) => a.day.localeCompare(b.day));
    if (T.length >= 2) {
      have++;
      const t1 = T[T.length - 1].value, t0 = T[T.length - 2].value;
      if (t1 < t0 * 0.97) perf.push(`${kind} test ↓`); else if (t1 > t0 * 1.01) up++;
    }
  }
  // Lifting: e1RM of squat, bench or deadlift 5%+ below its 6-week best
  const lifts = I.lifts.filter((s) => s.day >= addDays(day, -42) && s.day <= day && !s.warmup);
  let liftDown = false;
  for (const nm of [/squat/i, /bench/i, /deadlift/i]) {
    const byDay = new Map<string, number>();
    lifts.filter((s) => nm.test(s.exercise)).forEach((s) => { const v = e1rm(s.weight, s.reps); if (v) byDay.set(s.day, Math.max(byDay.get(s.day) ?? 0, v)); });
    const e = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (e.length >= 2) { have++; if (e[e.length - 1][0] >= addDays(day, -10) && e[e.length - 1][1] < 0.95 * Math.max(...e.slice(0, -1).map((q) => q[1]))) liftDown = true; }
  }
  if (liftDown) perf.push('Lifting ↓');
  // How the watch says sessions felt (intervals.icu Feel 1-5, 4-5 = poor)
  const felt = I.acts.filter((a) => a.day <= day && a.day >= addDays(day, -14) && isNum(n(a, 'feel'))).sort((a, b) => a.day.localeCompare(b.day)).map((a) => 6 - n(a, 'feel')!);
  if (felt.length >= 2) { have++; if (felt.slice(-2).every((p) => p <= 2)) perf.push('Sessions felt worse'); }
  if (ef.length >= 6) { const h = Math.floor(ef.length / 2), m1 = mean(ef.slice(h).map((m) => m.ef))!, m0 = mean(ef.slice(0, h).map((m) => m.ef))!; if (m1 > m0 * 1.01) up++; }
  const rising = have ? up > 0 && perf.length === 0 : null;

  // ---- load ----
  const iT = I.all.findIndex((p) => p.day === day);
  const now = I.all[iT];
  if (!now) return { word: 'No status', chips: [], perf, sym };
  const ramp = iT >= 7 ? now.ctl - I.all[iT - 7].ctl : null;
  const ctl90 = Math.max(...I.all.slice(Math.max(0, iT - 90), iT + 1).map((p) => p.ctl || 0));
  const form = now.form, loadHigh = form < -30 || (ramp !== null && ramp > 8) || (wpc !== null && wpc > 120);
  if (form < -30) chips.push([`Form ${Math.round(form)}`, true]);
  if (ramp !== null && ramp > 8) chips.push([`Ramp +${r1(ramp)}/wk`, true]);
  if (wpc !== null && wpc > 120) chips.push([`${wpc}% of plan`, true]);
  const sickNow = S.sick[L] === 'Yes' || S.sick[L - 1] === 'Yes';
  let word: string;
  if (iT < 42 || now.ctl < 5) word = 'No status';
  else if (sickNow) word = 'Paused';
  else if (loadHigh && perf.length >= 1 && sym.length >= 2) word = 'Overreaching';
  else if (sym.length >= 2) word = 'Strained';
  else if (perf.length >= 1 && (ramp === null || ramp >= 0)) word = 'Unproductive';
  else if (ramp !== null && ramp < -1 && now.ctl < 0.85 * ctl90) word = 'Detraining';
  else if (form >= 5 && form <= 20 && now.ctl >= 0.9 * ctl90) word = 'Peaking';
  else if (ramp !== null && ramp < 0) word = 'Recovery';
  else if (ramp !== null && ramp >= 3 && rising !== false) word = 'Productive';
  else word = 'Maintaining';
  if (!chips.length) chips.push([`Form ${Math.round(form)}`, false], [`Ramp ${ramp === null ? '–' : (ramp >= 0 ? '+' : '') + r1(ramp)}/wk`, false]);
  perf.forEach((c) => chips.push([c, true]));
  if (!have) chips.push(['Performance: not enough data', false]);
  else if (rising && word === 'Productive') chips.push(['Fitness rising', false]);
  else if (ramp !== null && ramp >= 3 && rising === false && !perf.length) chips.push(['Load up, fitness flat', false]);
  sym.forEach((c) => chips.push([c, true]));
  if (!perf.length && !sym.length && word !== 'No status' && have) chips.push(['No performance drops', false], ['No strain signs', false]);
  return { word, chips, perf, sym };
}

// Percent of this week's plan done so far (Monday to `day`), or null with no plan.
export function weekPct(all: PmcPoint[], day: string) {
  const mon = addDays(day, -((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7));
  let a = 0, p = 0;
  all.forEach((x) => { if (x.day >= mon && x.day <= day) { a += x.actual || 0; p += x.planned || 0; } });
  return p ? Math.round((a / p) * 100) : null;
}

// Merges stored intervals.icu wellness with the person's check-ins (the check-in wins), as the server does.
export function mergeDays(wellness: { day: string; [k: string]: unknown }[], checkins: { day: string; [k: string]: unknown }[]): Days {
  const days: Days = {};
  for (const w of wellness) days[w.day] = { hrv: w.hrv, restingHR: w.resting_hr, sleepSecs: w.sleep_secs, sleepQuality: w.sleep_quality, fatigue: w.fatigue, soreness: w.soreness, stress: w.stress, mood: w.mood };
  for (const c of checkins) {
    const d = days[c.day] || (days[c.day] = {});
    for (const [k, col] of [['sleepQuality', 'sleep_quality'], ['fatigue', 'fatigue'], ['soreness', 'soreness'], ['stress', 'stress'], ['mood', 'mood']]) if (c[col] != null) d[k] = c[col];
    if (c.sick) d.sick = c.sick;
  }
  return days;
}
