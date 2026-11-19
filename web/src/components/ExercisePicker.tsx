// "Add exercise": pick a body part, then the equipment, to filter the exercise list (Free Exercise DB, public domain).
// Search, recent exercises and "Add my own" are there too.
import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Chip, Chips } from '@/components/chips';
import { MUSCLES, MUSCLE_GROUPS, muscleLabel, type MuscleKey } from '@/lib/muscles';

export type Exercise = { n: string; m: MuscleKey[]; s: MuscleKey[]; e: string };
let cache: Exercise[] | null = null;
export function useExercises() {
  const [x, setX] = useState<Exercise[] | null>(cache);
  useEffect(() => { if (!cache) void import('@/assets/exercises.json').then((m) => { cache = m.default as unknown as Exercise[]; setX(cache); }); }, []);
  return x;
}
export const EQUIPMENT: [string, string][] = [
  ['barbell', 'Barbell'], ['dumbbell', 'Dumbbell'], ['smith', 'Smith machine'], ['machine', 'Machine'], ['cable', 'Cable'],
  ['bodyweight', 'Bodyweight'], ['assisted', 'Assisted bodyweight'], ['bands', 'Bands'], ['other', 'Other']
];

export function ExercisePicker({ open, onClose, onPick, recent }: { open: boolean; onClose: () => void; onPick: (name: string) => void; recent: string[] }) {
  const all = useExercises();
  const [muscle, setMuscle] = useState<MuscleKey | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { if (open) { setMuscle(null); setEquip(null); setQ(''); } }, [open]);
  const list = useMemo(() => {
    if (!all) return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((x) => (!muscle || x.m.includes(muscle)) && (!equip || x.e === equip) && words.every((w) => x.n.toLowerCase().includes(w)));
  }, [all, muscle, equip, q]);
  const pick = (n: string) => { onPick(n); onClose(); };
  const showList = !!(muscle || q.trim());

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex h-full w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader><SheetTitle>Add exercise</SheetTitle><SheetDescription>Pick a body part, then the equipment</SheetDescription></SheetHeader>
        <div className="mt-3 space-y-3">
          <Input placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search exercises" />
          {!q && recent.length > 0 && !muscle && (
            <div className="space-y-1"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent</div>
              <Chips>{recent.slice(0, 8).map((n) => <Chip key={n} onClick={() => pick(n)}>{n}</Chip>)}</Chips></div>
          )}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Body part</div>
            {MUSCLE_GROUPS.map((g) => (
              <div key={g} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 text-xs text-muted-foreground">{g}</span>
                {MUSCLES.filter((m) => m.group === g).map((m) => <Chip key={m.k} on={muscle === m.k} onClick={() => setMuscle(muscle === m.k ? null : m.k)}>{m.label}</Chip>)}
              </div>
            ))}
          </div>
          {muscle && (
            <div className="space-y-1"><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Equipment</div>
              <Chips>{EQUIPMENT.map(([k, l]) => <Chip key={k} on={equip === k} onClick={() => setEquip(equip === k ? null : k)}>{l}</Chip>)}</Chips></div>
          )}
          {showList && (
            <div className="divide-y rounded-md border">
              {!all && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
              {all && !list.length && <p className="p-3 text-sm text-muted-foreground">No exercises match.</p>}
              {list.slice(0, 200).map((x) => (
                <button key={x.n} type="button" onClick={() => pick(x.n)} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  {x.n}<small className="block text-xs text-muted-foreground">{x.m.map(muscleLabel).join(', ')}{x.s.length ? ` · also ${x.s.map(muscleLabel).join(', ')}` : ''}</small>
                </button>
              ))}
            </div>
          )}
          {q.trim() && <Button variant="outline" className="w-full" onClick={() => pick(q.trim().slice(0, 80))}>Add my own: “{q.trim().slice(0, 80)}”</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
