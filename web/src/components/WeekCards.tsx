// Today's weekly cards (Ben 2026-11-23).
// Weekly check: from Monday, all week. Week of the block, key sessions, tests / deload coming, appointments and what
// to monitor (sleep, HRV, resting HR, Feel, load), with TRAINING and RECOVERY advice only. Never medical advice,
// diagnosis or doses. Items already passed this week drop off.
// Last week: Monday to Sunday of the week before: new bests, load vs plan and other compliance, test results.
import { useMemo, type ReactNode } from 'react';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shortDay } from '@/components/charts';
import { useCalendar, useCheckins, useDailyLoad, usePlannedTests, useProfile, useSessionLogs, useWellness } from '@/hooks/data';
import { usePlanData } from '@/hooks/plan';
import { useActivities } from '@/hooks/perf';
import { testResults } from '@/lib/perf';
import { EVENT_KINDS, occursOn } from '@/lib/plan';
import { todayIn } from '@/lib/time';
import { WEEKLY } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { DailyStatus } from '@/lib/types';
import { AchievementTile, useAchievements } from '@/components/Achievements';

const DAY = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const mondayOf = (d: string) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
const dow = (d: string) => DAY[(new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7];
const SPORT: Record<string, string> = { ride: 'Ride', run: 'Run', WeightTraining: 'Lifting', Workout: 'Workout', Swim: 'Swim', Badminton: 'Badminton' };
const sportName = (k: string) => SPORT[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2');
const r1 = (v: number) => Math.round(v * 10) / 10;

// Week of the 5-week block, worked out from the tests in the intervals.icu calendar
// (VO2 test in week 3, FTP test in week 5, deload in week 4). Null when the pattern is not there.
export function blockWeek(tests: { day: string; kind: string }[], mon: string): number | null {
  let best: { k: number; wk: number } | null = null;
  for (let k = -4; k <= 4; k++) {
    const a = addDays(mon, 7 * k), b = addDays(a, 6);
    for (const t of tests) {
      if (t.day < a || t.day > b) continue;
      const wk = /^vo2/i.test(t.kind) ? 3 - k : /^ftp/i.test(t.kind) ? 5 - k : null;
      if (wk != null && wk >= 1 && wk <= 5 && (!best || Math.abs(k) < Math.abs(best.k))) best = { k, wk };
    }
  }
  return best?.wk ?? null;
}
const BLOCK: Record<number, string> = { 1: 'Build', 2: 'Build', 3: 'Build · VO2 test', 4: 'Deload', 5: 'Test week · FTP' };

function localDay(iso: string, tz: string) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso)); } catch { return iso.slice(0, 10); }
}

function Section({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-6 shrink-0 text-center text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="space-y-1 text-sm">{children}</div>
      </div>
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <span className="font-display text-xl font-extrabold italic tracking-wide">{children}</span>;
}

// What to change when the deload check flags (Bosquet 2007 taper meta-analysis; Pritchard 2015 for lifting)
function changes(weekly: string, test: { day: string; kind: string } | undefined, today: string): string[] {
  const near = (d: number) => test && test.day <= addDays(today, d);
  if (weekly === 'WATCH') return ['Avoid two hard days in a row. Keep the next hard session, but stop early if it feels much harder than usual.', 'Check again tomorrow morning; one more low day turns this into a deload.'];
  if (weekly === 'DELOAD') return [
    'Cut this week\'s training volume by 30-40%: shorter rides and runs, keep one short quality session.',
    'Lifting: keep the weights, do about half the sets, and stop each set with 3 or more reps in reserve.',
    near(7) ? `Move your ${test!.kind} (${shortDay(test!.day)}) back about a week, so you test fresh.` : 'If a test is planned in the next week, move it back a week.'
  ];
  if (weekly === 'DELOAD - STRONG') return [
    'Take 3-5 easy days: rest, or only easy zone 1-2 sessions under an hour.',
    'Lifting: skip heavy lifts; light technique work only.',
    near(10) ? `Move your ${test!.kind} (${shortDay(test!.day)}) until after these easy days.` : 'Move any test planned in the next 10 days.'
  ];
  return [];
}

export function WeeklyCheckCard({ r }: { r: DailyStatus | null }) {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone), mon = mondayOf(today), sun = addDays(mon, 6);
  const load = useDailyLoad(p), tests = usePlannedTests(p), cal = useCalendar(p), wellness = useWellness(p), checkins = useCheckins(p);
  const plan = usePlanData(p);

  const v = useMemo(() => {
    const t = tests.data ?? [];
    const wk = blockWeek(t, mon);
    // Key sessions: the remaining days with the most planned load, plus tests and races
    const byDay = new Map<string, { day: string; planned: number; sports: string[] }>();
    for (const x of load.data ?? []) {
      if (x.day < today || x.day > sun || !(x.planned > 0)) continue;
      const d = byDay.get(x.day) ?? { day: x.day, planned: 0, sports: [] };
      d.planned += x.planned; d.sports.push(sportName(x.sport)); byDay.set(x.day, d);
    }
    const key = [...byDay.values()].sort((a, b) => b.planned - a.planned).slice(0, 3).sort((a, b) => a.day.localeCompare(b.day));
    const weekTests = t.filter((x) => x.day >= today && x.day <= sun);
    const races = (cal.data ?? []).filter((c) => c.day >= today && c.day <= sun && /^Race|Event/.test(c.kind));
    const nextTest = t.find((x) => x.day >= today);
    const soonTest = t.find((x) => x.day > sun && x.day <= addDays(sun, 7));
    // Appointments this week from the Calendar tab (health log on)
    const appts: { day: string; title: string; icon: string; prep: string | null }[] = [];
    for (const e of plan.events.data ?? []) {
      const start = localDay(e.starts_at, p.time_zone), icon = EVENT_KINDS.find((k) => k.id === e.kind)?.icon ?? '📌';
      for (let d = today; d <= sun; d = addDays(d, 1)) {
        if (e.rrule ? occursOn(e.rrule, start, d) : d === start) appts.push({ day: d, title: e.title, icon, prep: e.prep_notes });
      }
    }
    appts.sort((a, b) => a.day.localeCompare(b.day));
    // Monitor: last 7 days of sleep, HRV, resting HR, Feel, check-ins and load
    const last7 = (wellness.data ?? []).filter((w) => w.day > addDays(today, -7) && w.day <= today);
    const sl = last7.map((w) => w.sleep_secs).filter((x): x is number => !!x).map((x) => x / 3600);
    const sleepAvg = sl.length >= 3 ? sl.reduce((a, b) => a + b, 0) / sl.length : null;
    const short = sl.filter((h) => h < 6).length;
    const ci = (checkins.data ?? []).filter((c) => c.day > addDays(today, -7) && c.day <= today).length;
    return { wk, key, weekTests, races, nextTest, soonTest, appts, sleepAvg, short, ci };
  }, [tests.data, load.data, cal.data, plan.events.data, wellness.data, checkins.data, today, mon, sun, p.time_zone]);

  const s = r?.signals;
  const hardDay = v.key[0] ? `${dow(v.key[0].day)}'s session` : 'your next hard session';
  const watch: string[] = [];
  if (v.sleepAvg != null && v.sleepAvg < 7) watch.push(`😴 Sleep averaged ${r1(v.sleepAvg)} h over the last 7 nights (target 7-9 h). Aim for an earlier night, especially before ${hardDay}.`);
  if (v.short >= 2) watch.push(`🌙 ${v.short} nights under 6 h this week. Keep hard work only if the warm-up feels normal.`);
  if (s?.hrv7 != null && s.hrvLow != null && s.hrv7 < s.hrvLow) watch.push('💓 Your 7-day HRV trend is below your normal. Keep easy days truly easy and skip extra sessions until it is back in range.');
  if (s?.rhr7 != null && s.rhrHigh != null && s.rhr7 > s.rhrHigh) watch.push('❤️ Resting heart rate is above your normal. If it stays up, swap the next hard session for an easy one.');
  if (s?.feel != null && s.feelNormal != null && s.feel < s.feelNormal - 1) watch.push('🙂 Feel is below your normal. Go by the warm-up, and add an extra rest day if it stays low.');
  if (r?.load?.alert) watch.push('📊 The last 7 days are more than 20% above plan. Stick to the plan rather than adding more.');
  if (v.ci < 4) watch.push(`📝 ${v.ci} check-in${v.ci === 1 ? '' : 's'} in the last 7 days. A daily morning check-in makes the status more accurate.`);
  const wkly = r ? WEEKLY[r.weekly] ?? WEEKLY.OK : null;
  const todo = r ? changes(r.weekly, v.nextTest, today) : [];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle help="weekly-check"><Title>📅 Weekly check</Title></CardTitle>
        <p className="text-xs text-muted-foreground">{shortDay(mon)} – {shortDay(sun)}{v.wk ? <> · <b className="text-foreground">Week {v.wk} of 5 · {BLOCK[v.wk]}</b></> : null}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section icon="🎯" title="Key sessions">
          {v.key.length ? v.key.map((k) => <p key={k.day}><b>{dow(k.day)}</b> · {[...new Set(k.sports)].join(' + ')} <span className="text-muted-foreground">· planned load {Math.round(k.planned)}</span></p>)
            : <p className="text-muted-foreground">Nothing planned for the rest of the week in intervals.icu.</p>}
          {v.races.map((c) => <p key={c.id}>🏁 <b>{dow(c.day)}</b> · {c.name}</p>)}
        </Section>

        {(v.weekTests.length > 0 || v.soonTest || v.wk === 3 || v.wk === 4) && (
          <Section icon="⏱" title="Tests and deload">
            {v.weekTests.map((t) => <p key={t.day + t.kind}><b>{t.kind}</b> on {dow(t.day)}. Arrive fresh: keep the day before easy and sleep well.</p>)}
            {v.wk === 4 && <p><b>Deload week.</b> Shorter, easier sessions and no hard Wednesday race, so you are fresh for next week's FTP test.</p>}
            {v.wk === 3 && <p>Deload week coming next week.</p>}
            {v.soonTest && !v.weekTests.length && <p>{v.soonTest.kind} next week ({shortDay(v.soonTest.day)}).</p>}
          </Section>
        )}

        {v.appts.length > 0 && (
          <Section icon="📌" title="Appointments">
            {v.appts.map((a, i) => <p key={i}>{a.icon} <b>{dow(a.day)}</b> · {a.title}{a.prep && <span className="block text-xs text-muted-foreground">Prep: {a.prep}</span>}</p>)}
          </Section>
        )}

        <Section icon="👀" title="Monitor this week">
          {wkly && r!.weekly !== 'OK' && <p><b className={wkly.cls.split(' ')[0]}>{wkly.icon} {r!.weekly}</b>{todo.length ? null : <> · {wkly.text}</>}</p>}
          {todo.length > 0 && <ul className="list-disc space-y-1 pl-5">{todo.map((c) => <li key={c}>{c}</li>)}</ul>}
          {watch.length ? watch.map((w) => <p key={w}>{w}</p>) : <p>✨ Sleep, HRV and resting heart rate all look normal. Keep it up.</p>}
        </Section>
        <p className="text-[11px] text-muted-foreground">Training and recovery guidance only, not medical advice.</p>
      </CardContent>
    </Card>
  );
}

export function LastWeekCard() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone), mon = addDays(mondayOf(today), -7), sun = addDays(mon, 6);
  const load = useDailyLoad(p), checkins = useCheckins(p), acts = useActivities(p), logs = useSessionLogs(p), tests = usePlannedTests(p);
  const ach = useAchievements();
  const v = useMemo(() => {
    const inWk = (d: string) => d >= mon && d <= sun;
    const rows = (load.data ?? []).filter((x) => inWk(x.day));
    const actual = Math.round(rows.reduce((s, x) => s + (x.actual ?? 0), 0)), planned = Math.round(rows.reduce((s, x) => s + (x.planned ?? 0), 0));
    const days = new Map<string, { a: number; p: number }>();
    rows.forEach((x) => { const d = days.get(x.day) ?? { a: 0, p: 0 }; d.a += x.actual ?? 0; d.p += x.planned ?? 0; days.set(x.day, d); });
    const planDays = [...days.values()].filter((d) => d.p > 0), doneDays = planDays.filter((d) => d.a > 0).length;
    const sessions = (acts.data ?? []).filter((a) => inWk(a.day));
    const secs = sessions.reduce((s, a) => s + (a.moving_time ?? 0), 0);
    const loggable = sessions.filter((a) => (a.moving_time ?? 0) >= 900);
    const logged = loggable.filter((a) => (logs.data ?? []).some((l) => l.activity_id === a.id)).length;
    const ci = (checkins.data ?? []).filter((c) => inWk(c.day)).length;
    const res = testResults(tests.data ?? [], acts.data ?? []).filter((t) => inWk(t.day));
    return { actual, planned, planDays: planDays.length, doneDays, sessions: sessions.length, secs, loggable: loggable.length, logged, ci, res };
  }, [load.data, checkins.data, acts.data, logs.data, tests.data, mon, sun]);
  const bests = ach.list.filter((a) => a.day && a.day >= mon && a.day <= sun);
  const pct = v.planned ? Math.round((v.actual / v.planned) * 100) : null;
  const pctCls = pct == null ? '' : Math.abs(pct - 100) <= 10 ? 'text-emerald-600 dark:text-emerald-400' : Math.abs(pct - 100) <= 20 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  const h = Math.floor(v.secs / 3600), m = Math.round((v.secs % 3600) / 60);
  const Stat = ({ label, value, sub, cls }: { label: string; value: ReactNode; sub?: string; cls?: string }) => (
    <div className="rounded-md border p-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-lg font-semibold leading-tight', cls)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle help="last-week"><Title>🗓️ Last week</Title></CardTitle>
        <p className="text-xs text-muted-foreground">{shortDay(mon)} – {shortDay(sun)}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Load vs plan" value={pct != null ? `${pct}%` : v.actual || '–'} sub={v.planned ? `${v.actual} of ${v.planned} planned` : 'nothing planned'} cls={pctCls} />
          <Stat label="Planned days done" value={v.planDays ? `${v.doneDays}/${v.planDays}` : '–'} sub={`${v.sessions} session${v.sessions === 1 ? '' : 's'} · ${h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`}`} />
          <Stat label="Check-ins" value={`${v.ci}/7`} sub="mornings" />
          <Stat label="Post Activity" value={v.loggable ? `${v.logged}/${v.loggable}` : '–'} sub="sessions logged" />
        </div>
        {v.res.length > 0 && (
          <Section icon="⏱" title="Test results">
            {v.res.map((t) => <p key={t.day + t.kind}><b>{t.kind}</b> · {dow(t.day)}: <b className="font-mono">{t.value} {t.unit}</b> <span className="text-muted-foreground">({t.label})</span></p>)}
          </Section>
        )}
        <div>
          <div className="mb-2 font-medium">🏆 New bests</div>
          {bests.length ? <div className="grid grid-cols-2 gap-2">{bests.map((a, i) => <AchievementTile key={a.id} a={a} today={ach.today} i={i} />)}</div>
            : <p className="text-sm text-muted-foreground">No new all-time bests last week. See them all under Trends › Performance.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
