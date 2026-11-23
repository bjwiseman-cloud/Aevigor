// Muscle load body map (Ben 2026-11-23): this week's estimated load per muscle from rides and runs (and lifting
// hard sets), each as % of your usual week. An estimate for a general wellness view; the Learn page shows every
// formula. Swipe the figure to turn it; tap a muscle for its numbers.
import { useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BodyFigure, figureSex } from '@/components/BodyMap';
import { FunTile } from '@/components/Fun';
import { useExercises } from '@/components/ExercisePicker';
import { Chip, Chips } from '@/components/chips';
import { shortDay } from '@/components/charts';
import { useProfile } from '@/hooks/data';
import { useActivities } from '@/hooks/perf';
import { useSets } from '@/hooks/lifting';
import { isRide, isRun, type Activity } from '@/lib/perf';
import { MUSCLES, muscleLabel, type MuscleKey } from '@/lib/muscles';
import { hardSets, weekStart } from '@/lib/volume';
import { LEG_MUSCLES, addLoads, liftLoad, pctLevel, percentOfUsual, rangeLoad, weeks } from '@/lib/enduranceLoad';
import type { ReactNode } from 'react';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

type View = 'endurance' | 'lifting' | 'combined';
// Cool (well below usual) to hot (well above usual)
export const PCT_COLORS = ['#3b82f6', '#5eead4', '#22c55e', '#f97316', '#e11d48'];
const PCT_LABELS = ['Well below', 'Below', 'Usual', 'Above', 'Well above'];

export function MuscleLoadCard({ sport, lifting }: { sport: 'ride' | 'run' | 'mix'; lifting: ReactNode }) {
  const p = useProfile().data!;
  const acts = useActivities(p), sets = useSets(), all = useExercises();
  const [view, setView] = useState<View>(sport === 'mix' ? 'combined' : 'endurance');
  const [back, setBack] = useState(0);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [cur, setCur] = useState<string | null>(null);
  const swipe = useRef<number | null>(null);
  const mon = addDays(weekStart(todayIn(p.time_zone)), -7 * back), w = weeks(mon);
  const keep = (a: Activity) => (sport === 'ride' ? isRide(a) : sport === 'run' ? isRun(a) : isRide(a) || isRun(a));
  const byName = useMemo(() => {
    const m = new Map((all ?? []).map((x) => [x.n.toLowerCase(), x]));
    for (const [k, v] of [['squat', 'back squat'], ['bench', 'bench press'], ['ohp', 'standing military press']]) if (m.get(v)) m.set(k, m.get(v)!);
    return m;
  }, [all]);
  const keys = MUSCLES.map((m) => m.k);
  const d = useMemo(() => {
    const list = acts.data ?? [], s = sets.data ?? [], look = (x: string) => byName.get(x.toLowerCase()) ?? null;
    const eWeek = rangeLoad(list, w.from, w.to, keep), eBefore = rangeLoad(list, w.before, w.beforeTo, keep);
    const lWeek = hardSets(s, look, w.from, w.to), lBefore = hardSets(s, look, w.before, w.beforeTo);
    const ePct = percentOfUsual(eWeek, eBefore, LEG_MUSCLES);
    // Combined: total load from every activity on one scale. Lifting session load is split over the muscles by
    // hard sets, then added to the ride and run load, and compared with the usual week.
    const lfWeek = liftLoad(list, lWeek, w.from, w.to), lfBefore = liftLoad(list, lBefore, w.before, w.beforeTo);
    const cWeek = addLoads(eWeek, lfWeek), cBefore = addLoads(eBefore, lfBefore);
    const cPct = percentOfUsual(cWeek, cBefore, keys);
    return { eWeek, eBefore, lWeek, lBefore, lfWeek, lfBefore, cWeek, cBefore, ePct, cPct };
  }, [acts.data, sets.data, byName, w.from, sport]); // eslint-disable-line react-hooks/exhaustive-deps
  const pct = view === 'endurance' ? d.ePct : d.cPct;
  const lvl = (k: string) => pctLevel(pct[k as MuscleKey]);
  const shown = keys.filter((k) => lvl(k) > 0), worked = keys.filter((k) => (pct[k] ?? 0) > 0);
  const above = shown.filter((k) => lvl(k) >= 4).length, usual = shown.filter((k) => lvl(k) === 3).length;
  const turn = () => setSide(side === 'front' ? 'back' : 'front');
  const ck = cur as MuscleKey | null;
  const chips = <Chips>{(['endurance', 'lifting', 'combined'] as View[]).map((v) => <Chip key={v} on={view === v} onClick={() => setView(v)}>{v === 'endurance' ? (sport === 'ride' ? '🚴 Rides' : sport === 'run' ? '🏃 Runs' : '🚴🏃 Endurance') : v === 'lifting' ? '🏋️ Lifting volume' : '✨ All activities'}</Chip>)}</Chips>;
  if (view === 'lifting') return <div className="space-y-3">{chips}{lifting}</div>;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="muscle-load">{view === 'combined' ? 'Total muscle load' : 'Muscle load'}</CardTitle>
        <p className="text-xs text-muted-foreground">{view === 'combined' ? 'Rides, runs and lifting together, this week' : 'This week'} against your usual week (the 4 weeks before = 100%). An estimate, not a measurement.</p></CardHeader>
      <CardContent className="space-y-3">
        {chips}
        <div className="flex items-center justify-between text-sm">
          <Button size="sm" variant="outline" onClick={() => setBack(Math.min(26, back + 1))} aria-label="Earlier week">‹</Button>
          <span>Week of {shortDay(w.from)}</span>
          <Button size="sm" variant="outline" disabled={!back} onClick={() => setBack(back - 1)} aria-label="Later week">›</Button>
        </div>
        <div className="mx-auto w-full max-w-[220px] touch-pan-y select-none"
          onPointerDown={(e) => { swipe.current = e.clientX; }}
          onPointerUp={(e) => { if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 40) { turn(); navigator.vibrate?.(8); } swipe.current = null; }}
          onPointerCancel={() => { swipe.current = null; }}>
          <div key={side} className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
            <BodyFigure sex={figureSex(p.sex)} side={side} selected={cur} fill={(k) => (lvl(k) ? PCT_COLORS[lvl(k) - 1] : undefined)} onMuscle={(k) => setCur(cur === k ? null : k)} />
          </div>
          <div className="mt-1 text-center text-[11px] text-muted-foreground"><button type="button" className="rounded px-1" aria-label="Turn the body" onClick={turn}>{side === 'front' ? 'Front' : 'Back'} · swipe to turn</button></div>
        </div>
        <div className="mx-auto max-w-xs space-y-1">
          <div className="h-2.5 rounded-full shadow-inner" style={{ background: `linear-gradient(90deg, ${PCT_COLORS.join(', ')})` }} />
          <div className="flex justify-between text-[10px] font-medium text-muted-foreground">{PCT_LABELS.map((l) => <span key={l}>{l}</span>)}</div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <FunTile tone="sky" icon="🦵" top="Muscles worked" big={worked.length} sub="this week" className="p-2" />
          <FunTile i={1} tone="emerald" icon="🎯" top="Usual" big={usual} sub="90-110% of usual" className="p-2" />
          <FunTile i={2} tone={above ? 'orange' : 'teal'} icon={above ? '🔥' : '🧊'} top="Above usual" big={above} sub="over 110%" className="p-2" />
        </div>
        {ck && (
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <b>{muscleLabel(ck)}</b>: {pct[ck] != null ? <><b>{pct[ck]}%</b> of a usual week</> : 'nothing this week or in the 4 weeks before'}
            {LEG_MUSCLES.includes(ck) && <div className="text-xs text-muted-foreground">Ride and run load {Math.round(d.eWeek[ck] ?? 0)} this week · usual {Math.round((d.eBefore[ck] ?? 0) / 4)} a week</div>}
            {view === 'combined' && <div className="text-xs text-muted-foreground">Lifting load {Math.round(d.lfWeek[ck] ?? 0)} this week ({d.lWeek[ck] ?? 0} hard sets) · usual {Math.round((d.lfBefore[ck] ?? 0) / 4)} a week</div>}
          </div>
        )}
        <p className={cn('text-[11px] text-muted-foreground')}>Rides and runs are spread over the leg muscles by how hard they were (easy, hard, max), using lab study averages.{view === 'combined' ? ' Lifting session load is spread by hard sets per muscle. Lifting volume against your landmarks is under Lifting volume.' : ''} Not measured strain, not injury risk, not medical advice. Tap ? for the full maths.</p>
      </CardContent>
    </Card>
  );
}
