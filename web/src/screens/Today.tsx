import { Link } from 'react-router-dom';
import { useLatestStatus, usePlannedTests, useProfile, useTodayCheckin } from '@/hooks/data';
import { addDays } from '@rules';
import { shortDay } from '@/components/charts';
import { STATUS, WEEKLY, DOT, type Dot } from '@/lib/status';
import { fmt, niceDay, todayIn } from '@/lib/time';
import type { Profile, Signals } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpButton } from '@/components/Help';
import { cn } from '@/lib/utils';

export function SyncLine({ profile }: { profile: Profile }) {
  const t = profile.last_sync
    ? new Date(profile.last_sync).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never';
  return (
    <p className="mt-4 text-center text-sm text-muted-foreground">
      Last synced: {t}
      {profile.last_sync_error && <><br /><span className="text-status-warn">Last sync problem: {profile.last_sync_error}</span></>}
    </p>
  );
}

function signalLines(s: Signals, checkedIn: boolean) {
  const feel: Dot = s.feel == null ? 'none' : s.worst ? 'bad' : s.feelNormal != null && s.feel < s.feelNormal - 1 ? 'warn' : 'good';
  const hrv: Dot = s.hrv7 == null || s.hrvLow == null || s.hrvHigh == null ? 'none' : s.hrv7 < s.hrvLow || s.hrv7 > s.hrvHigh ? 'warn' : 'good';
  const sleep: Dot = s.sleepHours == null ? 'none' : s.sleepHours < 6 ? 'bad' : s.sleepHours < 7 ? 'warn' : 'good';
  const rhr: Dot = s.rhr7 == null || s.rhrHigh == null ? 'none' : s.rhr7 > s.rhrHigh ? 'warn' : 'good';
  return [
    { k: 'Feel', dot: feel, v: s.feel == null
      ? (checkedIn ? 'Not enough answers' : <Link className="text-primary underline" to="/checkin">Do your check-in</Link>)
      : <>{fmt(s.feel)}/25 <span className="text-muted-foreground">(normal {fmt(s.feelNormal)})</span></> },
    { k: 'HRV 7-day', dot: hrv, v: <>{fmt(s.hrv7, ' ms')} <span className="text-muted-foreground">(normal {fmt(s.hrvLow)}–{fmt(s.hrvHigh)})</span></> },
    { k: 'Sleep', dot: sleep, v: fmt(s.sleepHours, ' h') },
    { k: 'Resting HR', dot: rhr, v: <>{fmt(s.restingHR, ' bpm')} <span className="text-muted-foreground">(7-day {fmt(s.rhr7)})</span></> }
  ];
}

// What to change when the Weekly check flags (BUILD-LIST, Ben 2026-11-18): volume, lifting, the next test, sleep.
// Common deload practice: cut volume, keep some intensity (Bosquet 2007 taper meta-analysis; Pritchard 2015 for lifting).
function changes(weekly: string, test: { day: string; kind: string } | undefined, today: string): string[] {
  const near = (d: number) => test && test.day <= addDays(today, d);
  if (weekly === 'WATCH') return [
    'Avoid two hard days in a row. Keep the next hard session, but stop early if it feels much harder than usual.',
    'Aim for 8 hours in bed for the next 2 nights.',
    'Check again tomorrow morning; one more low day turns this into a deload.'
  ];
  if (weekly === 'DELOAD') return [
    'Cut this week\'s training volume by 30-40%: shorter rides and runs, keep one short quality session.',
    'Lifting: keep the weights, do about half the sets, and stop each set with 3 or more reps in reserve.',
    near(7) ? `Move your ${test!.kind} (${shortDay(test!.day)}) back about a week, so you test fresh.` : 'If a test is planned in the next week, move it back a week.',
    'Aim for 8+ hours of sleep and eat enough carbohydrate on training days.'
  ];
  if (weekly === 'DELOAD - STRONG') return [
    'Take 3-5 easy days: rest, or only easy zone 1-2 sessions under an hour.',
    'Lifting: skip heavy lifts; light technique work only.',
    near(10) ? `Move your ${test!.kind} (${shortDay(test!.day)}) until after these easy days.` : 'Move any test planned in the next 10 days.',
    'Extra sleep and good food. If you feel unwell, rest.'
  ];
  return [];
}

export function Today() {
  const profile = useProfile().data!;
  const status = useLatestStatus(profile);
  const checkin = useTodayCheckin(profile);
  const day = todayIn(profile.time_zone);
  const tests = usePlannedTests(profile);
  const nextTest = (tests.data ?? []).find((t) => t.day >= day);

  if (status.isLoading) return <p className="text-muted-foreground">Loading today…</p>;
  const r = status.data;
  if (!r) {
    return (
      <>
        <h1 className="mb-3 font-serif text-xl font-bold tracking-wide">Today</h1>
        <Card><CardContent className="space-y-2 pt-5">
          <p className="font-semibold">Not enough history yet.</p>
          <p className="text-sm text-muted-foreground">The status needs a couple of weeks of HRV or resting heart rate from intervals.icu to learn your normal. Keep wearing your watch overnight and doing the check-in; it fills in on its own.</p>
        </CardContent></Card>
        <SyncLine profile={profile} />
      </>
    );
  }

  const st = STATUS[r.status] ?? STATUS['NO DATA'];
  const wk = WEEKLY[r.weekly] ?? WEEKLY.OK;
  const s = r.signals;
  const lines = signalLines(s, !!checkin.data);
  if (s.sick) lines.push({ k: 'Sickness', dot: s.sick === 'Yes' ? 'bad' : 'warn', v: s.sick === 'Yes' ? 'Below the neck' : 'Mild, above the neck' });
  if (r.load && r.load.plan > 0) {
    lines.push({ k: 'Load vs plan', dot: r.load.alert ? 'bad' : 'good',
      v: <>{r.load.act} / {r.load.plan} <span className="text-muted-foreground">(last 7 days)</span></> });
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        {niceDay(r.day)}{r.day !== day && <> · <b className="text-status-caution">latest available</b></>}
      </p>

      <Card className={cn('relative border-2 text-center', st.cls.split(' ').filter((c) => c.startsWith('border-')).join(' '))}>
        <div className="absolute right-4 top-4"><HelpButton topic="daily-status" /></div>
        <CardContent className="pt-5">
          <div className="text-4xl leading-none">{st.icon}</div>
          <div className={cn('mt-2 font-serif text-2xl font-bold', st.cls.split(' ')[0])}>{st.head}</div>
          <p className="mt-3">{st.advice}</p>
          <dl className="mt-3 grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-left text-sm">
            <dt className="font-semibold text-muted-foreground">Do</dt><dd>{st.do}</dd>
            <dt className="font-semibold text-muted-foreground">Avoid</dt><dd>{st.avoid}</dd>
            <dt className="font-semibold text-muted-foreground">Watch</dt><dd>{st.watch}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle help="daily-status">Why</CardTitle></CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5">
            {(r.reasons.length ? r.reasons : ['All signals normal']).map((x) => <li key={x}>{x}</li>)}
          </ul>
        </CardContent>
      </Card>

      <Card className={wk.cls.split(' ')[1]}>
        <CardHeader className="pb-2"><CardTitle help="weekly-check">Weekly check</CardTitle></CardHeader>
        <CardContent>
          <p><b className={wk.cls.split(' ')[0]}>{wk.icon} {r.weekly}</b></p>
          <p className="mt-1 text-sm">{wk.text}</p>
          {r.weekly_why && <p className="mt-2 text-sm"><b>Why:</b> {r.weekly_why}.</p>}
          {changes(r.weekly, nextTest, day).length > 0 && (
            <div className="mt-2 text-sm"><b>What to change</b>
              <ul className="mt-1 list-disc space-y-1 pl-5">{changes(r.weekly, nextTest, day).map((c) => <li key={c}>{c}</li>)}</ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle help="signals">Signals</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {lines.map((l) => (
            <div key={l.k} className="flex justify-between gap-3 py-2.5">
              <span className="flex items-center gap-2"><span className={cn('h-2.5 w-2.5 rounded-full', DOT[l.dot])} />{l.k}</span>
              <span className="text-right">{l.v}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {!checkin.data && !checkin.isLoading && (
        <Button asChild className="w-full"><Link to="/checkin">Do today&apos;s check-in</Link></Button>
      )}
      <SyncLine profile={profile} />
      <p className="text-center text-sm text-muted-foreground">Training guidance, not medical advice.</p>
    </div>
  );
}
