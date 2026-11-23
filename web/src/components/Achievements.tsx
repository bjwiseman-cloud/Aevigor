// Achievements card (Ben 2026-11-23): colourful, gently animated tiles of all-time bests, with a "New" badge on
// the ones set in the last two weeks. Tapping a tile with an activity opens it under Training › Activities.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { shortDay } from '@/components/charts';
import { usePlannedTests, useProfile } from '@/hooks/data';
import { useActivities, useCurves, usePaceCurves } from '@/hooks/perf';
import { useSets, useUnit } from '@/hooks/lifting';
import { testResults } from '@/lib/perf';
import { achievements, isNew, NEW_DAYS, type Achievement } from '@/lib/achievements';
import { todayIn } from '@/lib/time';
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

export function AchievementsCard() {
  const { list, today, loading } = useAchievements();
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/training/sessions?open=${encodeURIComponent(id)}`);
  const sorted = [...list].sort((a, b) => Number(isNew(b, today)) - Number(isNew(a, today)));
  const fresh = list.filter((a) => isNew(a, today)).length;
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
      </CardContent>
    </Card>
  );
}
