import { Link } from 'react-router-dom';
import { IcuConnectButton } from '@/components/IcuConnect';
import { useLatestStatus, useProfile, useTodayCheckin } from '@/hooks/data';
import { STATUS, type Dot } from '@/lib/status';
import { LastWeekCard, WeeklyCheckCard } from '@/components/WeekCards';
import { fmt, niceDay, todayIn } from '@/lib/time';
import type { Profile, Signals } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpButton } from '@/components/Help';
import { cn } from '@/lib/utils';
import { HOME_TABS, SubTabs } from '@/screens/Layout';
import { CycleCard } from '@/components/Cycle';
import { RangeBar, RangeKey, scale, type Range } from '@/components/RangeBar';
import { Arrange } from '@/components/Arrange';
import { PlanRewardCard } from '@/components/PlanReward';
import { GoalsCard } from '@/components/Goals';
import { ResultPromptCard } from '@/components/Results';

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
// Signals as colourful tiles (Ben 2026-11-23), coloured by how each signal reads today.
const SIG_LOOK: Record<string, { bg: string; word: string }> = {
  good: { bg: 'from-emerald-300 via-green-400 to-teal-500 text-emerald-950', word: 'in range' },
  warn: { bg: 'from-amber-300 via-yellow-400 to-orange-400 text-amber-950', word: 'watch' },
  bad: { bg: 'from-rose-400 via-pink-500 to-red-500 text-white', word: 'needs care' },
  none: { bg: 'from-slate-300 via-slate-400 to-zinc-400 text-slate-950', word: 'no data' }
};
const SIG_ICON: Record<string, string> = { Feel: '🙂', 'HRV 7-day': '💓', Sleep: '😴', 'Resting HR': '❤️', 'Load vs plan': '📊' };
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
        {/* Race Day: diagonal speed stripes across the status panel */}
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(115deg,transparent_0_22px,rgba(255,255,255,0.10)_22px_30px)]" />
        <span aria-hidden className={cn('pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-2xl animate-breathe motion-reduce:animate-none', h.glow)} />
        <span aria-hidden className={cn('pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full opacity-30 blur-2xl animate-breathe motion-reduce:animate-none [animation-delay:1.2s]', h.glow)} />
        <div className="absolute right-3 top-3 rounded-full bg-white/80 p-1 text-slate-700"><HelpButton topic="daily-status" /></div>
        <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/25 text-4xl shadow-inner ring-4 ring-white/30 animate-float motion-reduce:animate-none">{h.icon}</div>
        <div className="relative mt-3 font-display text-5xl font-extrabold uppercase italic leading-none tracking-wide drop-shadow-[0_0_18px_rgba(255,255,255,0.45)] animate-pop motion-reduce:animate-none">{st.head}</div>
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

// Home (Ben 2026-11-24): the centre tab is Home, with Daily (status, plan stars, goals, signals) and Weekly
// (weekly check, last week) sub-tabs.
export function Today({ part = 'daily' }: { part?: 'daily' | 'weekly' }) {
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
            <IcuConnectButton />
            <p className="text-sm text-muted-foreground">To add or remove intervals.icu later, go to <Link className="text-primary underline" to="/settings">Settings › intervals.icu</Link>.</p>
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
    // A fill bar (Ben 2026-11-23): how much of the last 7 days' planned load is done. The scale runs to 150% of plan,
    // with marks at the plan (100%) and at the alert line (120%).
    const pct = Math.round((100 * r.load.act) / r.load.plan), w = (v: number) => `${Math.min(100, (v / 150) * 100)}%`;
    lines.push({ k: 'Load vs plan', range: null, sub: 'last 7 days', dot: r.load.alert ? 'bad' : 'good',
      v: <>
        <span className="font-display text-2xl font-extrabold italic">{pct}%</span> <span>{r.load.act} of {r.load.plan} planned</span>
        <span className="relative mt-2 block h-4 overflow-hidden rounded-full bg-card/90">
          <span className={cn('absolute inset-y-0 left-0 rounded-full bg-gradient-to-r transition-all duration-700', r.load.alert ? 'from-orange-400 to-red-600' : 'from-sky-400 via-emerald-400 to-green-600')} style={{ width: w(pct) }} />
          <span className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: w(100) }} title="Plan" />
          <span className="absolute inset-y-0 w-0.5 bg-red-600/70" style={{ left: w(120) }} title="Alert line" />
        </span>
        <span className="relative mt-0.5 block h-3 text-[10px] font-normal"><span className="absolute -translate-x-1/2" style={{ left: w(100) }}>plan</span><span className="absolute -translate-x-1/2" style={{ left: w(120) }}>+20%</span></span>
      </> });
  }

  return (
    <div className="space-y-4">
      <SubTabs tabs={HOME_TABS} />
      <p className="text-center text-sm text-muted-foreground">
        {niceDay(r.day)}{r.day !== day && <> · <b className="text-status-caution">latest available</b></>}
      </p>

      <ResultPromptCard />
      {part === 'weekly' ? <Arrange page="home-weekly" cards={[
        { id: 'weekly', label: 'Weekly check', node: <WeeklyCheckCard r={r} /> },
        { id: 'lastweek', label: 'Last week', node: <LastWeekCard /> }
      ]} /> : <Arrange page="home-daily" cards={[
        { id: 'status', label: 'Daily status', node: <StatusCard code={r.status} reasons={r.reasons} /> },
        { id: 'plan', label: 'Daily plan stars', node: <PlanRewardCard /> },
        { id: 'goals', label: 'Goals', node: <GoalsCard /> },
        { id: 'signals', label: 'Signals', node: (
      <Card>
        <CardHeader className="pb-2"><CardTitle help="signals"><span className="font-display text-xl font-extrabold italic tracking-wide">📡 Signals</span></CardTitle></CardHeader>
        <CardContent className="space-y-2.5">
          {lines.map((l, i) => { const look = SIG_LOOK[l.dot]; return (
            <div key={l.k} style={{ animationDelay: `${i * 70}ms` }} className={cn('relative overflow-hidden rounded-xl bg-gradient-to-br p-3 shadow-md animate-pop motion-reduce:animate-none', look.bg)}>
              <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.3)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden" />
              <div className="relative flex items-center gap-3">
                <span className="text-2xl leading-none animate-float motion-reduce:animate-none" style={{ animationDelay: `${i * 230}ms` }}>{SIG_ICON[l.k] ?? '•'}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{l.k} · {look.word}</div>
                  {l.range ? <div className="font-display text-2xl font-extrabold italic leading-tight">{l.range.label}</div> : <div className="text-base font-bold leading-tight [&_span]:font-normal [&_span]:text-inherit [&_span]:opacity-80">{l.v}</div>}
                </div>
                {l.sub && <span className="max-w-[45%] text-right text-[11px] opacity-90">{l.sub}</span>}
              </div>
              {l.range && <div className="relative mt-2 rounded-lg bg-card/90 px-2 pb-2 pt-0.5 text-foreground"><RangeBar r={l.range} /></div>}
            </div>
          ); })}
          <RangeKey />
        </CardContent>
      </Card>
        ) },
        { id: 'cycle', label: 'Cycle (if turned on)', node: <CycleCard /> }
      ]} />}

      {!checkin.data && !checkin.isLoading && (
        <Button asChild className="w-full"><Link to="/checkin">Do today&apos;s check-in</Link></Button>
      )}
      <SyncLine profile={profile} />
      <p className="text-center text-sm text-muted-foreground">Training guidance, not medical advice.</p>
    </div>
  );
}
