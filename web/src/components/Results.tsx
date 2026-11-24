// "How did it go?" (Ben 2026-11-24): after a test or race in the last 7 days, ask how it went, then show a short
// reward with why it matters. Saved to the account (user_prefs 'results'). Never blocks anything; can be skipped.
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCalendar, usePlannedTests, usePref, useProfile } from '@/hooks/data';
import { usePlanData } from '@/hooks/plan';
import { shortDate } from '@/lib/plan';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

export type Result = { feel: number | null; note?: string; at: string; skipped?: boolean };
const FEELS = [
  { e: '😫', l: 'Rough' }, { e: '😕', l: 'Meh' }, { e: '🙂', l: 'OK' }, { e: '💪', l: 'Strong' }, { e: '🚀', l: 'Best ever' }
];
const TONES = ['from-slate-400 to-slate-500', 'from-sky-400 to-indigo-500', 'from-emerald-400 to-teal-500', 'from-orange-400 to-rose-500', 'from-fuchsia-500 to-[#FF2E63]'];

export function useResults() { return usePref<Record<string, Result>>('results', {}); }

/** Tests and races from the last 7 days (today included) that have no answer yet. */
export function usePendingResults() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone), from = addDays(today, -6);
  const tests = usePlannedTests(p), cal = useCalendar(p), plan = usePlanData(p), res = useResults();
  const list = useMemo(() => {
    const out: { key: string; day: string; title: string; race: boolean }[] = [];
    for (const t of tests.data ?? []) if (t.day >= from && t.day <= today) out.push({ key: `t:${t.day}:${t.kind}`, day: t.day, title: t.name || t.kind, race: false });
    for (const c of cal.data ?? []) if (c.day >= from && c.day <= today && /^Race/.test(c.kind)) out.push({ key: `r:${c.day}:${c.id}`, day: c.day, title: c.name || c.kind, race: true });
    for (const e of plan.events.data ?? []) {
      const d = e.starts_at.slice(0, 10);
      if ((e.kind === 'fitness_test' || e.kind === 'race') && d >= from && d <= today && new Date(e.starts_at).getTime() < Date.now()) out.push({ key: `e:${e.id}`, day: d, title: e.title, race: e.kind === 'race' });
    }
    return out.filter((x) => !res.value?.[x.key]).sort((a, b) => b.day.localeCompare(a.day));
  }, [tests.data, cal.data, plan.events.data, res.value, from, today]);
  return { list, res, loaded: res.loaded };
}

export function ResultPromptCard() {
  const { list, res, loaded } = usePendingResults();
  const [feel, setFeel] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ title: string; feel: number | null; race: boolean } | null>(null);
  if (!loaded) return null;
  if (done) {
    return (
      <Card className="border-0 from-[#FF6B00] via-[#FF2E63] to-fuchsia-600 text-white">
        <CardContent className="relative space-y-2 pt-5 text-center">
          <div className="text-6xl animate-burst motion-reduce:animate-none">{done.feel != null && done.feel >= 3 ? '🏆' : '🏅'}</div>
          <div className="font-display text-3xl font-extrabold uppercase italic">Logged!</div>
          <p className="text-sm font-semibold">{done.title}{done.feel != null ? ` · ${FEELS[done.feel].e} ${FEELS[done.feel].l}` : ''}</p>
          <p className="text-sm opacity-95"><b>Why it matters:</b> {done.race ? 'noting how a race went, good or bad, shows what to train next and makes the next one easier to plan.' : 'tests only help if you look back at them. Your note sits next to the number, so you can see what changed from one test to the next.'}</p>
          <Button variant="ghost" className="text-white hover:bg-white/20" onClick={() => setDone(null)}>Close</Button>
        </CardContent>
      </Card>
    );
  }
  const it = list[0];
  if (!it) return null;
  const save = async (skip = false) => {
    await res.save({ ...(res.value ?? {}), [it.key]: { feel: skip ? null : feel, note: skip ? undefined : note.trim() || undefined, at: new Date().toISOString(), skipped: skip || undefined } });
    if (!skip) { setDone({ title: it.title, feel, race: it.race }); navigator.vibrate?.([20, 40, 20]); }
    setFeel(null); setNote('');
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>{it.race ? '🏁' : '⏱'} How did it go?</CardTitle><p className="text-xs text-muted-foreground">{it.title} · {shortDate(it.day)}{list.length > 1 ? ` · ${list.length - 1} more to answer` : ''}</p></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-5 gap-1.5">
          {FEELS.map((f, i) => (
            <button key={f.l} type="button" aria-pressed={feel === i} onClick={() => setFeel(i)}
              className={cn('rounded-lg border px-1 py-2 text-center text-[11px] font-semibold transition-transform active:scale-95', feel === i ? cn('border-transparent bg-gradient-to-br text-white shadow-md animate-pop', TONES[i]) : 'bg-card')}>
              <span className="block text-2xl leading-none">{f.e}</span>{f.l}
            </button>
          ))}
        </div>
        <Input maxLength={200} placeholder="Result or a note (optional), e.g. 312 W, felt strong" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => save(true)}>Skip</Button>
          <Button className="flex-1" disabled={feel == null} onClick={() => save()}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}
