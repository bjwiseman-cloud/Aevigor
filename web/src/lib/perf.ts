// Performance maths for the Training › Performance and Sessions pages. Pure functions, no data fetching.
export type Activity = {
  id: string; day: string; start_local: string | null; type: string; name: string | null;
  moving_time: number | null; distance: number | null; load: number | null;
  raw: Record<string, number | string | boolean>; best: Record<string, number> | null;
};
export type Curve = { sport: string; curve: string; label: string | null; secs: number[]; watts: number[]; wkg: number[] | null; activity_ids: (string | null)[] | null };

export const BEST_SECS = [1, 5, 15, 30, 60, 180, 300, 480, 720, 1200, 1800, 3600, 5400, 7200, 10800];
export const MEDALS = ['🥇', '🥈', '🥉'];
export const isRide = (a: Activity) => /ride/i.test(a.type);
export const isRun = (a: Activity) => /run/i.test(a.type);
export const isRace = (a: Activity) => /race/i.test(a.name ?? '') || String(a.raw.sub_type ?? '').toUpperCase() === 'RACE';

export function n(a: Activity, ...keys: string[]): number | null {
  for (const k of keys) { const v = a.raw[k]; if (typeof v === 'number' && Number.isFinite(v)) return v; }
  return null;
}

export function secsLabel(s: number) {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${+(s / 3600).toFixed(1)} h`.replace('.0 h', ' h');
}

export function duration(sec: number | null) {
  if (sec == null) return '–';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function pace(mps: number | null) {
  if (!mps) return '–';
  return `${mmss(1000 / mps)} /km`;
}

// 75 -> "1:15", 3725 -> "1:02:05"
export function mmss(sec: number) {
  const t = Math.round(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Running pace curves ----------
export type PaceCurve = { curve: string; label: string | null; meters: number[]; secs: number[]; activity_ids: (string | null)[] | null; critical_speed: number | null; d_prime: number | null };
export const RUN_DIST: { m: number; label: string }[] = [
  { m: 400, label: '400 m' }, { m: 800, label: '800 m' }, { m: 1000, label: '1 km' }, { m: 1609, label: '1 mile' },
  { m: 3000, label: '3 km' }, { m: 5000, label: '5 km' }, { m: 10000, label: '10 km' }, { m: 15000, label: '15 km' },
  { m: 21097, label: 'Half' }, { m: 42195, label: 'Marathon' }
];

// Best time at each standard distance (within 0.5% of it), with pace in seconds per km.
export function paceRows(c: PaceCurve | undefined) {
  if (!c) return [];
  return RUN_DIST.map((d) => {
    const i = c.meters.findIndex((m) => Math.abs(Number(m) - d.m) <= d.m * 0.005);
    if (i < 0 || !c.secs[i]) return null;
    return { label: d.label, meters: d.m, secs: c.secs[i], paceSec: Math.round((c.secs[i] / d.m) * 1000), activity: c.activity_ids?.[i] ?? null };
  }).filter((r): r is NonNullable<typeof r> => !!r);
}

// Weight for W/kg: the weight intervals.icu stored on the ride, else the latest known
export function weightOf(a: Activity | undefined, fallback: number | null) { return (a && n(a, 'icu_weight', 'weight')) || fallback; }
export function latestWeight(acts: Activity[]) {
  for (const a of [...acts].sort((x, y) => y.day.localeCompare(x.day))) { const w = n(a, 'icu_weight', 'weight'); if (w) return w; }
  return null;
}

// Best efforts in a set of rides: for each duration the top three rides (one value per ride).
export type Effort = { secs: number; rank: { id: string; day: string; watts: number; wkg: number | null; name: string | null }[] };
export function bestEfforts(rides: Activity[], weight: number | null): Effort[] {
  return BEST_SECS.map((s) => ({
    secs: s,
    rank: rides.filter((r) => r.best?.[s]).map((r) => {
      const w = weightOf(r, weight);
      return { id: r.id, day: r.day, name: r.name, watts: r.best![s], wkg: w ? Math.round((r.best![s] / w) * 100) / 100 : null };
    }).sort((a, b) => b.watts - a.watts).slice(0, 3)
  })).filter((e) => e.rank.length);
}

export function curveFromEfforts(efforts: Effort[]) {
  return efforts.map((e) => ({ secs: e.secs, watts: e.rank[0].watts, wkg: e.rank[0].wkg }));
}

// Test results from planned test days (intervals.icu calendar) matched to the ride done that day.
export type TestResult = { day: string; kind: string; name: string | null; value: number; unit: string; label: string; activityId: string };
export function testResults(tests: { day: string; kind: string; name: string | null }[], acts: Activity[]): TestResult[] {
  const out: TestResult[] = [];
  for (const t of tests) {
    // Running tests (only when scheduled): the run's average pace, as seconds per km (lower is better)
    if (/^run/i.test(t.kind)) {
      const run = acts.filter((a) => a.day === t.day && isRun(a) && a.distance && a.moving_time).sort((a, b) => (b.moving_time ?? 0) - (a.moving_time ?? 0))[0];
      if (run) out.push({ ...t, value: Math.round((run.moving_time! / run.distance!) * 1000), unit: '/km', label: /vo2/i.test(t.kind) ? 'Average pace of the VO2 test run' : 'Average pace of the threshold test run', activityId: run.id });
      continue;
    }
    if (!/^(ftp|vo2|durab)/i.test(t.kind)) continue;
    const ride = acts.filter((a) => a.day === t.day && isRide(a) && a.best).sort((a, b) => (b.moving_time ?? 0) - (a.moving_time ?? 0))[0];
    if (!ride) continue;
    if (/ftp/i.test(t.kind) && ride.best![1200]) out.push({ ...t, value: Math.round(ride.best![1200] * 0.95), unit: 'W', label: 'FTP (95% of 20-min)', activityId: ride.id });
    else if (/vo2/i.test(t.kind) && ride.best![300]) out.push({ ...t, value: ride.best![300], unit: 'W', label: '5-min max power', activityId: ride.id });
    else if (/durab/i.test(t.kind) && ride.best![300]) out.push({ ...t, value: ride.best![300], unit: 'W', label: '5-min power after pre-load', activityId: ride.id });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}

// W′ balance, differential model (Skiba et al. 2015): drains above CP, refills below CP in proportion to what is spent.
export function wbal(watts: (number | null)[], cp: number, wPrime: number): number[] {
  let bal = wPrime; const out: number[] = [];
  for (const p0 of watts) {
    const p = p0 ?? 0;
    if (p > cp) bal -= p - cp;
    else bal += ((cp - p) * (wPrime - bal)) / wPrime;
    bal = Math.max(-wPrime, Math.min(wPrime, bal));
    out.push(bal);
  }
  return out;
}

export function workSplit(watts: (number | null)[], ftp: number) {
  let total = 0, above = 0;
  for (const p0 of watts) { const p = p0 ?? 0; total += p; if (p > ftp) above += p - ftp; }
  return { totalKj: total / 1000, aboveKj: above / 1000 };
}

// Rows for the Sessions compare table. Each returns a display string, or null when intervals.icu has no value.
type Metric = { label: string; get: (a: Activity) => string | null; ride?: boolean; run?: boolean };
const f0 = (v: number | null, u = '') => (v == null ? null : `${Math.round(v)}${u}`);
const f2 = (v: number | null, u = '') => (v == null ? null : `${v.toFixed(2)}${u}`);
export const METRICS: Metric[] = [
  { label: 'Moving time', get: (a) => (a.moving_time ? duration(a.moving_time) : null) },
  { label: 'Distance', get: (a) => (a.distance ? `${(a.distance / 1000).toFixed(1)} km` : null) },
  { label: 'Elevation', get: (a) => f0(n(a, 'total_elevation_gain'), ' m') },
  { label: 'Load (TSS)', get: (a) => f0(a.load) },
  { label: 'Avg power', get: (a) => f0(n(a, 'icu_average_watts', 'average_watts'), ' W') },
  { label: 'Normalized power', get: (a) => f0(n(a, 'icu_weighted_avg_watts', 'weighted_average_watts'), ' W') },
  { label: 'Intensity (IF)', get: (a) => { const v = n(a, 'icu_intensity'); return v == null ? null : (v > 3 ? v / 100 : v).toFixed(2); } },
  { label: 'Variability (VI)', get: (a) => f2(n(a, 'icu_variability_index')) },
  { label: 'Efficiency factor', get: (a) => f2(n(a, 'icu_efficiency_factor')) },
  { label: 'Decoupling', get: (a) => { const v = n(a, 'decoupling'); return v == null ? null : `${v.toFixed(1)}%`; } },
  { label: 'Work', get: (a) => { const v = n(a, 'icu_joules'); return v == null ? null : `${Math.round(v / 1000)} kJ`; } },
  { label: 'Work above FTP', get: (a) => { const v = n(a, 'icu_joules_above_ftp'); return v == null ? null : `${Math.round(v / 1000)} kJ`; } },
  { label: 'Calories', get: (a) => f0(n(a, 'calories')) },
  { label: 'FTP used', get: (a) => f0(n(a, 'icu_ftp'), ' W') },
  { label: 'eFTP', get: (a) => f0(n(a, 'icu_pm_ftp', 'icu_eftp'), ' W') },
  { label: 'W′', get: (a) => { const v = n(a, 'icu_pm_w_prime', 'icu_w_prime'); return v == null ? null : `${(v / 1000).toFixed(1)} kJ`; } },
  { label: 'Peak power (Pmax)', get: (a) => f0(n(a, 'icu_pm_p_max'), ' W') },
  { label: 'Avg heart rate', get: (a) => f0(n(a, 'average_heartrate'), ' bpm') },
  { label: 'Max heart rate', get: (a) => f0(n(a, 'max_heartrate'), ' bpm') },
  { label: 'Avg speed', get: (a) => { const v = n(a, 'average_speed'); return v == null ? null : `${(v * 3.6).toFixed(1)} km/h`; } },
  { label: 'Avg pace', get: (a) => (isRun(a) ? pace(n(a, 'average_speed')) : null) },
  { label: 'Grade-adjusted pace', get: (a) => (isRun(a) && n(a, 'gap') ? pace(n(a, 'gap')) : null) },
  { label: 'Avg cadence', get: (a) => f0(n(a, 'average_cadence'), isRun(a) ? ' spm' : ' rpm') },
  { label: 'RPE', get: (a) => f0(n(a, 'icu_rpe')) },
  { label: 'Feel', get: (a) => f0(n(a, 'feel')) },
  ...[5, 60, 300, 1200, 3600].map((s) => ({ label: `Best ${secsLabel(s)}`, get: (a: Activity) => (a.best?.[s] ? `${a.best[s]} W` : null) }))
];
