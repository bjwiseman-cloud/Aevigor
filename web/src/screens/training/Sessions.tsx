import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Chip, Chips } from '@/components/chips';
import { C, axis, shortDay, tooltipStyle } from '@/components/charts';
import { useProfile } from '@/hooks/data';
import { useActivities, useStreams } from '@/hooks/perf';
import { METRICS, duration, isRace, isRide, isRun, n, wbal, workSplit, type Activity } from '@/lib/perf';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

type Filter = 'all' | 'ride' | 'run' | 'other' | 'race';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'ride', label: 'Rides' }, { id: 'run', label: 'Runs' }, { id: 'other', label: 'Other' }, { id: 'race', label: 'Races only' }];
const icon = (a: Activity) => (isRide(a) ? '🚴' : isRun(a) ? '🏃' : /weight|strength/i.test(a.type) ? '🏋️' : '•');

function Battery({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-1" aria-label={`W′ left ${Math.round(p)}%`}>
      <div className="relative h-10 w-full overflow-hidden rounded-md border-2 border-foreground/60">
        <div className="h-full transition-[width] duration-150" style={{ width: `${p}%`, background: `linear-gradient(90deg, ${C.orange}, ${C.green})` }} />
        <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold">{Math.round(p)}%</span>
      </div>
      <div className="h-4 w-1.5 rounded-r bg-foreground/60" />
    </div>
  );
}

function Detail({ a, onClose }: { a: Activity; onClose: () => void }) {
  const s = useStreams(isRide(a) || isRun(a) ? a.id : null);
  const [t, setT] = useState(0);
  const watts = s.data?.watts ?? [], hr = s.data?.heartrate ?? [];
  const ftp = n(a, 'icu_ftp') ?? n(a, 'icu_pm_ftp'), wp = n(a, 'icu_w_prime', 'icu_pm_w_prime') ?? 20000;
  const bal = useMemo(() => (watts.length && ftp ? wbal(watts, ftp, wp) : []), [watts, ftp, wp]);
  const step = Math.max(1, Math.ceil(Math.max(watts.length, hr.length) / 600));
  const chart = useMemo(() => {
    const len = Math.max(watts.length, hr.length), out = [];
    for (let i = 0; i < len; i += step) out.push({ i, w: watts[i] ?? null, hr: hr[i] ?? null, bal: bal[i] != null ? Math.round((bal[i] / wp) * 100) : null });
    return out;
  }, [watts, hr, bal, step, wp]);
  const split = watts.length && ftp ? workSplit(watts, ftp) : null;
  const lowest = bal.length ? Math.round((Math.min(...bal) / wp) * 100) : null;
  const at = Math.min(t, Math.max(0, bal.length - 1));
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle>{icon(a)} {a.name || a.type}</SheetTitle><SheetDescription>{shortDay(a.day)} · {duration(a.moving_time)}</SheetDescription></SheetHeader>
        <div className="space-y-4">
          {s.isLoading && <p className="text-sm text-muted-foreground">Loading the ride data…</p>}
          {s.error && <p className="text-sm text-muted-foreground">{(s.error as Error).message}</p>}
          {chart.length > 0 && (
            <div className="h-40">
              <ResponsiveContainer>
                <LineChart data={chart} margin={{ top: 5, right: 0, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="i" tickFormatter={(v) => duration(Number(v))} {...axis} minTickGap={40} />
                  <YAxis yAxisId="w" {...axis} />
                  <YAxis yAxisId="hr" orientation="right" hide />
                  <Tooltip {...tooltipStyle} labelFormatter={(v) => duration(Number(v))} />
                  {!!watts.length && <Line yAxisId="w" dataKey="w" name="Power" stroke={C.cyan} dot={false} strokeWidth={1} isAnimationActive={false} />}
                  {!!hr.length && <Line yAxisId="hr" dataKey="hr" name="Heart rate" stroke={C.red} dot={false} strokeWidth={1} isAnimationActive={false} />}
                  {bal.length > 0 && <ReferenceLine yAxisId="w" x={Math.floor(at / step) * step} stroke="#fff" />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {bal.length > 0 && split && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">W′ battery</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Battery pct={(bal[at] / wp) * 100} />
                <Slider min={0} max={bal.length - 1} step={1} value={[at]} onValueChange={([v]) => setT(v)} aria-label="Time in the ride" />
                <div className="flex justify-between text-xs text-muted-foreground"><span>{duration(at)}</span><span>Lowest {lowest}%</span></div>
                <div className="text-sm">Total work <b>{Math.round(split.totalKj)} kJ</b> · above FTP <b>{Math.round(split.aboveKj)} kJ</b> ({((split.aboveKj / split.totalKj) * 100).toFixed(0)}%)</div>
                <div className="flex h-3 overflow-hidden rounded-full"><div style={{ width: `${100 - (split.aboveKj / split.totalKj) * 100}%`, background: C.cyan }} /><div className="flex-1" style={{ background: C.orange }} /></div>
                <p className="text-xs text-muted-foreground">W′ is the energy you can spend above FTP. It drains above FTP and refills below it (Skiba 2015 model), using FTP {ftp} W and W′ {(wp / 1000).toFixed(1)} kJ{n(a, 'icu_w_prime', 'icu_pm_w_prime') ? '' : ' (default, not set in intervals.icu)'}.</p>
              </CardContent>
            </Card>
          )}
          <table className="w-full text-sm">
            <tbody>{METRICS.map((m) => { const v = m.get(a); return v ? <tr key={m.label} className="border-t"><td className="py-1 text-muted-foreground">{m.label}</td><td className="text-right font-mono">{v}</td></tr> : null; })}</tbody>
          </table>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Sessions() {
  const p = useProfile().data!;
  const acts = useActivities(p);
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<Activity | null>(null);
  const [more, setMore] = useState(30);
  const list = (acts.data ?? []).filter((a) => filter === 'all' || (filter === 'ride' ? isRide(a) : filter === 'run' ? isRun(a) : filter === 'race' ? isRace(a) : !isRide(a) && !isRun(a)));
  const cmp = picked.map((id) => (acts.data ?? []).find((a) => a.id === id)).filter(Boolean) as Activity[];
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= 4 ? picked : [...picked, id]);
  // Similar sessions: same kind, within 20% of the length
  const similar = (a: Activity) => (acts.data ?? []).filter((b) => b.id !== a.id && isRide(b) === isRide(a) && isRun(b) === isRun(a) && Math.abs((b.moving_time ?? 0) - (a.moving_time ?? 0)) <= 0.2 * (a.moving_time ?? 0)).slice(0, 3);

  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      {cmp.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle>Compare {cmp.length} sessions</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground"><tr><th className="text-left" />{cmp.map((a) => <th key={a.id} className="px-1 text-right">{shortDay(a.day)}<div className="max-w-[90px] truncate font-normal">{a.name}</div></th>)}</tr></thead>
              <tbody>{METRICS.filter((m) => cmp.some((a) => m.get(a))).map((m) => <tr key={m.label} className="border-t"><td className="py-1 text-muted-foreground">{m.label}</td>{cmp.map((a) => <td key={a.id} className="px-1 text-right font-mono">{m.get(a) ?? '–'}</td>)}</tr>)}</tbody>
            </table>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setPicked([])}>Clear</Button>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Chips>{FILTERS.map((f) => <Chip key={f.id} on={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</Chip>)}</Chips>
          <p className="text-xs text-muted-foreground">Tap a session for its analysis. Tick 2 to 4 to compare them side by side.</p>
          <div className="divide-y rounded-md border">
            {list.slice(0, more).map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-2 py-2 text-sm">
                <Checkbox checked={picked.includes(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Compare ${a.name ?? a.type}`} />
                <button type="button" className="flex-1 text-left" onClick={() => setOpen(a)}>
                  <span className="text-muted-foreground">{shortDay(a.day)}</span> {icon(a)} <b>{a.name || a.type}</b>{isRace(a) && ' 🏁'}
                  <span className="block text-xs text-muted-foreground">{duration(a.moving_time)}{a.load ? ` · load ${Math.round(a.load)}` : ''}{n(a, 'icu_weighted_avg_watts') ? ` · NP ${Math.round(n(a, 'icu_weighted_avg_watts')!)} W` : ''}</span>
                </button>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPicked([a.id, ...similar(a).map((b) => b.id)])}>Similar</Button>
              </div>
            ))}
            {!list.length && <p className="p-3 text-sm text-muted-foreground">{acts.isLoading ? 'Loading…' : 'No sessions yet. They appear after the next sync.'}</p>}
          </div>
          {list.length > more && <Button variant="outline" className="w-full" onClick={() => setMore(more + 30)}>Show more</Button>}
          <p className="text-xs text-muted-foreground">Lifting analysis (e1RM, volume, hard sets) comes with the lifting log.</p>
        </CardContent>
      </Card>
      {open && <Detail a={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
