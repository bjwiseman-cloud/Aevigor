// Achievements (Ben 2026-11-23): all-time bests across sports, each with the day it was set, so recent ones
// can carry a "New" badge and last week's can show on Today's "Last week" card. Pure functions, no fetching.
import { addDays } from '@rules';
import { bestEfforts, isRide, isRun, mmss, n, paceRows, type Activity, type Curve, type PaceCurve, type TestResult } from '@/lib/perf';
import { MAIN_LIFTS, fromKg, heaviest, mainLiftNames, type LiftSet, type Unit } from '@/lib/lifting';

export type Achievement = {
  id: string; icon: string; label: string; value: string; sub?: string;
  day: string | null; activityId?: string | null;
  tone: 'amber' | 'rose' | 'violet' | 'sky' | 'emerald' | 'orange' | 'fuchsia' | 'teal' | 'lime';
};

export const NEW_DAYS = 14;
export const isNew = (a: Achievement, today: string) => !!a.day && a.day >= addDays(today, -(NEW_DAYS - 1));

const km = (m: number) => `${(m / 1000).toFixed(m >= 100000 ? 0 : 1)} km`;
const hm = (s: number) => { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`; };

// Best power for one duration: the intervals.icu all-time curve when it is there, else the synced rides' own bests
function bestPower(secs: number, rides: Activity[], curves: Curve[]) {
  const c = curves.find((x) => x.sport === 'ride' && x.curve === 'all');
  const i = c ? c.secs.indexOf(secs) : -1;
  const fromRides = bestEfforts(rides, null).find((e) => e.secs === secs)?.rank[0];
  if (c && i >= 0 && c.watts[i] && (!fromRides || c.watts[i] >= fromRides.watts)) {
    const id = c.activity_ids?.[i] ?? null;
    return { watts: c.watts[i], id, day: rides.find((r) => r.id === id)?.day ?? fromRides?.day ?? null };
  }
  return fromRides ? { watts: fromRides.watts, id: fromRides.id, day: fromRides.day } : null;
}

function longest(list: Activity[], key: 'distance' | 'moving_time') {
  return list.reduce<Activity | null>((m, a) => ((a[key] ?? 0) > ((m?.[key] as number | null) ?? 0) ? a : m), null);
}

export function achievements(i: {
  acts: Activity[]; curves: Curve[]; paceCurves: PaceCurve[]; sets: LiftSet[]; tests: TestResult[]; unit: Unit; today: string;
}): Achievement[] {
  const out: Achievement[] = [];
  const rides = i.acts.filter(isRide), runs = i.acts.filter(isRun);

  // Power: sprint, 5-minute (the VO2 test effort) and 20-minute
  const p5 = bestPower(5, rides, i.curves), p300 = bestPower(300, rides, i.curves), p1200 = bestPower(1200, rides, i.curves);
  if (p300) out.push({ id: 'p300', icon: '🔥', label: 'Best 5-min power', value: `${p300.watts} W`, sub: 'VO2 effort', day: p300.day, activityId: p300.id, tone: 'rose' });
  if (p1200) out.push({ id: 'p1200', icon: '⚡', label: 'Best 20-min power', value: `${p1200.watts} W`, day: p1200.day, activityId: p1200.id, tone: 'amber' });
  if (p5) out.push({ id: 'p5', icon: '💥', label: 'Peak sprint (5 s)', value: `${p5.watts} W`, day: p5.day, activityId: p5.id, tone: 'orange' });

  // FTP: the highest FTP from a test (95% of 20 min) or intervals.icu eFTP, and the gain over the last 12 months
  const eftp = [...rides].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, v: n(r, 'icu_pm_ftp', 'icu_eftp'), id: r.id })).filter((x): x is { day: string; v: number; id: string } => !!x.v);
  const ftpTests = i.tests.filter((t) => /ftp/i.test(t.kind)).map((t) => ({ day: t.day, v: t.value, id: t.activityId }));
  const ftpAll = [...eftp, ...ftpTests].sort((a, b) => a.day.localeCompare(b.day));
  if (ftpAll.length) {
    const top = ftpAll.reduce((m, x) => (x.v > m.v ? x : m));
    const yearAgo = ftpAll.find((x) => x.day >= addDays(i.today, -365));
    const latest = ftpAll[ftpAll.length - 1];
    const gain = yearAgo && latest.day > yearAgo.day ? Math.round(latest.v - yearAgo.v) : null;
    out.push({ id: 'ftp', icon: '📈', label: 'Best FTP', value: `${Math.round(top.v)} W`, sub: gain != null ? `${gain >= 0 ? '+' : ''}${gain} W in 12 months` : undefined, day: top.day, activityId: top.id, tone: 'violet' });
  }

  // Best running pace: 5 km if there is one, else the longest standard distance run so far
  const rows = paceRows(i.paceCurves.find((c) => c.curve === 'all'));
  const pr = rows.find((r) => r.meters === 5000) ?? rows.filter((r) => r.meters >= 1000).at(-1) ?? rows.at(-1);
  if (pr) out.push({ id: 'pace', icon: '🏃', label: `Best ${pr.label} pace`, value: `${mmss(pr.paceSec)} /km`, sub: mmss(pr.secs), day: runs.find((r) => r.id === pr.activity)?.day ?? null, activityId: pr.activity, tone: 'sky' });

  // Longest ride and run, by distance and by time
  const lr = longest(rides, 'distance'), lrt = longest(rides, 'moving_time'), ln = longest(runs, 'distance'), lnt = longest(runs, 'moving_time');
  if (lr?.distance) out.push({ id: 'ride-km', icon: '🚴', label: 'Longest ride', value: km(lr.distance), sub: lr.name ?? undefined, day: lr.day, activityId: lr.id, tone: 'emerald' });
  if (lrt?.moving_time) out.push({ id: 'ride-time', icon: '⏱️', label: 'Longest ride time', value: hm(lrt.moving_time), sub: lrt.name ?? undefined, day: lrt.day, activityId: lrt.id, tone: 'teal' });
  if (ln?.distance) out.push({ id: 'run-km', icon: '👟', label: 'Longest run', value: km(ln.distance), sub: ln.name ?? undefined, day: ln.day, activityId: ln.id, tone: 'sky' });
  if (lnt?.moving_time) out.push({ id: 'run-time', icon: '⏳', label: 'Longest run time', value: hm(lnt.moving_time), sub: lnt.name ?? undefined, day: lnt.day, activityId: lnt.id, tone: 'lime' });

  // Heaviest actual lifts on the main three (not estimated)
  const top = heaviest(i.sets), main = mainLiftNames(i.sets);
  for (const m of MAIN_LIFTS) {
    const b = main[m.key] ? top.get(main[m.key]!) : undefined;
    if (b) out.push({ id: `lift-${m.key}`, icon: '🏋️', label: `Heaviest ${m.label.toLowerCase()}`, value: `${Math.round(fromKg(b.weight, i.unit) * 10) / 10} ${i.unit}`, sub: `${b.reps} rep${b.reps > 1 ? 's' : ''}`, day: b.day, tone: 'fuchsia' });
  }
  return out;
}
