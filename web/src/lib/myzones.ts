// Own thresholds and zones per sport. Each sport either follows intervals.icu Sport Settings (default) or uses
// the person's own numbers, saved in user_prefs. Own numbers can also be sent to intervals.icu.
import type { SportSettings } from '@/lib/types';
import type { Curve, PaceCurve } from '@/lib/perf';

export const MY_ZONES_KEY = 'my_zones';
export type OwnValues = {
  ftp: number | null; indoor_ftp: number | null; cp: number | null; w_prime: number | null; p_max: number | null;
  lthr: number | null; lt1_hr: number | null; max_hr: number | null; resting_hr: number | null;
  threshold_pace: number | null; vo2max: number | null; vo2_power: number | null; vo2_pace: number | null;
  power_zones: number[] | null; hr_zones: number[] | null; pace_zones: number[] | null;
};
export type OwnSport = { mode: 'intervals' | 'own'; v: Partial<OwnValues> };
export type MyZones = Record<string, OwnSport>;

export const OPEN = 999;
export const DEFAULT_POWER = [55, 75, 90, 105, 120, 150, OPEN];
export const DEFAULT_PACE = [77.5, 87.7, 94.3, 100, 103.4, 111.5, OPEN];
export function defaultHr(lthr: number | null | undefined, max: number | null | undefined) {
  if (!lthr) return null;
  const z = [0.81, 0.89, 0.93, 0.99, 1.02, 1.06].map((f) => Math.round(lthr * f));
  return [...z, max && max > z[z.length - 1] ? max : OPEN];
}

// The numbers the app uses for one sport: own values win where set, intervals.icu fills the rest
export function effective(icu: SportSettings | undefined, own: OwnSport | undefined, types: string[]): SportSettings & Partial<OwnValues> {
  const base: SportSettings = icu ?? { types, ftp: null, indoor_ftp: null, w_prime: null, p_max: null, lthr: null, max_hr: null, threshold_pace: null,
    pace_units: null, power_zones: null, power_zone_names: null, hr_zones: null, hr_zone_names: null, pace_zones: null, pace_zone_names: null };
  if (!own || own.mode !== 'own') return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, val] of Object.entries(own.v)) if (val !== null && val !== undefined && !(Array.isArray(val) && !val.length)) out[k] = val;
  if (own.v.power_zones?.length) out.power_zone_names = null;
  if (own.v.hr_zones?.length) out.hr_zone_names = null;
  if (own.v.pace_zones?.length) out.pace_zone_names = null;
  return out as SportSettings & Partial<OwnValues>;
}

// Best power at a duration across the stored ride curves (1 s = peak power, 300 s = 5-min power ≈ VO2max power)
export function bestWatts(curves: Curve[], secs: number) {
  let best: number | null = null;
  for (const c of curves) if (c.sport === 'ride') { const i = c.secs.indexOf(secs); if (i >= 0 && c.watts[i] && (best === null || c.watts[i] > best)) best = c.watts[i]; }
  return best;
}
// Best running speed held for about 5 minutes (≈ vVO2max), in m/s
export function bestSpeed5min(curves: PaceCurve[]) {
  let best: number | null = null;
  for (const c of curves) c.meters.forEach((m, i) => {
    const t = c.secs[i];
    if (t && t >= 240 && t <= 420) { const v = m / t; if (best === null || v > best) best = v; }
  });
  return best;
}

// Pace text <-> metres per second
export function parsePace(text: string, mile = false): number | null {
  const m = text.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const secs = Number(m[1]) * 60 + Number(m[2]);
  return secs ? (mile ? 1609.34 : 1000) / secs : null;
}
export function paceText(mps: number | null | undefined, mile = false) {
  if (!mps) return '';
  const secs = Math.round((mile ? 1609.34 : 1000) / mps);
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}
