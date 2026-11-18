import { C } from '@/components/charts';
// Numbers behind the Load and Trends pages, worked out in the browser from the person's own rows.
// The Feel score and the rolling statistics come from the same rules file the server uses.
import { addDays, feelOf, stats } from '@rules';

// 'all', one sport key (ride, run, WeightTraining…), or a list of keys added up (Combined)
export type Sport = string | string[];
export type LoadRow = { day: string; sport: string; actual: number; planned: number; rpe: number | null; sessions: number };
export type WellnessRow = {
  day: string; hrv: number | null; resting_hr: number | null; sleep_secs: number | null;
  sleep_quality: number | null; fatigue: number | null; soreness: number | null; stress: number | null; mood: number | null;
};
export type CheckinRow = { day: string; sleep_quality: number | null; fatigue: number | null; soreness: number | null; stress: number | null; mood: number | null; sick: string | null };
export type TestRow = { day: string; kind: string; name: string | null };

const r1 = (v: number | null) => (v === null || !isFinite(v) ? null : Math.round(v * 10) / 10);

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- Fitness / Fatigue / Form (performance management chart) ----------
// Fitness (CTL) = 42-day weighted load, Fatigue (ATL) = 7-day, Form = yesterday's Fitness minus Fatigue,
// the same way intervals.icu shows it. Days after today use the planned load, so Form is projected.
export type PmcPoint = { day: string; actual: number | null; planned: number; ctl: number; atl: number; form: number; ramp: number | null; future: boolean };

export function pmc(rows: LoadRow[], sport: Sport, from: string, to: string, today: string): PmcPoint[] {
  const act: Record<string, number> = {}, plan: Record<string, number> = {};
  rows.forEach((r) => {
    if (Array.isArray(sport) ? !sport.includes(r.sport) : sport !== 'all' && r.sport !== sport) return;
    act[r.day] = (act[r.day] || 0) + r.actual;
    plan[r.day] = (plan[r.day] || 0) + r.planned;
  });
  const out: PmcPoint[] = [];
  let ctl = 0, atl = 0;
  for (const d of dayRange(from, to)) {
    const future = d > today;
    const form = ctl - atl;
    const load = future ? plan[d] || 0 : act[d] || 0;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    out.push({ day: d, actual: future ? null : act[d] || 0, planned: plan[d] || 0, ctl: r1(ctl)!, atl: r1(atl)!, form: r1(form)!, ramp: null, future });
  }
  out.forEach((p, i) => { p.ramp = i >= 7 ? r1(p.ctl - out[i - 7].ctl) : null; });
  return out;
}

// Form zones, matching intervals.icu
export const FORM_ZONES = [
  { name: 'High risk', from: -60, to: -30, get color() { return C.red; } },
  { name: 'Optimal', from: -30, to: -10, get color() { return C.green; } },
  { name: 'Grey zone', from: -10, to: 5, get color() { return C.grey; } },
  { name: 'Fresh', from: 5, to: 20, get color() { return C.cyan; } },
  { name: 'Transition', from: 20, to: 50, get color() { return C.yellow; } }
] as const;
export const TEST_READY = { from: 5, to: 15 };

export function formZone(form: number) {
  return FORM_ZONES.find((z) => form < z.to) ?? FORM_ZONES[FORM_ZONES.length - 1];
}

// Ramp rate: weekly change in Fitness. 3-7 a week is ideal; over 8 is too fast.
export const RAMP_ZONES = [
  { name: 'Losing fitness', from: -10, to: 0, get color() { return C.grey; } },
  { name: 'Slow', from: 0, to: 3, get color() { return C.cyan; } },
  { name: 'Ideal', from: 3, to: 7, get color() { return C.green; } },
  { name: 'High', from: 7, to: 8, get color() { return C.yellow; } },
  { name: 'Too fast', from: 8, to: 14, get color() { return C.red; } }
] as const;

export function rampZone(ramp: number) {
  return RAMP_ZONES.find((z) => ramp < z.to) ?? RAMP_ZONES[RAMP_ZONES.length - 1];
}

// Weekly actual vs planned load (weeks start Monday). Only weeks with a plan get a percentage.
export type WeekPoint = { week: string; actual: number; planned: number; pct: number | null };
export function weekly(points: PmcPoint[], today: string, weeks = 8): WeekPoint[] {
  const monday = (d: string) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
  const thisWeek = monday(today);
  const byWeek: Record<string, WeekPoint> = {};
  points.forEach((p) => {
    if (p.future) return;
    const w = monday(p.day);
    if (w < addDays(thisWeek, -7 * (weeks - 1))) return;
    const o = byWeek[w] || (byWeek[w] = { week: w, actual: 0, planned: 0, pct: null });
    o.actual += p.actual || 0;
    o.planned += p.planned;
  });
  return Object.values(byWeek).sort((a, b) => (a.week < b.week ? -1 : 1))
    .map((w) => ({ ...w, actual: Math.round(w.actual), planned: Math.round(w.planned), pct: w.planned > 0 ? Math.round((w.actual / w.planned) * 100) : null }));
}

// ---------- Trends ----------
export type TrendPoint = {
  day: string;
  feel: number | null; feel7: number | null; feelBand: [number, number] | null; sick: string | null;
  hrv: number | null; hrv7: number | null; hrvBand: [number, number] | null;
  sleep: number | null; sleep7: number | null;
  rhr: number | null; rhr7: number | null; rhrBand: [number, number] | null;
  rpe: number | null; rpe7: number | null;
  load: number; atl: number;
  prevRpe: number | null; prevLoad: number;
};

export function trends(wellness: WellnessRow[], checkins: CheckinRow[], load: LoadRow[], from: string, to: string): TrendPoint[] {
  const w: Record<string, WellnessRow> = {}, c: Record<string, CheckinRow> = {};
  wellness.forEach((x) => { w[x.day] = x; });
  checkins.forEach((x) => { c[x.day] = x; });
  const dayLoad: Record<string, { load: number; rpe: number | null }> = {};
  load.forEach((r) => {
    const o = dayLoad[r.day] || (dayLoad[r.day] = { load: 0, rpe: null });
    o.load += r.actual;
    if (r.rpe !== null && (o.rpe === null || r.rpe > o.rpe)) o.rpe = r.rpe;
  });

  // Work over a longer window so the 60-day normal is ready on the first day shown
  const start = addDays(from, -70);
  const days = dayRange(start, to);
  const feel: (number | null)[] = [], ln: (number | null)[] = [], rhr: (number | null)[] = [], sleep: (number | null)[] = [], rpe: (number | null)[] = [];
  let atl = 0;
  const atlByDay: number[] = [];
  days.forEach((d) => {
    const x = w[d], ci = c[d];
    const merged = {
      fatigue: ci?.fatigue ?? x?.fatigue, soreness: ci?.soreness ?? x?.soreness, sleepQuality: ci?.sleep_quality ?? x?.sleep_quality,
      stress: ci?.stress ?? x?.stress, mood: ci?.mood ?? x?.mood
    };
    feel.push(feelOf(merged).score);
    ln.push(x?.hrv && x.hrv > 0 ? Math.log(x.hrv) : null);
    rhr.push(x?.resting_hr ?? null);
    sleep.push(x?.sleep_secs ? x.sleep_secs / 3600 : null);
    rpe.push(dayLoad[d]?.rpe ?? null);
    atl += ((dayLoad[d]?.load || 0) - atl) / 7;
    atlByDay.push(atl);
  });

  const out: TrendPoint[] = [];
  days.forEach((d, k) => {
    if (d < from) return;
    const fs = stats(feel, k - 1, 28), fsd = fs.sd === null ? null : Math.max(fs.sd, 1.5);
    const l7 = stats(ln, k, 7).mean, lb = stats(ln, k, 60);
    const r7 = stats(rhr, k, 7).mean, rb = stats(rhr, k, 60);
    out.push({
      day: d,
      feel: r1(feel[k]), feel7: r1(stats(feel, k, 7).mean), sick: c[d]?.sick && c[d].sick !== 'No' ? c[d].sick : null,
      feelBand: fs.mean !== null && fsd !== null ? [r1(fs.mean - fsd)!, r1(fs.mean + fsd)!] : null,
      hrv: w[d]?.hrv ?? null, hrv7: l7 === null ? null : r1(Math.exp(l7)),
      hrvBand: lb.mean !== null && lb.sd !== null ? [r1(Math.exp(lb.mean - 0.5 * lb.sd))!, r1(Math.exp(lb.mean + lb.sd))!] : null,
      sleep: r1(sleep[k]), sleep7: r1(stats(sleep, k, 7).mean),
      rhr: rhr[k], rhr7: r1(r7),
      rhrBand: rb.mean !== null && rb.sd !== null ? [r1(rb.mean - 0.5 * rb.sd)!, r1(rb.mean + 0.5 * rb.sd)!] : null,
      rpe: rpe[k], rpe7: r1(stats(rpe, k, 7).mean),
      load: Math.round(dayLoad[d]?.load || 0), atl: r1(atlByDay[k])!,
      prevRpe: k > 0 ? rpe[k - 1] : null, prevLoad: Math.round(dayLoad[days[k - 1]]?.load || 0)
    });
  });
  return out;
}
