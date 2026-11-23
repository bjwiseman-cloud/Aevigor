// Test cards (Ben 2026-11-23): each test as a series of results, so a card can show the latest next to the best
// of all time, the last 3 months or this month. Everything comes from rides and runs already synced.
import { addDays } from '@rules';
import { isRide, isRun, n, type Activity, type TestResult } from './perf';

export type Pt = { day: string; value: number; id: string | null; note?: string };
export type Better = 'high' | 'low' | 'zero';
export type Series = { id: string; pts: Pt[]; better: Better };

const sat = (day: string) => new Date(day + 'T12:00:00Z').getUTCDay() === 6;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Planned tests on the calendar (VO2, FTP) from testResults. */
export function fromTests(results: TestResult[], re: RegExp): Pt[] {
  return results.filter((r) => re.test(r.kind)).map((r) => ({ day: r.day, value: r.value, id: r.activityId })).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Durability: Saturday rides with at least 1500 kJ before the final 5-min max (so 1600 kJ or more in all).
 * Drop = how far that 5-min sits below your fresh best 5-min of the 90 days before. Rides where the end effort
 * was skipped (more than 25% down, e.g. deload weeks) are left out. Planned durability tests count too.
 */
export function durability(acts: Activity[], results: TestResult[]): Pt[] {
  const rides = acts.filter((a) => isRide(a) && a.best?.[300]);
  const planned = new Set(results.filter((r) => /durab/i.test(r.kind)).map((r) => r.activityId));
  const out: Pt[] = [];
  for (const a of rides) {
    const kj = (n(a, 'icu_joules') ?? 0) / 1000;
    if (!planned.has(a.id) && !(sat(a.day) && kj >= 1600)) continue;
    const fresh = Math.max(0, ...rides.filter((x) => x.id !== a.id && x.day < a.day && x.day >= addDays(a.day, -90) && (n(x, 'icu_joules') ?? 0) / 1000 < 1600).map((x) => x.best![300]));
    if (!fresh) continue;
    const drop = ((fresh - a.best![300]) / fresh) * 100;
    if (drop > 25) continue;
    out.push({ day: a.day, value: Math.round(Math.max(0, drop) * 10) / 10, id: a.id, note: `${a.best![300]} W vs ${fresh} W fresh · ${Math.round(kj)} kJ` });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/** Steady Zone 2 rides of 60 min or more (intensity 55-78%), for EF and decoupling. */
const steady = (a: Activity) => isRide(a) && (a.moving_time ?? 0) >= 3600 && (() => { const i = n(a, 'icu_intensity'); return i == null || (i >= 55 && i <= 78); })();
export function rideEf(acts: Activity[]): Pt[] {
  return acts.filter((a) => steady(a) && n(a, 'icu_efficiency_factor')).map((a) => ({ day: a.day, value: r2(n(a, 'icu_efficiency_factor')!), id: a.id })).sort((a, b) => a.day.localeCompare(b.day));
}
export function rideDecoupling(acts: Activity[]): Pt[] {
  return acts.filter((a) => steady(a) && n(a, 'decoupling') != null).map((a) => ({ day: a.day, value: Math.round(n(a, 'decoupling')! * 10) / 10, id: a.id })).sort((a, b) => a.day.localeCompare(b.day));
}
export function sprint(acts: Activity[]): Pt[] {
  return acts.filter((a) => isRide(a) && a.best?.[5]).map((a) => ({ day: a.day, value: a.best![5], id: a.id })).sort((a, b) => a.day.localeCompare(b.day));
}

/** Easy runs of 45 min or more: EF = speed (m/min) ÷ HR, and decoupling. */
const easyRun = (a: Activity) => isRun(a) && (a.moving_time ?? 0) >= 2700 && !!n(a, 'average_heartrate', 'icu_average_hr');
export function runEf(acts: Activity[]): Pt[] {
  return acts.filter(easyRun).map((a) => {
    const hr = n(a, 'average_heartrate', 'icu_average_hr')!, spd = n(a, 'gap', 'icu_gap', 'average_speed') ?? (a.distance && a.moving_time ? a.distance / a.moving_time : null);
    return spd ? ({ day: a.day, value: r2((spd * 60) / hr), id: a.id } as Pt) : null;
  }).filter((x): x is Pt => !!x).sort((a, b) => a.day.localeCompare(b.day));
}
export function runDecoupling(acts: Activity[]): Pt[] {
  return acts.filter((a) => easyRun(a) && n(a, 'decoupling') != null).map((a) => ({ day: a.day, value: Math.round(n(a, 'decoupling')! * 10) / 10, id: a.id })).sort((a, b) => a.day.localeCompare(b.day));
}

/** Best of a list: highest, lowest, or closest to zero (decoupling). */
export function bestOf(pts: Pt[], better: Better): Pt | null {
  if (!pts.length) return null;
  const score = (p: Pt) => (better === 'high' ? -p.value : better === 'low' ? p.value : Math.abs(p.value));
  return pts.reduce((m, p) => (score(p) < score(m) || (score(p) === score(m) && p.day > m.day) ? p : m));
}
export type Span = 'all' | '90' | '30';
export const SPANS: { id: Span; label: string }[] = [{ id: 'all', label: 'Best of all time' }, { id: '90', label: 'Best of the last 3 months' }, { id: '30', label: 'Best of this month' }];
export function inSpan(pts: Pt[], span: Span, today: string) {
  return span === 'all' ? pts : pts.filter((p) => p.day >= (span === '30' ? today.slice(0, 8) + '01' : addDays(today, -90)));
}
