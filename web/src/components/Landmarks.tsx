// Settings > Weekly volume landmarks: MV / MEV / MAV / MRV sets per week for each muscle, with Reset to default.
import { useState } from 'react';
import { toast } from 'sonner';
import { usePref } from '@/hooks/data';
import { MUSCLES, type MuscleKey } from '@/lib/muscles';
import { DEFAULT_LANDMARKS, LANDMARK_KEY, type Landmark } from '@/lib/volume';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const COLS: [keyof Landmark, string][] = [['mv', 'MV'], ['mev', 'MEV'], ['mavLo', 'MAV from'], ['mavHi', 'MAV to'], ['mrv', 'MRV']];

export function Landmarks() {
  const pref = usePref<Partial<Record<MuscleKey, Landmark>>>(LANDMARK_KEY, {});
  const [draft, setDraft] = useState<Partial<Record<MuscleKey, Partial<Record<keyof Landmark, string>>>>>({});
  const cur = (k: MuscleKey) => pref.value[k] ?? DEFAULT_LANDMARKS[k];
  const val = (k: MuscleKey, c: keyof Landmark) => draft[k]?.[c] ?? (cur(k)?.[c] != null ? String(cur(k)![c]) : '');
  async function save() {
    const out: Partial<Record<MuscleKey, Landmark>> = { ...pref.value };
    for (const [k, d] of Object.entries(draft) as [MuscleKey, Partial<Record<keyof Landmark, string>>][]) {
      const v = Object.fromEntries(COLS.map(([c]) => [c, Number(d[c] ?? cur(k)?.[c] ?? '')])) as Landmark;
      if (COLS.some(([c]) => !isFinite(v[c]) || v[c] < 0 || v[c] > 60)) { toast.error('Use whole numbers from 0 to 60'); return; }
      if (!(v.mv <= v.mev && v.mev <= v.mavLo && v.mavLo <= v.mavHi && v.mavHi <= v.mrv)) { toast.error('Each number must be at least the one before it (MV ≤ MEV ≤ MAV ≤ MRV)'); return; }
      out[k] = v;
    }
    try { await pref.save(out); setDraft({}); toast.success('Saved'); } catch (e) { toast.error((e as Error).message); }
  }
  async function reset() {
    try { await pref.save({}); setDraft({}); toast.success('Back to the default landmarks'); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">Hard sets per week. Defaults are Renaissance Periodization's typical numbers; blank muscles are not coloured on the volume map until you fill them in.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="text-left">Muscle</th>{COLS.map(([c, l]) => <th key={c} className="px-0.5">{l}</th>)}</tr></thead>
          <tbody>{MUSCLES.map((m) => (
            <tr key={m.k} className="border-t"><td className="py-1 pr-1">{m.label}</td>
              {COLS.map(([c]) => (
                <td key={c} className="px-0.5"><Input inputMode="numeric" className="h-7 w-11 px-1 text-center text-xs" value={val(m.k, c)} aria-label={`${m.label} ${c}`}
                  onChange={(e) => setDraft({ ...draft, [m.k]: { ...draft[m.k], [c]: e.target.value.replace(/\D/g, '').slice(0, 2) } })} /></td>
              ))}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!Object.keys(draft).length} onClick={save}>Save</Button>
        <Button size="sm" variant="outline" onClick={reset}>Reset to default</Button>
      </div>
    </div>
  );
}
