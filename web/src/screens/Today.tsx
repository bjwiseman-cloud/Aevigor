import { Link } from 'react-router-dom';
import { useLatestStatus, useProfile, useTodayCheckin } from '@/hooks/data';
import { STATUS, DOT, type Dot } from '@/lib/status';
import { LastWeekCard, WeeklyCheckCard } from '@/components/WeekCards';
import { fmt, niceDay, todayIn } from '@/lib/time';
import type { Profile, Signals } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpButton } from '@/components/Help';
import { cn } from '@/lib/utils';
import { CycleCard } from '@/components/Cycle';
import { RangeBar, RangeKey, scale, type Range } from '@/components/RangeBar';
import { Arrange } from '@/components/Arrange';

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
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const feelR: Range | null = s.feel != null && s.feelNormal != null
    ? { ...scale(s.feelNormal - 1, 25, s.feel, 0.6, 5, 25), lo: r1(s.feelNormal - 1), hi: 25, value: s.feel, label: `${fmt(s.feel)}/25` } : null;
  const hrvR: Range | null = s.hrv7 != null && s.hrvLow != null && s.hrvHigh != null
    ? { ...scale(s.hrvLow, s.hrvHigh, s.hrv7, 0.6, 0), lo: r1(s.hrvLow), hi: r1(s.hrvHigh), value: s.hrv7, label: fmt(s.hrv7, ' ms') } : null;
  const sleepR: Range | null = s.sleepHours != null ? { ...scale(7, 9, s.sleepHours, 1.5, 0, 14), lo: 7, hi: 9, value: s.sleepHours, label: fmt(s.sleepHours, ' h') } : null;
  const rhrNow = s.restingHR ?? s.rhr7;
  const rhrLo = s.rhrNormal != null && s.rhrHigh != null ? s.rhrNormal - (s.rhrHigh - s.rhrNormal) : null;
  // Resting HR only has an upper limit in the rules (a raised 7-day average), so everything below it counts as normal
  const rhrScale = rhrNow != null && rhrLo != null && s.rhrHigh != null ? scale(rhrLo, s.rhrHigh, rhrNow, 1.5, 25) : null;
  const rhrR: Range | null = rhrScale && rhrNow != null && s.rhrHigh != null
    ? { ...rhrScale, lo: rhrScale.min, hi: r1(s.rhrHigh), value: rhrNow, label: fmt(rhrNow, ' bpm') } : null;
  return [
    { k: 'Feel', dot: feel, range: feelR, sub: s.feelNormal != null ? `normal ${fmt(s.feelNormal)}` : null, v: s.feel == null
      ? (checkedIn ? 'Not enough answers' : <Link className="text-primary underline" to="/checkin">Do your check-in</Link>)
      : <>{fmt(s.feel)}/25 <span className="text-muted-foreground">(normal {fmt(s.feelNormal)})</span></> },
    { k: 'HRV 7-day', dot: hrv, range: hrvR, sub: `normal ${fmt(s.hrvLow)}–${fmt(s.hrvHigh)}`, v: <>{fmt(s.hrv7, ' ms')} <span className="text-muted-foreground">(normal {fmt(s.hrvLow)}–{fmt(s.hrvHigh)})</span></> },
    { k: 'Sleep', dot: sleep, range: sleepR, sub: 'target 7–9 h', v: fmt(s.sleepHours, ' h') },
    { k: 'Resting HR', dot: rhr, range: rhrR, sub: `7-day ${fmt(s.rhr7)} · normal up to ${fmt(s.rhrHigh)}`, v: <>{fmt(s.restingHR, ' bpm')} <span className="text-muted-foreground">(7-day {fmt(s.rhr7)})</span></> }
  ];
}

// Livelier status look (Ben 2026-11-23): a colourful hero per status, the "why" under the status word,
// and Do / Avoid / Watch as coloured tiles. The status words themselves are unchanged.
const HERO: Record<string, { bg: string; icon: string; glow: string }> = {
  'GO': { bg: 'from-emerald-400 via-green-500 to-lime-500 text-white', icon: '⚡', glow: 'bg-lime-200' },
  'OK': { bg: 'from-emerald-400 via-green-500 to-lime-500 text-white', icon: '⚡', glow: 'bg-lime-200' },
  'CAUTION': { bg: 'from-amber-300 via-yellow-400 to-orange-400 text-amber-950', icon: '🧭', glow: 'bg-yellow-100' },
  'GO EASY': { bg: 'from-rose-500 via-red-500 to-orange-500 text-white', icon: '🌿', glow: 'bg-rose-200' },
  'NO DATA': { bg: 'from-slate-400 via-slate-500 to-zinc-500 text-white', icon: '⏳', glow: 'bg-slate-200' }
};
const DAW = [
  { k: 'do', label: 'Do', icon: '✅', cls: 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10', pill: 'bg-emerald-500' },
  { k: 'avoid', label: 'Avoid', icon: '⛔', cls: 'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-500/10', pill: 'bg-rose-500' },
  { k: 'watch', label: 'Watch', icon: '👀', cls: 'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10', pill: 'bg-amber-500' }
] as const;

function StatusCard({ code, reasons }: { code: string; reasons: string[] }) {
  const st = STATUS[code as keyof typeof STATUS] ?? STATUS['NO DATA'];
  const h = HERO[code] ?? HERO['NO DATA'];
  const why = reasons.length ? reasons : ['All signals normal'];
  return (
    <Card className="overflow-hidden border-0 shadow-lg">
      <div className={cn('relative overflow-hidden bg-gradient-to-br px-5 pb-5 pt-6 text-center', h.bg)}>
        <span aria-hidden className={cn('pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-2xl animate-breathe motion-reduce:animate-none', h.glow)} />
        <span aria-hidden className={cn('pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full opacity-30 blur-2xl animate-breathe motion-reduce:animate-none [animation-delay:1.2s]', h.glow)} />
        <div className="absolute right-3 top-3 rounded-full bg-white/80 p-1 text-slate-700"><HelpButton topic="daily-status" /></div>
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/25 text-4xl shadow-inner ring-4 ring-white/30 animate-float motion-reduce:animate-none">{h.icon}</div>
        <div className="relative mt-3 font-display text-4xl font-extrabold uppercase italic leading-none tracking-wide drop-shadow-sm animate-pop motion-reduce:animate-none">{st.head}</div>
        <div className="relative mt-3 flex flex-wrap justify-center gap-1.5">
          {why.map((x) => <span key={x} className="rounded-full bg-white/25 px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm">{x}</span>)}
        </div>
      </div>
      <CardContent className="space-y-2 pt-4">
        {DAW.map((d, i) => (
          <div key={d.k} style={{ animationDelay: `${120 + i * 90}ms` }} className={cn('flex items-start gap-3 rounded-xl border p-2.5 text-left animate-pop motion-reduce:animate-none', d.cls)}>
            <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm shadow', d.pill)}>{d.icon}</span>
            <div><div className="font-display text-sm font-extrabold uppercase tracking-widest">{d.label}</div><div className="text-sm leading-snug">{st[d.k]}</div></div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function Today() {
  const profile = useProfile().data!;
  const status = useLatestStatus(profile);
  const checkin = useTodayCheckin(profile);
  const day = todayIn(profile.time_zone);

  if (status.isLoading) return <p className="text-muted-foreground">Loading today…</p>;
  const r = status.data;
  if (!r) {
    return (
      <>
        <h1 className="mb-3 font-serif text-xl font-bold tracking-wide">Today</h1>
        <Card><CardContent className="space-y-2 pt-5">
          {profile.intervals_connected_at ? <>
            <p className="font-semibold">Not enough history yet.</p>
            <p className="text-sm text-muted-foreground">The status needs a couple of weeks of HRV or resting heart rate from intervals.icu to learn your normal. Keep wearing your watch overnight and doing the check-in; it fills in on its own.</p>
          </> : <>
            <p className="font-semibold">Connect intervals.icu to see your daily status.</p>
            <p className="text-sm text-muted-foreground">Today's status reads your watch's HRV, resting heart rate and sleep through intervals.icu. Everything else (check-ins, lifting, your log and records) works without it.</p>
            <p className="text-sm text-muted-foreground">You can connect it any time in <Link className="text-primary underline" to="/settings">Settings › intervals.icu</Link>.</p>
          </>}
        </CardContent></Card>
        <SyncLine profile={profile} />
      </>
    );
  }

  const s = r.signals;
  const lines = signalLines(s, !!checkin.data);
  if (s.sick) lines.push({ k: 'Sickness', range: null, sub: null, dot: s.sick === 'Yes' ? 'bad' : 'warn', v: s.sick === 'Yes' ? 'Below the neck' : 'Mild, above the neck' });
  if (r.load && r.load.plan > 0) {
    lines.push({ k: 'Load vs plan', range: null, sub: null, dot: r.load.alert ? 'bad' : 'good',
      v: <>{r.load.act} / {r.load.plan} <span className="text-muted-foreground">(last 7 days)</span></> });
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-muted-foreground">
        {niceDay(r.day)}{r.day !== day && <> · <b className="text-status-caution">latest available</b></>}
      </p>

      <Arrange page="today-v2" cards={[
        { id: 'status', label: 'Daily status', node: <StatusCard code={r.status} reasons={r.reasons} /> },
        { id: 'weekly', label: 'Weekly check', node: <WeeklyCheckCard r={r} /> },
        { id: 'lastweek', label: 'Last week', node: <LastWeekCard /> },
        { id: 'signals', label: 'Signals', node: (
      <Card>
        <CardHeader className="pb-2"><CardTitle help="signals"><span className="font-display text-xl font-extrabold italic tracking-wide">📡 Signals</span></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {lines.map((l) => (
            <div key={l.k}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex items-center gap-2 font-medium"><span className={cn('h-2.5 w-2.5 rounded-full', DOT[l.dot])} />{l.k}</span>
                {l.range ? <span className="text-right text-xs text-muted-foreground">{l.sub}</span> : <span className="text-right">{l.v}</span>}
              </div>
              {l.range && <RangeBar r={l.range} />}
            </div>
          ))}
          <RangeKey />
        </CardContent>
      </Card>
        ) },
        { id: 'cycle', label: 'Cycle (if turned on)', node: <CycleCard /> }
      ]} />

      {!checkin.data && !checkin.isLoading && (
        <Button asChild className="w-full"><Link to="/checkin">Do today&apos;s check-in</Link></Button>
      )}
      <SyncLine profile={profile} />
      <p className="text-center text-sm text-muted-foreground">Training guidance, not medical advice.</p>
    </div>
  );
}
