// Achievements card (Ben 2026-11-23): colourful, gently animated tiles of all-time bests, with a "New" badge on
// the ones set in the last two weeks. Tapping a tile with an activity opens it under Training › Activities.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shortDay } from '@/components/charts';
import { useDailyLoad, usePlannedTests, useProfile } from '@/hooks/data';
import { useActivities, useCurves, usePaceCurves } from '@/hooks/perf';
import { useSets, useUnit } from '@/hooks/lifting';
import { testResults } from '@/lib/perf';
import { achievements, isNew, streaks, FIRSTS, NEW_DAYS, type Achievement, type First, type Streak } from '@/lib/achievements';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

export const TONE: Record<Achievement['tone'], string> = {
  amber: 'from-amber-300 via-yellow-400 to-orange-400 text-amber-950',
  rose: 'from-rose-400 via-pink-500 to-red-500 text-white',
  violet: 'from-violet-400 via-purple-500 to-indigo-500 text-white',
  sky: 'from-sky-300 via-cyan-400 to-blue-500 text-sky-950',
  emerald: 'from-emerald-300 via-green-400 to-teal-500 text-emerald-950',
  orange: 'from-orange-300 via-orange-400 to-red-400 text-orange-950',
  fuchsia: 'from-fuchsia-400 via-pink-500 to-purple-500 text-white',
  teal: 'from-teal-300 via-teal-400 to-cyan-500 text-teal-950',
  lime: 'from-lime-300 via-lime-400 to-emerald-400 text-lime-950'
};

export function useAchievements() {
  const p = useProfile().data!;
  const acts = useActivities(p), curves = useCurves(p), pace = usePaceCurves(p), sets = useSets(), tests = usePlannedTests(p);
  const [unit] = useUnit();
  const today = todayIn(p.time_zone);
  const list = useMemo(() => achievements({
    acts: acts.data ?? [], curves: curves.data ?? [], paceCurves: pace.data ?? [], sets: sets.data ?? [],
    tests: testResults(tests.data ?? [], acts.data ?? []), unit, today
  }), [acts.data, curves.data, pace.data, sets.data, tests.data, unit, today]);
  return { list, today, loading: acts.isLoading || sets.isLoading };
}

export function AchievementTile({ a, today, i = 0, onOpen }: { a: Achievement; today: string; i?: number; onOpen?: (id: string) => void }) {
  const fresh = isNew(a, today);
  const Tag = a.activityId && onOpen ? 'button' : 'div';
  return (
    <Tag type={Tag === 'button' ? 'button' : undefined} onClick={a.activityId && onOpen ? () => onOpen(a.activityId!) : undefined}
      style={{ animationDelay: `${i * 70}ms` }}
      className={cn('relative overflow-hidden rounded-xl bg-gradient-to-br p-3 text-left shadow-md animate-pop motion-reduce:animate-none', TONE[a.tone], fresh && 'ring-2 ring-offset-2 ring-offset-card ring-yellow-300')}>
      {/* a soft light sweeping across the tile */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden" />
      {fresh && <span className="absolute right-2 top-2 rounded-full bg-white px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wider text-rose-600 shadow animate-pulse">New</span>}
      <div className="relative text-2xl leading-none animate-float motion-reduce:animate-none" style={{ animationDelay: `${i * 230}ms` }}>{a.icon}</div>
      <div className="relative mt-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90">{a.label}</div>
      <div className="relative font-display text-2xl font-extrabold italic leading-tight">{a.value}</div>
      <div className="relative truncate text-[11px] opacity-85">{[a.sub, a.day && shortDay(a.day)].filter(Boolean).join(' · ')}</div>
    </Tag>
  );
}

// The first day each feature was used: the oldest row of each table (own rows only, by RLS).
type Q = { table: string; col: string; filter?: (q: any) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const FIRST_Q: Record<string, Q> = {
  checkin: { table: 'checkins', col: 'day' },
  post: { table: 'session_logs', col: 'day' },
  manual: { table: 'lift_sets', col: 'day', filter: (q) => q.eq('source', 'manual') },
  lift: { table: 'lift_sets', col: 'day' },
  import: { table: 'lift_sets', col: 'day', filter: (q) => q.not('source', 'in', '(manual,session)') },
  push: { table: 'push_subscriptions', col: 'created_at' },
  supplement: { table: 'log_items', col: 'created_at', filter: (q) => q.eq('category', 'supplement') },
  medication: { table: 'log_items', col: 'created_at', filter: (q) => q.in('category', ['medication', 'hormone', 'peptide']) },
  meal: { table: 'log_items', col: 'created_at', filter: (q) => q.eq('category', 'meal') },
  event: { table: 'events', col: 'created_at' },
  record: { table: 'records', col: 'created_at' },
  bp: { table: 'bp_readings', col: 'taken_at' },
  cycle: { table: 'cycle_days', col: 'day' }
};
export function useFirsts() {
  const p = useProfile().data!;
  return useQuery({
    queryKey: ['firsts', p.user_id],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<First[]> => {
      const day = async (q: Q) => {
        try {
          let b = supabase.from(q.table).select(q.col).order(q.col, { ascending: true }).limit(1);
          if (q.filter) b = q.filter(b);
          const { data, error } = await b; if (error || !data?.length) return null;
          const v = String((data[0] as unknown as Record<string, string>)[q.col] ?? '').slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
        } catch { return null; }
      };
      const days: Record<string, string | null> = Object.fromEntries(await Promise.all(Object.entries(FIRST_Q).map(async ([k, q]) => [k, await day(q)] as const)));
      days.connect = p.intervals_connected_at ? p.intervals_connected_at.slice(0, 10) : null;
      try {
        const { data } = await supabase.from('notify_prefs').select('morning_email, morning_push, post_email, post_push, post_since').maybeSingle();
        days.reminder = data && (data.morning_email || data.morning_push || data.post_email || data.post_push) ? String(data.post_since).slice(0, 10) : null;
      } catch { days.reminder = null; }
      return FIRSTS.map((f) => ({ ...f, day: days[f.id] ?? null }));
    }
  });
}
export function useStreaks() {
  const p = useProfile().data!;
  const acts = useActivities(p), load = useDailyLoad(p);
  const today = todayIn(p.time_zone);
  return useMemo(() => streaks({ actDays: (acts.data ?? []).map((a) => a.day), load: load.data ?? [], today }), [acts.data, load.data, today]);
}

function StreakTile({ s, i }: { s: Streak; i: number }) {
  return (
    <div style={{ animationDelay: `${i * 70}ms` }} className={cn('relative overflow-hidden rounded-xl bg-gradient-to-br p-3 shadow-md animate-pop motion-reduce:animate-none', TONE[s.tone])}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden" />
      <div className={cn('relative text-2xl leading-none motion-reduce:animate-none', s.now > 0 ? 'animate-breathe' : 'grayscale')}>{s.icon}</div>
      <div className="relative mt-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90">{s.label}</div>
      <div className="relative font-display text-2xl font-extrabold italic leading-tight">{s.now} wk{s.now === 1 ? '' : 's'}</div>
      <div className="relative text-[11px] opacity-85">best {s.best} · {s.sub}</div>
    </div>
  );
}
function FirstBadge({ f, today }: { f: First; today: string }) {
  const got = !!f.day, fresh = got && f.day! >= addDays(today, -(NEW_DAYS - 1));
  return (
    <div title={got ? `${f.label} · ${shortDay(f.day!)}` : `${f.label} · not yet`} className={cn('relative flex flex-col items-center gap-1 rounded-xl p-2 text-center', got ? 'bg-gradient-to-br from-amber-200 via-yellow-300 to-orange-300 text-amber-950 shadow-md animate-pop motion-reduce:animate-none' : 'border border-dashed text-muted-foreground')}>
      {fresh && <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[9px] font-extrabold uppercase text-white shadow">New</span>}
      <span className={cn('text-xl leading-none', !got && 'opacity-40 grayscale')}>{got ? f.icon : '🔒'}</span>
      <span className="text-[10px] font-semibold leading-tight">{f.label.replace(/^First (\w)/, (_m, c: string) => c.toUpperCase())}</span>
      {got && <span className="text-[9px] opacity-80">{shortDay(f.day!)}</span>}
    </div>
  );
}

export function AchievementsCard() {
  const { list, today, loading } = useAchievements();
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/training/sessions?open=${encodeURIComponent(id)}`);
  const sorted = [...list].sort((a, b) => Number(isNew(b, today)) - Number(isNew(a, today)));
  const fresh = list.filter((a) => isNew(a, today)).length;
  const streak = useStreaks(), firsts = useFirsts();
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle help="achievements"><span className="font-display text-xl font-extrabold italic tracking-wide">🏆 Achievements</span></CardTitle>
        <p className="text-xs text-muted-foreground">Your all-time bests{fresh ? ` · ${fresh} new in the last ${NEW_DAYS} days` : ''}</p>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : list.length ? (
          <div className="grid grid-cols-2 gap-2.5">
            {sorted.map((a, i) => <AchievementTile key={a.id} a={a} today={today} i={i} onOpen={open} />)}
          </div>
        ) : <p className="text-sm text-muted-foreground">Your bests show here once rides, runs or lifts are synced or logged.</p>}
        {streak.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-sm font-semibold">🔥 Streaks</div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">{streak.map((x, i) => <StreakTile key={x.id} s={x} i={i} />)}</div>
          </div>
        )}
        {firsts.data && (
          <div className="mt-4">
            <div className="mb-2 flex items-baseline justify-between text-sm font-semibold"><span>🏅 Firsts</span><span className="text-xs font-normal text-muted-foreground">{firsts.data.filter((f) => f.day).length} of {firsts.data.length} unlocked</span></div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">{[...firsts.data].sort((a, b) => Number(!!b.day) - Number(!!a.day)).map((f) => <FirstBadge key={f.id} f={f} today={today} />)}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
