// Achievements (Ben 2026-11-23): all-time bests across sports, each with the day it was set, so recent ones
// can carry a "New" badge and last week's can show on Today's "Last week" card. Pure functions, no fetching.
import { addDays } from '@rules';
import { bestEfforts, isRide, isRun, mmss, n, paceRows, type Activity, type Curve, type PaceCurve, type TestResult } from '@/lib/perf';
import { MAIN_LIFTS, fromKg, heaviest, mainLiftNames, type LiftSet, type Unit } from '@/lib/lifting';

export type Achievement = {
  id: string; icon: string; label: string; value: string; sub?: string;
  day: string | null; activityId?: string | null;
  prev?: string;   // the best before this one, for the celebration ("up 8 W on 304 W")
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

  // Power (Ben 2026-11-24): Peak Power (1 s, Pmax) next to the 30-s sprint, then 5-min (the VO2 test effort) and 20-min
  const p1 = bestPower(1, rides, i.curves), p30 = bestPower(30, rides, i.curves), p300 = bestPower(300, rides, i.curves), p1200 = bestPower(1200, rides, i.curves);
  // What the best was before the record day, so the celebration can say how much it went up
  const before = (secs: number, b: { watts: number; day: string | null } | null) => {
    if (!b?.day) return undefined;
    const old = Math.max(0, ...rides.filter((r) => r.day < b.day!).map((r) => r.best?.[secs] ?? 0));
    return old && old < b.watts ? `Up ${b.watts - old} W on your old best (${old} W)` : undefined;
  };
  if (p300) out.push({ id: 'p300', icon: '🔥', label: 'Best 5-min power', value: `${p300.watts} W`, sub: 'VO2 effort', day: p300.day, activityId: p300.id, prev: before(300, p300), tone: 'rose' });
  if (p1200) out.push({ id: 'p1200', icon: '⚡', label: 'Best 20-min power', value: `${p1200.watts} W`, day: p1200.day, activityId: p1200.id, prev: before(1200, p1200), tone: 'amber' });
  if (p1) out.push({ id: 'p1', icon: '🚀', label: 'Peak power (1 s)', value: `${p1.watts} W`, sub: 'Pmax', day: p1.day, activityId: p1.id, prev: before(1, p1), tone: 'fuchsia' });
  if (p30) out.push({ id: 'p30', icon: '💥', label: 'Peak sprint (30 s)', value: `${p30.watts} W`, day: p30.day, activityId: p30.id, prev: before(30, p30), tone: 'orange' });

  // FTP: the highest FTP from a test (95% of 20 min) or intervals.icu eFTP, and the gain over the last 12 months
  const eftp = [...rides].sort((a, b) => a.day.localeCompare(b.day)).map((r) => ({ day: r.day, v: n(r, 'icu_pm_ftp', 'icu_eftp'), id: r.id })).filter((x): x is { day: string; v: number; id: string } => !!x.v);
  const ftpTests = i.tests.filter((t) => /^ftp/i.test(t.kind)).map((t) => ({ day: t.day, v: t.value, id: t.activityId }));
  const ftpAll = [...eftp, ...ftpTests].sort((a, b) => a.day.localeCompare(b.day));
  if (ftpAll.length) {
    const top = ftpAll.reduce((m, x) => (x.v > m.v ? x : m));
    const yearAgo = ftpAll.find((x) => x.day >= addDays(i.today, -365));
    const latest = ftpAll[ftpAll.length - 1];
    const gain = yearAgo && latest.day > yearAgo.day ? Math.round(latest.v - yearAgo.v) : null;
    out.push({ id: 'ftp', icon: '📈', label: 'Best FTP', value: `${Math.round(top.v)} W`, sub: gain != null ? `${gain >= 0 ? '+' : ''}${gain} W in 12 months` : undefined, day: top.day, activityId: top.id, tone: 'violet' });
  }

  // Best running efforts (Ben 2026-11-24): 100 m to the marathon, from the all-time pace curve (any part of any run)
  const rows = paceRows(i.paceCurves.find((c) => c.curve === 'all'));
  for (const r of rows) {
    if (![100, 400, 800, 1000, 1609, 3000, 5000, 10000, 20000, 21097, 42195].includes(r.meters)) continue;
    out.push({ id: `run-${r.meters}`, icon: r.meters <= 800 ? '⚡' : r.meters >= 21097 ? '🏅' : '🏃', label: `Best ${r.label}`, value: mmss(r.secs), sub: `${mmss(r.paceSec)} /km`, day: runs.find((x) => x.id === r.activity)?.day ?? null, activityId: r.activity, tone: r.meters <= 800 ? 'rose' : r.meters <= 5000 ? 'sky' : 'teal' });
  }

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

// ---- Streaks: weeks in a row, Monday to Sunday. The current week only counts once it has an activity, so an
// unfinished week never breaks a streak.
export type Streak = { id: string; icon: string; label: string; now: number; best: number; tone: Achievement['tone']; sub: string };
const mondayOf = (d: string) => { const x = new Date(d + 'T12:00:00Z'); return addDays(d, -((x.getUTCDay() + 6) % 7)); };

function run(weeks: (boolean | null)[]) {
  // weeks: oldest -> newest (last = current week); null = skip
  let best = 0, cur = 0;
  for (const w of weeks) { if (w === null) continue; cur = w ? cur + 1 : 0; best = Math.max(best, cur); }
  // current streak counts back from the newest week; an unmet current week is ignored
  let now = 0; const list = weeks.filter((w) => w !== null) as boolean[];
  const last = weeks[weeks.length - 1];
  const upto = last === false ? list.length - 1 : list.length;
  for (let k = upto - 1; k >= 0 && list[k]; k--) now++;
  return { now, best };
}

export function streaks(i: { actDays: string[]; load?: { day: string; actual: number | null; planned: number }[]; today: string }): Streak[] {
  // Weekly streak only (Ben 2026-11-24): the plan-compliance streaks were removed. A week counts with at least one
  // activity. Beating your previous best is an achievement; a broken streak is never shown as a loss.
  const first = [...i.actDays].sort()[0];
  if (!first) return [];
  const mons: string[] = []; for (let m = mondayOf(first); m <= i.today; m = addDays(m, 7)) mons.push(m);
  const acts = new Set(i.actDays.map(mondayOf));
  const a = run(mons.map((m) => acts.has(m)));
  return [{ id: 'streak-act', icon: '🔥', label: 'Weekly streak', now: a.now, best: a.best, tone: 'orange', sub: 'weeks with at least 1 activity' }];
}

// ---- Firsts (Ben 2026-11-23): an achievement the first time you use each feature ----
export type First = { id: string; icon: string; label: string; day: string | null };
export const FIRSTS: { id: string; icon: string; label: string }[] = [
  { id: 'connect', icon: '🔗', label: 'Connected intervals.icu' },
  { id: 'checkin', icon: '🌅', label: 'First morning check-in' },
  { id: 'post', icon: '📨', label: 'First Post Activity' },
  { id: 'manual', icon: '✍️', label: 'First manual activity' },
  { id: 'lift', icon: '🏋️', label: 'First lifting log' },
  { id: 'import', icon: '📥', label: 'First import' },
  { id: 'reminder', icon: '⏰', label: 'First reminder set' },
  { id: 'push', icon: '📲', label: 'Phone alerts on' },
  { id: 'supplement', icon: '💊', label: 'First supplement logged' },
  { id: 'medication', icon: '🩺', label: 'First medication logged' },
  { id: 'meal', icon: '🥗', label: 'First meal logged' },
  { id: 'event', icon: '📅', label: 'First calendar item' },
  { id: 'record', icon: '📁', label: 'First health record' },
  { id: 'bp', icon: '🩸', label: 'First blood pressure' },
  { id: 'cycle', icon: '🌙', label: 'First cycle log' }
];
