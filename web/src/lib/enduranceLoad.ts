// Endurance muscle load (Ben 2026-11-23). An ESTIMATE of how a ride's or run's load spreads over the leg muscles,
// so it can sit on the body map next to lifting volume. Every number here is written out on the public Learn page
// (topic "muscle-load"); keep the two in step. General wellness view only: no injury prediction, no diagnosis.
import { addDays } from '@rules';
import { isRide, isRun, n, type Activity } from './perf';
import type { MuscleKey } from './muscles';

export type Band = 'easy' | 'hard' | 'max';
type Share = Partial<Record<MuscleKey, number>>;

// Share of each band's load per muscle, in % (research write-up 2026-11-23, from EMG and modelling studies:
// Dorel 2012, Hug & Dorel 2009, Dorn 2012). Hip flexors have no area of their own on the figure, so their share
// is shown on the quads (rectus femoris is both a quad and a hip flexor). Running shins go to the calves area.
export const SHARES: Record<'ride' | 'run', Record<'easy' | 'max', Share>> = {
  ride: {
    easy: { quads: 40 + 8, glutes: 20, hamstrings: 12, calves: 15, shins: 5 },
    max: { quads: 25 + 15, glutes: 22, hamstrings: 22, calves: 10, shins: 6 }
  },
  run: {
    easy: { quads: 25 + 10, glutes: 20, hamstrings: 10, calves: 35 },
    max: { quads: 15 + 20, glutes: 20, hamstrings: 25, calves: 20 }
  }
};
/** Hard band (Z3-Z4) = the average of Easy and Max. */
export function share(sport: 'ride' | 'run', band: Band): Share {
  if (band !== 'hard') return SHARES[sport][band];
  const e = SHARES[sport].easy, m = SHARES[sport].max, out: Share = {};
  for (const k of new Set([...Object.keys(e), ...Object.keys(m)]) as Set<MuscleKey>) out[k] = ((e[k] ?? 0) + (m[k] ?? 0)) / 2;
  return out;
}
export const LEG_MUSCLES: MuscleKey[] = ['quads', 'glutes', 'hamstrings', 'calves', 'shins'];

/** Running is harder on muscles than cycling at the same load (Nieman 2014: more CK, myoglobin and soreness). */
export const RUN_FACTOR = 1.5;
/** Time in each band counts by how hard it is: Easy 1, Hard 2, Max 3. */
export const BAND_WEIGHT: Record<Band, number> = { easy: 1, hard: 2, max: 3 };
/** Without a Load from intervals.icu: session RPE × minutes ÷ 6 (an hour at RPE 6 ≈ 60, near a steady hour's TSS). */
export const RPE_DIVISOR = 6;

/** Seconds in Easy (Z1-2), Hard (Z3-4) and Max (Z5 and up), from power zones, else pace, else heart rate. */
export function bands(a: Activity): Record<Band, number> | null {
  for (const key of ['zt_power', 'zt_pace', 'zt_hr']) {
    const raw = a.raw[key];
    if (typeof raw !== 'string' || !raw) continue;
    const z = raw.split(',').map(Number);
    if (!z.some((x) => x > 0)) continue;
    const sum = (from: number, to: number) => z.slice(from, to).reduce((t, x) => t + (x || 0), 0);
    return { easy: sum(0, 2), hard: sum(2, 4), max: sum(4, z.length) };
  }
  return null;
}

/** Session load: intervals.icu Load (TSS), else session RPE × minutes ÷ 6. Null when neither is known. */
export function sessionLoad(a: Activity) {
  if (a.load) return a.load;
  const rpe = n(a, 'icu_rpe'), min = (a.moving_time ?? 0) / 60;
  return rpe && min ? (rpe * min) / RPE_DIVISOR : null;
}

/** One ride or run → estimated load per leg muscle (arbitrary units on the TSS scale). */
export function muscleLoad(a: Activity): Share | null {
  const sport = isRide(a) ? 'ride' : isRun(a) ? 'run' : null;
  const L = sessionLoad(a);
  if (!sport || !L) return null;
  const t = bands(a) ?? { easy: 1, hard: 0, max: 0 }; // no zone data: treat as easy
  const w = (Object.keys(t) as Band[]).reduce((s, b) => s + t[b] * BAND_WEIGHT[b], 0) || 1;
  const out: Share = {};
  for (const b of Object.keys(t) as Band[]) {
    const f = (t[b] * BAND_WEIGHT[b]) / w, sh = share(sport, b);
    for (const [k, pct] of Object.entries(sh) as [MuscleKey, number][]) out[k] = (out[k] ?? 0) + L * (sport === 'run' ? RUN_FACTOR : 1) * f * (pct / 100);
  }
  return out;
}

/** Sum of muscle load over a date range. */
export function rangeLoad(acts: Activity[], from: string, to: string, keep: (a: Activity) => boolean = () => true) {
  const out: Share = {};
  for (const a of acts) {
    if (a.day < from || a.day > to || !keep(a)) continue;
    const m = muscleLoad(a);
    if (m) for (const [k, v] of Object.entries(m) as [MuscleKey, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export const isLift = (a: Activity) => /weight|strength/i.test(a.type);
/** A hard set's share of a lifting session when no session load is known: 5 (about RPE 7 × 60 min ÷ 6 = 70 for 14 hard sets). */
export const LOAD_PER_SET = 5;
/**
 * Lifting load per muscle on the same scale as rides and runs, for the Combined view. The week's lifting session load
 * (intervals.icu Load, else session RPE × minutes ÷ 6) is split over the muscles by their share of the week's hard sets.
 * Sets logged with no lifting session load count as LOAD_PER_SET each.
 */
export function liftLoad(acts: Activity[], hard: Partial<Record<MuscleKey, number>>, from: string, to: string) {
  const sets = Object.values(hard).reduce((t, x) => t + (x ?? 0), 0);
  if (!sets) return {} as Share;
  let total = 0;
  for (const a of acts) if (a.day >= from && a.day <= to && isLift(a)) total += sessionLoad(a) ?? 0;
  if (!total) total = sets * LOAD_PER_SET;
  const out: Share = {};
  for (const [k, n] of Object.entries(hard) as [MuscleKey, number][]) if (n) out[k] = (total * n) / sets;
  return out;
}
/** Adds two per-muscle loads. */
export function addLoads(a: Share, b: Share) {
  const out: Share = { ...a };
  for (const [k, v] of Object.entries(b) as [MuscleKey, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

/** This week against your usual week (the 4 weeks before it, averaged): 100 = a usual week. */
export function percentOfUsual<T extends string>(week: Partial<Record<T, number>>, before4: Partial<Record<T, number>>, keys: T[]) {
  const out: Partial<Record<T, number>> = {};
  for (const k of keys) {
    const usual = (before4[k] ?? 0) / 4;
    if (usual > 0) out[k] = Math.round(((week[k] ?? 0) / usual) * 100);
    else if ((week[k] ?? 0) > 0) out[k] = 200; // new this week: shown as well above usual
  }
  return out;
}
/** Colour level for a % of usual: 1 well below (<50), 2 below (50-89), 3 usual (90-110), 4 above (111-150), 5 well above (>150). */
export function pctLevel(p: number | undefined) {
  if (p == null) return 0; // 0% (usual load, nothing yet this week) shows as well below
  return p < 50 ? 1 : p < 90 ? 2 : p <= 110 ? 3 : p <= 150 ? 4 : 5;
}
export const weeks = (mon: string) => ({ from: mon, to: addDays(mon, 6), before: addDays(mon, -28), beforeTo: addDays(mon, -1) });
