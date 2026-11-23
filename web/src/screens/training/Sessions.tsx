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
import { usePaceCurves } from '@/hooks/perf';
import { useSearchParams } from 'react-router-dom';
import { addDays } from '@rules';
import { todayIn } from '@/lib/time';
import { e1rm, type LiftSet } from '@/lib/lifting';
import { useSets, useUnit } from '@/hooks/lifting';
import { LiftImport } from '@/screens/training/liftCards';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
import { useActivities, useStreams } from '@/hooks/perf';
import { MEDALS, METRICS, RUN_DIST, duration, isRace, isRide, isRun, n, secsLabel, wbal, workSplit, type Activity } from '@/lib/perf';
import { Arrange } from '@/components/Arrange';
import { CompareCard } from '@/components/Compare';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

type Filter = 'all' | 'ride' | 'run' | 'lift' | 'other';
const FILTERS: { id: Filter; label: string }[] = [{ id: 'all', label: 'All' }, { id: 'ride', label: '🚴 Cycling' }, { id: 'run', label: '🏃 Running' }, { id: 'lift', label: '🏋️ Lifting' }, { id: 'other', label: 'Other' }];
const isLift = (a: Activity) => /weight|strength/i.test(a.type);
const icon = (a: Activity) => (isRide(a) ? '🚴' : isRun(a) ? '🏃' : isLift(a) ? '🏋️' : '•');
const LENGTHS = [{ id: 'l60', label: '<60 min', lo: 0, hi: 60 }, { id: 'l90', label: '60-90 min', lo: 60, hi: 90 }, { id: 'l120', label: '90-120 min', lo: 90, hi: 120 }, { id: 'lmax', label: '>120 min', lo: 120, hi: 1e9 }];
const KINDS = ['Z2', 'VO2max', 'Threshold', 'Tempo', 'Easy Z1', 'Sprints'] as const;
// Session type: from the name first, else from intensity (IF = NP ÷ FTP). A best guess, shown as such.
export function kindOf(a: Activity): (typeof KINDS)[number] | null {
  const t = a.name ?? '';
  if (/sprint/i.test(t)) return 'Sprints';
  if (/vo2|\b[3-6]x[3-5] ?min|4x4|30.?\/.?15|30.?30/i.test(t)) return 'VO2max';
  if (/threshold|ftp|sweet ?spot|\bss\b|2x20|3x15|over.?under/i.test(t)) return 'Threshold';
  if (/tempo/i.test(t)) return 'Tempo';
  if (/recovery|easy|\bz1\b|spin/i.test(t)) return 'Easy Z1';
  if (/z2|zone ?2|endurance|aerobic/i.test(t)) return 'Z2';
  const ifv = n(a, 'icu_intensity'); if (ifv == null) return null;
  const x = ifv / 100;
  return x < 0.6 ? 'Easy Z1' : x < 0.76 ? 'Z2' : x < 0.88 ? 'Tempo' : x < 1.0 ? 'Threshold' : 'VO2max';
}

// Badges: top-3 power for a duration over the last 365 days (rides), and best-pace entries on the pace curves (runs)
const BADGE_SECS = [5, 60, 300, 1200, 3600];
function useBadges(acts: Activity[], pace: { curve: string; label: string | null; meters: number[]; activity_ids: (string | null)[] | null }[], today: string) {
  return useMemo(() => {
    const out: Record<string, string[]> = {};
    const year = acts.filter((a) => isRide(a) && a.best && a.day >= addDays(today, -365));
    for (const s of BADGE_SECS) {
      year.filter((r) => r.best?.[s]).sort((a, b) => b.best![s] - a.best![s]).slice(0, 3)
        .forEach((r, i) => { (out[r.id] ??= []).push(`${MEDALS[i]} ${secsLabel(s)}`); });
    }
    const all = pace.find((c) => c.curve === '1y') ?? pace[0];
    const labels = new Map(RUN_DIST.map((d) => [d.m, d.label]));
    all?.meters.forEach((m, i) => { const id = all.activity_ids?.[i]; const l = labels.get(Math.round(m)); if (id && l) (out[id] ??= []).push(`🏅 ${l}`); });
    return out;
  }, [acts, pace, today]);
}

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

function Detail({ a, badges, sets, onClose }: { a: Activity; badges: string[]; sets: LiftSet[]; onClose: () => void }) {
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
          {badges.length > 0 && <div className="flex flex-wrap gap-1">{badges.map((b) => <span key={b} className="rounded-full border px-2 py-0.5 text-xs">{b}</span>)}</div>}
          {kindOf(a) && (isRide(a) || isRun(a)) && <p className="text-xs text-muted-foreground">Session type: <b>{kindOf(a)}</b> (from the name or intensity)</p>}
          {isLift(a) && (sets.length ? (
            <table className="w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="text-left">Exercise</th><th>Set</th><th>Reps</th><th>kg</th><th>e1RM</th></tr></thead>
              <tbody>{sets.map((x) => <tr key={x.id} className="border-t"><td className="py-1">{x.exercise}{x.warmup ? ' (warm-up)' : ''}</td><td className="text-center">{x.set_no}</td><td className="text-center">{x.reps}</td><td className="text-center font-mono">{x.weight}</td><td className="text-center font-mono">{x.warmup ? '–' : e1rm(x.weight, x.reps) ? Math.round(e1rm(x.weight, x.reps)!) : '–'}</td></tr>)}</tbody></table>
          ) : <p className="text-sm text-muted-foreground">No sets logged for this day. Add them in Post Activity.</p>)}
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
              <CardHeader className="pb-2"><CardTitle className="text-base" help="w-prime">W′ battery</CardTitle></CardHeader>
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
  const acts = useActivities(p), paceCurves = usePaceCurves(p), lifts = useSets();
  const today = todayIn(p.time_zone);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<Filter>('all');
  const [race, setRace] = useState(false);
  const [len, setLen] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [more, setMore] = useState(30);
  const [range, setRange] = useState<{ y: string | null; m: string | null; all?: boolean }>({ y: null, m: null });
  const [unit] = useUnit();
  const all = acts.data ?? [];
  const openId = params.get('open');
  const open = openId ? all.find((a) => a.id === openId) ?? null : null;
  const setOpen = (a: Activity | null) => setParams(a ? { open: a.id } : {}, { replace: !a });
  const badges = useBadges(all, paceCurves.data ?? [], today);
  const endurance = filter === 'ride' || filter === 'run';
  const from30 = addDays(today, -29);
  const years = [...new Set(all.map((a) => a.day.slice(0, 4)))].sort().reverse();
  const months = range.y ? [...new Set(all.filter((a) => a.day.startsWith(range.y!)).map((a) => a.day.slice(5, 7)))].sort() : [];
  const list = all.filter((a) => {
    if (!range.all && !range.y && a.day < from30) return false;
    if (range.y && !a.day.startsWith(range.m ? `${range.y}-${range.m}` : range.y)) return false;
    if (filter === 'ride' && !isRide(a)) return false;
    if (filter === 'run' && !isRun(a)) return false;
    if (filter === 'lift' && !isLift(a)) return false;
    if (filter === 'other' && (isRide(a) || isRun(a) || isLift(a))) return false;
    if (endurance && race && !isRace(a)) return false;
    if (endurance && len) { const L = LENGTHS.find((x) => x.id === len)!, m = (a.moving_time ?? 0) / 60; if (m < L.lo || m >= L.hi) return false; }
    if (endurance && kind && kindOf(a) !== kind) return false;
    return true;
  });
  const cmp = picked.map((id) => all.find((a) => a.id === id)).filter(Boolean) as Activity[];
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : picked.length >= 4 ? picked : [...picked, id]);
  // Similar sessions: same kind, within 20% of the length
  const similar = (a: Activity) => all.filter((b) => b.id !== a.id && isRide(b) === isRide(a) && isRun(b) === isRun(a) && Math.abs((b.moving_time ?? 0) - (a.moving_time ?? 0)) <= 0.2 * (a.moving_time ?? 0)).slice(0, 3);
  const pickFilter = (f: Filter) => { setFilter(f); setRace(false); setLen(null); setKind(null); };

  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      {cmp.length > 1 && <CompareCard cmp={cmp} onClear={() => setPicked([])} />}
      <Arrange page="sessions" cards={[
        { id: 'list', label: 'Activities', node: (
      <Card>
        <CardHeader className="pb-2"><CardTitle help="sessions">Activities</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Chips>
            <Chip on={!range.y && !range.all} onClick={() => setRange({ y: null, m: null })}>Last 30 days</Chip>
            {years.map((y) => <Chip key={y} on={range.y === y} onClick={() => setRange({ y, m: null })}>{y}</Chip>)}
            <Chip on={!!range.all} onClick={() => setRange({ y: null, m: null, all: true })}>All</Chip>
          </Chips>
          {range.y && months.length > 1 && <Chips>{months.map((m) => <Chip key={m} on={range.m === m} className="text-xs" onClick={() => setRange({ y: range.y, m: range.m === m ? null : m })}>{MONTHS[Number(m) - 1]}</Chip>)}</Chips>}
          <Chips>{FILTERS.map((f) => <Chip key={f.id} on={filter === f.id} onClick={() => pickFilter(f.id)}>{f.label}</Chip>)}</Chips>
          {endurance && (
            <div className="space-y-1.5 rounded-md border p-2">
              <Chips><Chip on={race} onClick={() => setRace(!race)} className="text-xs">Races</Chip>{LENGTHS.map((l) => <Chip key={l.id} on={len === l.id} onClick={() => setLen(len === l.id ? null : l.id)} className="text-xs">{l.label}</Chip>)}</Chips>
              <Chips>{KINDS.map((k) => <Chip key={k} on={kind === k} onClick={() => setKind(kind === k ? null : k)} className="text-xs">{k}</Chip>)}</Chips>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Tap a session for its analysis. Tick 2 to 4 to compare them side by side.</p>
          <div className="divide-y rounded-md border">
            {list.slice(0, more).map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-2 py-2 text-sm">
                <Checkbox checked={picked.includes(a.id)} onCheckedChange={() => toggle(a.id)} aria-label={`Compare ${a.name ?? a.type}`} />
                <button type="button" className="flex-1 text-left" onClick={() => setOpen(a)}>
                  <span className="text-muted-foreground">{shortDay(a.day)}</span> {icon(a)} <b>{a.name || a.type}</b>{isRace(a) && ' 🏁'}
                  {badges[a.id] && <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">{badges[a.id].slice(0, 4).map((b) => <span key={b} className="rounded-full border px-1.5 text-[10px]">{b}</span>)}</span>}
                  <span className="block text-xs text-muted-foreground">{duration(a.moving_time)}{a.load ? ` · load ${Math.round(a.load)}` : ''}{n(a, 'icu_weighted_avg_watts') ? ` · NP ${Math.round(n(a, 'icu_weighted_avg_watts')!)} W` : ''}</span>
                </button>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setPicked([a.id, ...similar(a).map((b) => b.id)])}>Similar</Button>
              </div>
            ))}
            {!list.length && <p className="p-3 text-sm text-muted-foreground">{acts.isLoading ? 'Loading…' : 'No activities in this period.'}</p>}
          </div>
          {list.length > more && <Button variant="outline" className="w-full" onClick={() => setMore(more + 30)}>Show more</Button>}
        </CardContent>
      </Card>
        ) },
        { id: 'import', label: 'Import Activity', node: <LiftImport sets={lifts.data ?? []} unit={unit} /> }
      ]} />
      {open && <Detail a={open} badges={badges[open.id] ?? []} sets={(lifts.data ?? []).filter((x) => x.activity_id ? x.activity_id === open.id : x.day === open.day)} onClose={() => setOpen(null)} />}
    </div>
  );
}
