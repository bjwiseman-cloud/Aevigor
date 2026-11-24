// Goals with progress bars (Ben 2026-11-24, engagement research: progress you can see, broken into small steps).
// Several goals at once: a race or event (weeks to go, plus "week 3 of 5" of the training block), FTP, VO2max, or a
// lift's estimated 1RM or 10RM (squat, bench and deadlift by default, any logged lift). Saved to the account.
// Missing data never counts against you: a goal with no data yet just says so.
import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Chip, Chips, Field } from '@/components/chips';
import { useCalendar, usePlannedTests, usePref, useProfile } from '@/hooks/data';
import { usePlanData } from '@/hooks/plan';
import { useActivities } from '@/hooks/perf';
import { useSets, useUnit } from '@/hooks/lifting';
import { isRide, latestWeight, n, type Activity } from '@/lib/perf';
import { e1rm, exercises, fromKg, mainLiftNames, MAIN_LIFTS, toKg, work, type LiftSet } from '@/lib/lifting';
import { vo2FromPower } from '@/screens/training/perfCards';
import { blockWeek, mondayOf } from '@/components/WeekCards';
import { shortDate } from '@/lib/plan';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

export type Goal = { id: string; kind: 'event' | 'ftp' | 'vo2' | 'lift'; title: string; day?: string; target?: number; start?: number | null; since: string; lift?: string; reps?: 1 | 10 };
const KINDS = [{ id: 'event', label: '🏁 Race or event' }, { id: 'ftp', label: '⚡ FTP' }, { id: 'vo2', label: '🫁 VO2max' }, { id: 'lift', label: '🏋️ Lift' }] as const;
const weeksBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / (7 * 864e5)));

export function useGoals() { return usePref<Goal[]>('goals', []); }

/** Today's value for a number goal, or null when there is no data. */
function useCurrent() {
  const p = useProfile().data!;
  const acts = useActivities(p), sets = useSets();
  const today = todayIn(p.time_zone);
  return useMemo(() => {
    const rides = (acts.data ?? []).filter(isRide).sort((a, b) => b.day.localeCompare(a.day));
    const ftp = rides.map((r) => n(r, 'icu_pm_ftp', 'icu_eftp')).find((v): v is number => !!v) ?? null;
    const w = latestWeight(rides) ?? p.athlete?.weight ?? null;
    const recent = rides.filter((r: Activity) => r.day >= addDays(today, -90));
    const p5 = Math.max(0, ...recent.map((r) => r.best?.[300] ?? 0));
    const vo2 = w && p5 ? vo2FromPower(p5 / w) : null;
    const lift = (name: string, reps: 1 | 10) => {
      const list = (sets.data ?? []).filter((s: LiftSet) => s.exercise === name && work(s) && s.day >= addDays(today, -90));
      const best = Math.max(0, ...list.map((s) => e1rm(s.weight, s.reps) ?? 0));
      return best ? (reps === 1 ? best : best / (1 + 10 / 30)) : null;   // Epley, turned round for 10 reps
    };
    return { ftp: ftp ? Math.round(ftp) : null, vo2, lift, liftNames: exercises((sets.data ?? []).filter(work)), main: mainLiftNames(sets.data ?? []) };
  }, [acts.data, sets.data, today, p.athlete]);
}

function Bar({ pct, tone, label, right }: { pct: number | null; tone: string; label: string; right: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-semibold"><span>{label}</span><span>{right}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-muted">
        {pct != null && <div className={cn('h-full rounded-full bg-gradient-to-r bg-[length:200%_100%] animate-shine transition-all duration-700 motion-reduce:animate-none', tone)} style={{ width: `${Math.max(4, Math.min(100, pct * 100))}%` }} />}
      </div>
    </div>
  );
}

export function GoalsCard() {
  const p = useProfile().data!;
  const goals = useGoals();
  const cur = useCurrent();
  const tests = usePlannedTests(p);
  const [unit] = useUnit();
  const [open, setOpen] = useState(false);
  const today = todayIn(p.time_zone);
  const wk = blockWeek(tests.data ?? [], mondayOf(today));
  const list = goals.value ?? [];
  const remove = (id: string) => goals.save(list.filter((g) => g.id !== id));
  const show = (kg: number) => `${Math.round(fromKg(kg, unit))} ${unit}`;

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="goals">🎯 Goals</CardTitle><p className="text-xs text-muted-foreground">How far you have come, and what is left</p></CardHeader>
      <CardContent className="space-y-3">
        {wk != null && <Bar pct={wk / 5} tone="from-[#FF6B00] via-[#FF2E63] to-[#FF6B00]" label={`🧱 Training block · ${wk === 4 ? 'deload week' : wk === 5 ? 'test week' : 'build'}`} right={`${wk} of 5 weeks`} />}
        {list.map((g) => {
          let pct: number | null = null, right = 'no data yet', sub = '';
          if (g.kind === 'event' && g.day) {
            const total = Math.max(1, weeksBetween(g.since, g.day)), left = weeksBetween(today, g.day);
            pct = g.day <= today ? 1 : (total - left) / total; right = g.day <= today ? 'race day reached 🎉' : `${left} week${left === 1 ? '' : 's'} to go`; sub = shortDate(g.day);
          } else {
            const now = g.kind === 'ftp' ? cur.ftp : g.kind === 'vo2' ? cur.vo2 : g.lift ? cur.lift(g.lift, g.reps ?? 1) : null;
            if (now != null && g.target) {
              const start = g.start ?? now;
              pct = g.target > start ? (now - start) / (g.target - start) : now >= g.target ? 1 : 0;
              const fmt = (v: number) => (g.kind === 'lift' ? show(v) : g.kind === 'ftp' ? `${Math.round(v)} W` : v.toFixed(1));
              right = now >= g.target ? `${fmt(now)} · reached 🎉` : `${fmt(now)} of ${fmt(g.target)}`;
              sub = g.kind === 'lift' ? `estimated ${g.reps === 10 ? '10RM' : '1RM'}, best of the last 90 days` : g.kind === 'ftp' ? 'intervals.icu eFTP' : 'estimate from your best 5-min power';
            }
          }
          return (
            <div key={g.id} className="rounded-xl bg-muted/60 p-2.5">
              <Bar pct={pct} tone={g.kind === 'event' ? 'from-sky-400 via-violet-500 to-sky-400' : g.kind === 'lift' ? 'from-fuchsia-500 via-pink-500 to-fuchsia-500' : 'from-emerald-400 via-lime-400 to-emerald-400'} label={g.title} right={right} />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground"><span>{sub}</span><button type="button" aria-label={`Remove ${g.title}`} onClick={() => remove(g.id)}><Trash2 className="h-3.5 w-3.5" /></button></div>
            </div>
          );
        })}
        {!list.length && <p className="rounded-xl border border-dashed p-3 text-sm">Set a goal to see a progress bar here: a race or event coming up, an FTP or VO2max number, or a lift.</p>}
        <Button variant={list.length ? 'outline' : 'default'} className="w-full" onClick={() => setOpen(true)}><Plus /> Add a goal</Button>
      </CardContent>
      {open && <GoalSheet onClose={() => setOpen(false)} cur={cur} unit={unit} onSave={(g) => goals.save([...list, g])} />}
    </Card>
  );
}

function GoalSheet({ onClose, onSave, cur, unit }: { onClose: () => void; onSave: (g: Goal) => Promise<void>; cur: ReturnType<typeof useCurrent>; unit: 'kg' | 'lb' }) {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const cal = useCalendar(p), plan = usePlanData(p);
  const [kind, setKind] = useState<Goal['kind']>('event');
  const [title, setTitle] = useState('');
  const [day, setDay] = useState('');
  const [target, setTarget] = useState('');
  const main = MAIN_LIFTS.map((m) => ({ label: m.label, name: cur.main[m.key] ?? m.label }));
  const [lift, setLift] = useState(main[0].name);
  const [reps, setReps] = useState<1 | 10>(1);
  const races = useMemo(() => [
    ...(cal.data ?? []).filter((c) => c.day > today && /^Race/.test(c.kind)).map((c) => ({ title: c.name || c.kind, day: c.day })),
    ...(plan.events.data ?? []).filter((e) => e.kind === 'race' && e.starts_at.slice(0, 10) > today).map((e) => ({ title: e.title, day: e.starts_at.slice(0, 10) }))
  ].filter((r, i, a) => a.findIndex((x) => x.day === r.day && x.title === r.title) === i).sort((a, b) => a.day.localeCompare(b.day)), [cal.data, plan.events.data, today]);
  const now = kind === 'ftp' ? cur.ftp : kind === 'vo2' ? cur.vo2 : kind === 'lift' ? cur.lift(lift, reps) : null;
  const t = Number(target);
  const ok = kind === 'event' ? !!title.trim() && day > today : t > 0;
  const save = async () => {
    const g: Goal = { id: Math.random().toString(36).slice(2, 10), kind, since: today, title: '' };
    if (kind === 'event') Object.assign(g, { title: title.trim(), day });
    if (kind === 'ftp') Object.assign(g, { title: `FTP ${t} W`, target: t, start: now });
    if (kind === 'vo2') Object.assign(g, { title: `VO2max ${t}`, target: t, start: now });
    if (kind === 'lift') Object.assign(g, { title: `${lift} ${reps === 1 ? '1RM' : '10RM'} ${t} ${unit}`, target: toKg(t, unit), start: now, lift, reps });
    await onSave(g); onClose();
  };
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle className="font-display text-2xl font-extrabold uppercase italic">Add a goal</SheetTitle><SheetDescription>You can have several goals at once.</SheetDescription></SheetHeader>
        <div className="space-y-4">
          <Field label="Goal"><Chips>{KINDS.map((k) => <Chip key={k.id} on={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}</Chips></Field>
          {kind === 'event' && (<>
            {races.length > 0 && <Field label="From your calendar"><Chips>{races.map((r) => <Chip key={r.day + r.title} on={title === r.title && day === r.day} onClick={() => { setTitle(r.title); setDay(r.day); }}>🏁 {r.title} · {shortDate(r.day)}</Chip>)}</Chips></Field>}
            <Field label="Name"><Input value={title} maxLength={80} placeholder="e.g. Gravel 90 km" onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={day} min={addDays(today, 1)} onChange={(e) => setDay(e.target.value)} /></Field>
          </>)}
          {kind === 'lift' && (<>
            <Field label="Lift"><Chips>{main.map((m) => <Chip key={m.label} on={lift === m.name} onClick={() => setLift(m.name)}>{m.label}</Chip>)}</Chips>
              {cur.liftNames.length > 0 && <select aria-label="Other lift" className="mt-2 h-9 w-full rounded-md border bg-card px-2 text-sm" value={main.some((m) => m.name === lift) ? '' : lift} onChange={(e) => e.target.value && setLift(e.target.value)}>
                <option value="">Any other lift ▾</option>{cur.liftNames.map((x) => <option key={x} value={x}>{x}</option>)}</select>}
            </Field>
            <Field label="Reps"><Chips><Chip on={reps === 1} onClick={() => setReps(1)}>1RM</Chip><Chip on={reps === 10} onClick={() => setReps(10)}>10RM</Chip></Chips></Field>
          </>)}
          {kind !== 'event' && (
            <Field label="Target" hint={now != null ? `now ${kind === 'lift' ? `${Math.round(fromKg(now, unit))} ${unit}` : kind === 'ftp' ? `${now} W` : now}` : 'no data yet'}>
              <Input type="number" inputMode="decimal" value={target} placeholder={kind === 'ftp' ? 'W' : kind === 'vo2' ? 'ml/kg/min' : unit} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          )}
          <Button className="w-full" disabled={!ok} onClick={save}>Save goal</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
