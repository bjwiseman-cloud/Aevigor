// Weekly targets (Ben 2026-11-24, was "Daily plan"): on the Home > Weekly tab. Weeks run Monday to Sunday (not a
// rolling 7 days): this week, last week, and every earlier week by scrolling. A star for each day you trained as the plan and your status asked,
// including rest days and Go easy days. Shown with a short line on why it matters. Never punishing: a day off plan
// just says "fresh start", and days with no data are left out (missing data never counts as a miss).
import { useMemo, useState } from 'react';
import { mondayOf } from '@/components/WeekCards';
import { shortDate } from '@/lib/plan';
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

const BACK = 120;   // days of history: this week plus about 16 earlier weeks
export function usePlanWeek(monday: string) {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const load = useDailyLoad(p), hist = useStatusHistory(p, BACK);
  return useMemo(() => {
    const rows = load.data ?? [];
    // Any plan at all lately? Without a plan nothing can be judged, so the card stays hidden.
    const anyPlan = rows.some((r) => r.planned > 0 && r.day >= addDays(today, -BACK));
    const days: (DayPlan & { future: boolean })[] = [];
    for (let k = 0; k < 7; k++) {
      const day = addDays(monday, k), future = day >= today;   // today is still going, so it is judged tomorrow
      const rs = rows.filter((r) => r.day === day), st = (hist.data ?? []).find((h) => h.day === day)?.status ?? null;
      const actual = rs.reduce((s, r) => s + (r.actual ?? 0), 0), planned = rs.reduce((s, r) => s + (r.planned ?? 0), 0);
      days.push({ day, future, status: st, actual, planned, followed: anyPlan && !future ? followed(st, actual, planned, st != null && st !== 'NO DATA') : null });
    }
    return { days, anyPlan, todayStatus: (hist.data ?? []).find((h) => h.day === today)?.status ?? null, loaded: !load.isLoading && !hist.isLoading, today };
  }, [load.data, hist.data, today, monday, load.isLoading, hist.isLoading]);
}

const L = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export function PlanRewardCard() {
  const p = useProfile().data!;
  const thisMon = mondayOf(todayIn(p.time_zone));
  const [back, setBack] = useState(0);   // weeks back: 0 this week, 1 last week, 2+ earlier
  const [past, setPast] = useState(false);
  const mon = addDays(thisMon, -7 * back);
  const { days, anyPlan, todayStatus, loaded } = usePlanWeek(mon);
  const fun = useFun();
  if (!loaded || !anyPlan) return null;
  const judged = days.filter((d) => d.followed != null), stars = judged.filter((d) => d.followed).length;
  const y = [...judged].pop();
  const easy = y?.status === 'GO EASY' || y?.status === 'CAUTION';
  const when = back === 0 ? 'Yesterday' : 'That week';
  const why = !y ? null
    : back > 0 ? (stars === judged.length ? { icon: '🏆', head: 'Every day on target that week.', text: 'Consistent weeks like this are what build fitness.' }
      : { icon: stars >= judged.length / 2 ? '⭐' : '🌅', head: `${stars} of ${judged.length} days on target.`, text: 'Each week is a fresh start.' })
    : y.followed && easy ? { icon: '🌿', head: 'You took it easy when your body asked.', text: 'Easy days are when the hard work turns into fitness, and backing off on low days lowers the risk of getting sick or hurt.' }
    : y.followed && y.planned <= 0 ? { icon: '😴', head: 'Rest day done right.', text: 'Rest is part of the plan: it is when your body adapts.' }
    : y.followed ? { icon: '⭐', head: `${when} was right on target.`, text: 'Doing the plan as written, not more, is what makes the next hard day count.' }
    : { icon: '🌅', head: `${when} was off target. No problem.`, text: 'Today is a fresh start.' };
  const PAST = Array.from({ length: 15 }, (_, k) => k + 2);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="plan-reward">🎯 Weekly targets</CardTitle><p className="text-xs text-muted-foreground">{shortDate(mon)} to {shortDate(addDays(mon, 6))} · {judged.length ? `${stars} of ${judged.length} days on target` : back === 0 ? 'Stars show here as the week goes' : 'Nothing to judge that week'}</p></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {[['This week', 0], ['Last week', 1]].map(([l, k]) => (
            <button key={l} type="button" aria-pressed={!past && back === k} onClick={() => { setPast(false); setBack(k as number); }}
              className={cn('rounded-full border px-3 py-1 text-xs', !past && back === k ? 'border-transparent bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] font-semibold text-white' : 'bg-card')}>{l}</button>
          ))}
          <button type="button" aria-pressed={past} onClick={() => { setPast(true); if (back < 2) setBack(2); }}
            className={cn('rounded-full border px-3 py-1 text-xs', past ? 'border-transparent bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] font-semibold text-white' : 'bg-card')}>📅 Past weeks</button>
        </div>
        {past && (
          <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1" aria-label="Past weeks">
            {PAST.map((k) => (
              <button key={k} type="button" aria-pressed={back === k} onClick={() => setBack(k)}
                className={cn('shrink-0 snap-start rounded-lg border px-2.5 py-1 text-center text-xs font-semibold', back === k ? 'border-transparent bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] text-white' : 'bg-card')}>
                {shortDate(addDays(thisMon, -7 * k))}<span className="block text-[10px] font-normal opacity-75">{k} weeks ago</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={d.day} title={d.future ? 'Coming up' : d.followed == null ? 'No data' : d.followed ? 'On target' : 'Off target'} className={cn('flex flex-col items-center rounded-lg py-1.5 text-[10px] font-bold',
              d.followed ? 'bg-gradient-to-br from-amber-300 via-yellow-400 to-orange-400 text-amber-950 shadow-md' : d.future ? 'border border-dashed text-muted-foreground' : 'bg-muted text-muted-foreground', d.followed && fun.celebrations && 'animate-pop motion-reduce:animate-none')}>
              <span className="text-lg leading-none">{d.followed ? (d.status === 'GO EASY' ? '🌿' : '⭐') : d.followed === false ? '○' : '·'}</span>
              {L[i]}
            </div>
          ))}
        </div>
        {why && (
          <div className={cn('flex gap-3 rounded-xl p-3', y?.followed || back > 0 ? 'bg-gradient-to-br from-[#FF6B00]/15 to-[#FF2E63]/15' : 'bg-muted')}>
            <span className="text-3xl leading-none">{why.icon}</span>
            <div className="text-sm"><b className="block">{why.head}</b>{y?.followed && back === 0 && <span className="text-xs font-bold uppercase text-[#FF6B00]">Why it matters · </span>}<span className="text-muted-foreground">{why.text}</span></div>
          </div>
        )}
        {back === 0 && todayStatus === 'GO EASY' && <p className="text-xs font-semibold">Today says Go easy: keep it light for a 🌿 star.</p>}
      </CardContent>
    </Card>
  );
}
