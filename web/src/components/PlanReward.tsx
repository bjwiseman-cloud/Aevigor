// Following the daily plan (Ben 2026-11-24): a star for each day you trained as the plan and your status asked,
// including rest days and Go easy days. Shown with a short line on why it matters. Never punishing: a day off plan
// just says "fresh start", and days with no data are left out (missing data never counts as a miss).
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDailyLoad, useProfile, useStatusHistory } from '@/hooks/data';
import { useFun } from '@/hooks/fun';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

export type DayPlan = { day: string; status: string | null; actual: number; planned: number; followed: boolean | null };

/** Did the day follow the plan? Go easy: kept it under 70% of plan (or light). Caution: not over plan.
 *  Otherwise within 80-120% of plan, or a rest day kept light. Null when there is nothing to judge. */
export function followed(status: string | null, actual: number, planned: number, hasData: boolean): boolean | null {
  if (!hasData) return null;
  const light = actual <= 30;
  if (status === 'GO EASY') return planned > 0 ? actual <= planned * 0.7 || light : light;
  if (status === 'CAUTION') return planned > 0 ? actual <= planned * 1.05 + 5 : light;
  if (planned <= 0) return light;
  return actual >= planned * 0.8 && actual <= planned * 1.2;
}

export function usePlanDays(n = 7) {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const load = useDailyLoad(p), hist = useStatusHistory(p);
  return useMemo(() => {
    const rows = load.data ?? [];
    // Plan data exists at all? Without any plan the reward cannot be judged, so it stays hidden.
    const anyPlan = rows.some((r) => r.planned > 0 && r.day >= addDays(today, -21) && r.day <= today);
    const out: DayPlan[] = [];
    for (let k = n; k >= 1; k--) {
      const day = addDays(today, -k);
      const rs = rows.filter((r) => r.day === day), st = (hist.data ?? []).find((h) => h.day === day)?.status ?? null;
      const actual = rs.reduce((s, r) => s + (r.actual ?? 0), 0), planned = rs.reduce((s, r) => s + (r.planned ?? 0), 0);
      out.push({ day, status: st, actual, planned, followed: anyPlan ? followed(st, actual, planned, st != null && st !== 'NO DATA') : null });
    }
    return { days: out, anyPlan, todayStatus: (hist.data ?? []).find((h) => h.day === today)?.status ?? null, loaded: !load.isLoading && !hist.isLoading };
  }, [load.data, hist.data, today, n, load.isLoading, hist.isLoading]);
}

const L = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export function PlanRewardCard() {
  const { days, anyPlan, todayStatus, loaded } = usePlanDays(7);
  const fun = useFun();
  if (!loaded || !anyPlan) return null;
  const judged = days.filter((d) => d.followed != null), stars = judged.filter((d) => d.followed).length;
  const y = days[days.length - 1];
  const easy = y.status === 'GO EASY' || y.status === 'CAUTION';
  const why = y.followed == null ? null
    : y.followed && easy ? { icon: '🌿', head: 'You took it easy when your body asked.', text: 'Easy days are when the hard work turns into fitness, and backing off on low days lowers the risk of getting sick or hurt.' }
    : y.followed && y.planned <= 0 ? { icon: '😴', head: 'Rest day done right.', text: 'Rest is part of the plan: it is when your body adapts.' }
    : y.followed ? { icon: '⭐', head: 'Yesterday was right on plan.', text: 'Doing the plan as written, not more, is what makes the next hard day count.' }
    : { icon: '🌅', head: 'Yesterday was off plan. No problem.', text: 'Today is a fresh start.' };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="plan-reward">⭐ Daily plan</CardTitle><p className="text-xs text-muted-foreground">{judged.length ? `${stars} of ${judged.length} days on plan, last 7 days` : 'Stars show here once days are on plan'}</p></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-7 gap-1">
          {days.map((d) => (
            <div key={d.day} title={d.followed == null ? 'No data' : d.followed ? 'On plan' : 'Off plan'} className={cn('flex flex-col items-center rounded-lg py-1.5 text-[10px] font-bold',
              d.followed ? 'bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-400 text-amber-950 shadow-md' : 'bg-muted text-muted-foreground', d.followed && fun.celebrations && 'animate-pop motion-reduce:animate-none')}>
              <span className="text-lg leading-none">{d.followed ? (d.status === 'GO EASY' ? '🌿' : '⭐') : d.followed === false ? '○' : '·'}</span>
              {L[new Date(d.day + 'T12:00:00Z').getUTCDay()]}
            </div>
          ))}
        </div>
        {why && (
          <div className={cn('flex gap-3 rounded-xl p-3', y.followed ? 'bg-gradient-to-br from-[#FF6B00]/15 to-[#FF2E63]/15' : 'bg-muted')}>
            <span className="text-3xl leading-none">{why.icon}</span>
            <div className="text-sm"><b className="block">{why.head}</b>{y.followed && <span className="text-xs font-bold uppercase text-[#FF6B00]">Why it matters · </span>}<span className="text-muted-foreground">{why.text}</span></div>
          </div>
        )}
        {todayStatus === 'GO EASY' && <p className="text-xs font-semibold">Today says Go easy: keep it light for a 🌿 star.</p>}
      </CardContent>
    </Card>
  );
}
