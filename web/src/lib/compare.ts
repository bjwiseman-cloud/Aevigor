// Compare view helpers (Ben 2026-11-23): Coggan power profile, Xert-style PP/HIE/TP and intervals.icu Strain Score.
import { n, type Activity } from './perf';

// ---- Coggan power profile (Allen & Coggan, Training and Racing with a Power Meter) ----
// The table runs from "untrained" (active non-cyclists) to "world class" in 40 equal steps (Coggan, quoted on
// bikeforums.net). Bottom anchors as printed by Life Fitness/Team ICG from the book; top anchors are the book's
// world-class row as widely reprinted. 8 categories of 5 steps each.
export const COGGAN_SECS = [5, 60, 300, 'ft'] as const;
export type CogganKey = (typeof COGGAN_SECS)[number];
export const COGGAN_LABEL: Record<string, string> = { 5: '5 s', 60: '1 min', 300: '5 min', ft: 'FT' };
const TABLE: Record<'male' | 'female', Record<string, [number, number]>> = {
  male: { 5: [10.08, 24.04], 60: [5.64, 11.5], 300: [2.33, 7.6], ft: [1.86, 6.4] },
  female: { 5: [8.43, 19.42], 60: [4.67, 9.29], 300: [1.88, 6.61], ft: [1.5, 5.69] }
};
export const CATEGORIES = ['Untrained', 'Fair', 'Moderate', 'Good', 'Very good', 'Excellent', 'Exceptional', 'World class'];
export const STEPS = 40;

/** Position on the Coggan table: 0 = untrained bottom, 40 = world class top (clamped). */
export function cogganStep(key: CogganKey | string, wkg: number, sex: string | null | undefined) {
  const [lo, hi] = TABLE[sex === 'female' ? 'female' : 'male'][String(key)];
  return Math.max(0, Math.min(STEPS, ((wkg - lo) / (hi - lo)) * STEPS));
}
export function category(step: number) { return CATEGORIES[Math.min(7, Math.floor(step / 5))]; }
/** W/kg at the bottom of each category, for the radar's rings and the help text. */
export function categoryFloor(key: CogganKey | string, cat: number, sex: string | null | undefined) {
  const [lo, hi] = TABLE[sex === 'female' ? 'female' : 'male'][String(key)];
  return Math.round((lo + ((hi - lo) * cat * 5) / STEPS) * 100) / 100;
}

/** Coggan's rider types from the profile's shape (steps for 5 s, 1 min, 5 min, FT). */
export function riderType(steps: number[]): { type: string; why: string } {
  const [s5, s60, s300, ft] = steps;
  const spread = Math.max(...steps) - Math.min(...steps);
  if (spread <= 4) return { type: 'All-rounder', why: 'Your 4 bars sit at about the same level, so there is no clear strong or weak point.' };
  const early = (s5 + s60) / 2, late = (s300 + ft) / 2, mid = (s60 + s300) / 2, ends = (s5 + ft) / 2;
  if (mid - ends > 4) return { type: 'Pursuiter', why: '1 min and 5 min stand out above sprint and threshold (an upside-down V).' };
  if (ends - mid > 4) return { type: 'Unusual V shape', why: 'Strong sprint and threshold but weaker 1 to 5 min. Coggan says this is rare, so check the data.' };
  if (early > late) return { type: 'Sprinter', why: 'Short efforts rank higher than long ones, most of all from 1 min to 5 min.' };
  return { type: 'Time trialist (climber type)', why: 'Long efforts rank higher than short ones. Power per kilo at threshold is what climbing needs too.' };
}

/** One session's Coggan profile, in W/kg. FT = 95% of its best 20 min, else its eFTP. */
export function cogganProfile(a: Activity, weight: number | null) {
  if (!weight || !a.best) return null;
  const ft20 = a.best[1200] ? a.best[1200] * 0.95 : null, eftp = n(a, 'icu_pm_ftp', 'icu_eftp');
  const watts: Record<string, number | null> = { 5: a.best[5] ?? null, 60: a.best[60] ?? null, 300: a.best[300] ?? null, ft: ft20 ?? eftp };
  if (Object.values(watts).some((v) => v == null)) return null;
  const wkg = Object.fromEntries(Object.entries(watts).map(([k, v]) => [k, Math.round((v! / weight) * 100) / 100]));
  return { wkg, ftFrom: ft20 ? '95% of best 20 min' : 'eFTP' };
}

// ---- Morton 3-parameter critical power model (Morton 1996), in Xert's words ----
// Ben 2026-11-23: PP = Pmax (1 s peak, Morton's third parameter), HIE = W′, TP = CP. All from intervals.icu's power
// model for the ride (icu_pm_*). If intervals.icu sends no CP, eFTP stands in and the card says so.
export function morton(a: Activity) {
  const pp = n(a, 'icu_pm_p_max') ?? a.best?.[1] ?? null, hie = n(a, 'icu_pm_w_prime', 'icu_w_prime');
  const cp = n(a, 'icu_pm_cp', 'icu_cp'), tp = cp ?? n(a, 'icu_pm_ftp', 'icu_eftp');
  return pp != null && hie != null && tp != null && pp > tp ? { pp, hie: hie / 1000, tp, tpFrom: cp != null ? 'CP' : 'eFTP', ppFrom: n(a, 'icu_pm_p_max') != null ? 'model' : 'best 1 s' } : null;
}
/** Morton 3P power for t seconds: P(t) = CP + W′ / (t + W′ / (Pmax − CP)). */
export function mortonPower(m: { pp: number; hie: number; tp: number }, t: number) {
  const w = m.hie * 1000;
  return m.tp + w / (t + w / (m.pp - m.tp));
}

// ---- intervals.icu Strain Score: total and 3 sub-strains (CP, W′, Pmax) ----
// Names on the intervals.icu forum: strain_score, ss_cp, ss_w_prime, ss_p_max. Read any spelling the API sends.
const pick = (a: Activity, re: RegExp) => { for (const [k, v] of Object.entries(a.raw)) if (re.test(k) && typeof v === 'number' && Number.isFinite(v)) return v; return null; };
export function strain(a: Activity) {
  const total = n(a, 'strain_score', 'icu_strain_score') ?? pick(a, /strain(_score)?(_total)?$/i);
  const cp = n(a, 'ss_cp', 'icu_ss_cp') ?? pick(a, /(^|_)(ss|strain)_?(score_)?cp$/i);
  const wp = n(a, 'ss_w_prime', 'icu_ss_w_prime') ?? pick(a, /(^|_)(ss|strain)_?(score_)?w_?prime$/i);
  const pm = n(a, 'ss_p_max', 'icu_ss_p_max') ?? pick(a, /(^|_)(ss|strain)_?(score_)?p_?max$/i);
  if (total == null && cp == null && wp == null && pm == null) return null;
  return { total: total ?? (cp ?? 0) + (wp ?? 0) + (pm ?? 0), cp, wp, pm };
}
