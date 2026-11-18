import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Copy, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/data';
import { e1rm, e1rmSeries, exercises, fromKg, importCsv, setKey, showW, toKg, weeklyVolume, type ImportResult, type LiftSet, type NewSet, type Unit } from '@/lib/lifting';
import { todayIn } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Chip, Chips } from '@/components/chips';
import { Arrange } from '@/components/Arrange';
import { C, HowToRead, axis, shortDay, tooltipStyle } from '@/components/charts';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

const UNIT_KEY = 'aev-lift-unit';
function useUnit(): [Unit, (u: Unit) => void] {
  const [u, setU] = useState<Unit>(() => { try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'; } catch { return 'kg'; } });
  return [u, (v) => { setU(v); try { localStorage.setItem(UNIT_KEY, v); } catch { /* private window */ } }];
}

function useSets() {
  return useQuery({
    queryKey: ['lift_sets'],
    queryFn: async () => {
      const all: LiftSet[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('lift_sets').select('*').order('day', { ascending: false }).order('exercise').order('set_no').range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as LiftSet[]).map((s) => ({ ...s, weight: Number(s.weight), rir: s.rir == null ? null : Number(s.rir) })));
        if ((data ?? []).length < 1000 || all.length >= 20000) break;
      }
      return all;
    }
  });
}

type Row = { reps: string; weight: string; rir: string; warmup: boolean };
const blank: Row = { reps: '', weight: '', rir: '', warmup: false };

function LogSession({ sets, unit, today }: { sets: LiftSet[]; unit: Unit; today: string }) {
  const qc = useQueryClient();
  const [day, setDay] = useState(today);
  const [exercise, setExercise] = useState('');
  const [rows, setRows] = useState<Row[]>([{ ...blank }]);
  const known = useMemo(() => exercises(sets), [sets]);
  const last = useMemo(() => sets.filter((s) => s.exercise.toLowerCase() === exercise.trim().toLowerCase()), [sets, exercise]);
  const lastDay = last[0]?.day;
  const save = useMutation({
    mutationFn: async () => {
      const ex = exercise.trim();
      const already = sets.filter((s) => s.day === day && s.exercise === ex).reduce((m, s) => Math.max(m, s.set_no), 0);
      const rowsOut: NewSet[] = rows.filter((r) => r.reps !== '').map((r, i) => ({
        day, exercise: ex, set_no: already + i + 1, reps: Math.round(Number(r.reps)), weight: Math.round(toKg(Number(r.weight) || 0, unit) * 100) / 100,
        rir: r.rir === '' ? null : Number(r.rir), warmup: r.warmup, note: null, source: 'app'
      }));
      if (!ex || !rowsOut.length) throw new Error('Add an exercise and at least one set with reps.');
      const { error } = await supabase.from('lift_sets').insert(rowsOut);
      if (error) throw error;
      return rowsOut.length;
    },
    onSuccess: (n) => { toast.success(`Saved ${n} set${n > 1 ? 's' : ''}`); setRows([{ ...blank }]); void qc.invalidateQueries({ queryKey: ['lift_sets'] }); },
    onError: (e) => toast.error((e as Error).message)
  });
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const copyLast = () => {
    const prev = last.filter((s) => s.day === lastDay).sort((a, b) => a.set_no - b.set_no);
    setRows(prev.map((s) => ({ reps: String(s.reps), weight: showW(s.weight, unit), rir: s.rir == null ? '' : String(s.rir), warmup: s.warmup })));
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="lifting-log">Log a lift</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input list="lift-exercises" placeholder="Exercise, e.g. Back squat" value={exercise} onChange={(e) => setExercise(e.target.value)} aria-label="Exercise" />
          <Input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} aria-label="Date" className="w-[9.5rem]" />
          <datalist id="lift-exercises">{known.map((e) => <option key={e} value={e} />)}</datalist>
        </div>
        {!exercise && known.length > 0 && <Chips>{known.slice(0, 6).map((e) => <Chip key={e} onClick={() => setExercise(e)}>{e}</Chip>)}</Chips>}
        {lastDay && <Button variant="outline" size="sm" onClick={copyLast}><Copy className="mr-1 h-3.5 w-3.5" /> Repeat {shortDay(lastDay)} ({last.filter((s) => s.day === lastDay).length} sets)</Button>}
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1.5rem_1fr_1fr_1fr_auto] gap-1.5 text-xs text-muted-foreground"><span>#</span><span>{unit}</span><span>Reps</span><span>RIR</span><span>Warm-up</span></div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1fr_auto] items-center gap-1.5">
              <span className="text-sm text-muted-foreground">{i + 1}</span>
              <Input inputMode="decimal" value={r.weight} onChange={(e) => set(i, { weight: e.target.value })} aria-label={`Set ${i + 1} weight`} />
              <Input inputMode="numeric" value={r.reps} onChange={(e) => set(i, { reps: e.target.value })} aria-label={`Set ${i + 1} reps`} />
              <Input inputMode="decimal" placeholder="–" value={r.rir} onChange={(e) => set(i, { rir: e.target.value })} aria-label={`Set ${i + 1} reps in reserve`} />
              <input type="checkbox" className="mx-auto h-4 w-4" checked={r.warmup} onChange={(e) => set(i, { warmup: e.target.checked })} aria-label={`Set ${i + 1} is a warm-up`} />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRows([...rows, { ...(rows.at(-1) ?? blank) }])}><Plus className="mr-1 h-3.5 w-3.5" /> Add set</Button>
          <Button size="sm" className="ml-auto" disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Strength({ sets, unit, ex, setEx }: { sets: LiftSet[]; unit: Unit; ex: string | null; setEx: (e: string) => void }) {
  const list = useMemo(() => exercises(sets.filter((s) => e1rm(s.weight, s.reps) != null)), [sets]);
  const pick = ex && list.includes(ex) ? ex : list[0];
  const data = useMemo(() => (pick ? e1rmSeries(sets, pick).map((p) => ({ ...p, v: Math.round(fromKg(p.e1rm, unit) * 10) / 10 })) : []), [sets, pick, unit]);
  const best = data.reduce((m, p) => Math.max(m, p.v), 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="strength">Estimated 1-rep max</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {list.length ? <>
          <Chips>{list.slice(0, 8).map((e) => <Chip key={e} on={e === pick} onClick={() => setEx(e)}>{e}</Chip>)}</Chips>
          <p className="text-sm">Best <b className="font-mono">{best} {unit}</b> <span className="text-muted-foreground">· latest {data.at(-1)?.v} {unit}</span></p>
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={16} />
                <YAxis {...axis} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => shortDay(String(l))}
                  formatter={(v, _n, p) => [`${v} ${unit} (from ${p.payload.reps} × ${showW(p.payload.weight, unit)})`, 'e1RM']} />
                <Line type="monotone" dataKey="v" stroke={C.cyan} strokeWidth={2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </> : <p className="text-sm text-muted-foreground">Log a set of 1 to 12 reps to see your estimated max.</p>}
        <HowToRead>Each dot is your best set that day, turned into an estimated 1-rep max with the Epley formula: weight × (1 + reps ÷ 30). Warm-ups and sets over 12 reps are left out, because the estimate gets less accurate with high reps.</HowToRead>
      </CardContent>
    </Card>
  );
}

function Volume({ sets, unit, ex }: { sets: LiftSet[]; unit: Unit; ex: string | null }) {
  const [only, setOnly] = useState(false);
  const data = useMemo(() => weeklyVolume(sets, only ? ex : null).slice(-16).map((w) => ({ ...w, v: Math.round(fromKg(w.volume, unit)) })), [sets, only, ex, unit]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="strength">Weekly volume</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Chips><Chip on={!only} onClick={() => setOnly(false)}>All lifts</Chip>{ex && <Chip on={only} onClick={() => setOnly(true)}>{ex}</Chip>}</Chips>
        {data.length ? (
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 5, right: 8, left: -6, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="week" {...axis} tickFormatter={shortDay} minTickGap={16} />
                <YAxis {...axis} width={46} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => `Week of ${shortDay(String(l))}`} formatter={(v, _n, p) => [`${Number(v).toLocaleString()} ${unit} · ${p.payload.sets} sets`, 'Volume']} />
                <Bar dataKey="v" fill={C.cyan} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">Nothing logged yet.</p>}
        <HowToRead>Volume load = sets × reps × weight, added up for each week (Monday to Sunday), warm-ups left out. Tap a bar to see the number of working sets.</HowToRead>
      </CardContent>
    </Card>
  );
}

function Import({ sets, unit }: { sets: LiftSet[]; unit: Unit }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const [fileUnit, setFileUnit] = useState<Unit>(unit);
  const [text, setText] = useState('');
  const have = useMemo(() => new Set(sets.map(setKey)), [sets]);
  const parsed = useMemo(() => (text ? importCsv(text, fileUnit) : null), [text, fileUnit]);
  const fresh = useMemo(() => (parsed?.sets ?? []).filter((s) => !have.has(setKey(s))), [parsed, have]);
  const go = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < fresh.length; i += 500) {
        const { error } = await supabase.from('lift_sets').insert(fresh.slice(i, i + 500));
        if (error) throw error;
      }
      return fresh.length;
    },
    onSuccess: (n) => { toast.success(`Imported ${n} sets`); setText(''); if (file.current) file.current.value = ''; void qc.invalidateQueries({ queryKey: ['lift_sets'] }); },
    onError: (e) => toast.error((e as Error).message)
  });
  const shown: ImportResult | null = parsed;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="lifting-log">Import from another app</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Pick a CSV export from FitNotes, Strong, Hevy, Liftosaur or a similar app. Sets you already have are skipped.</p>
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" /> Choose CSV file</Button>
        {shown && (shown.error ? <p className="text-status-warn">{shown.error}</p> : <>
          <p>Found <b>{shown.sets.length}</b> sets{shown.app !== 'CSV' ? ` (looks like ${shown.app})` : ''}{shown.skipped ? `, ${shown.skipped} rows skipped` : ''}. <b>{fresh.length}</b> are new.</p>
          {!shown.unitFound && <div className="flex items-center gap-2"><span>Weights in the file are in</span><Chips><Chip on={fileUnit === 'kg'} onClick={() => setFileUnit('kg')}>kg</Chip><Chip on={fileUnit === 'lb'} onClick={() => setFileUnit('lb')}>lb</Chip></Chips></div>}
          <Button size="sm" disabled={!fresh.length || go.isPending} onClick={() => go.mutate()}>Import {fresh.length} sets</Button>
        </>)}
      </CardContent>
    </Card>
  );
}

function History({ sets, unit }: { sets: LiftSet[]; unit: Unit }) {
  const qc = useQueryClient();
  const [n, setN] = useState(5);
  const days = useMemo(() => [...new Set(sets.map((s) => s.day))].slice(0, n), [sets, n]);
  const del = useMutation({
    mutationFn: async (ids: string[]) => { const { error } = await supabase.from('lift_sets').delete().in('id', ids); if (error) throw error; },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lift_sets'] }),
    onError: (e) => toast.error((e as Error).message)
  });
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="lifting-log">History</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!days.length && <p className="text-muted-foreground">Your logged lifts show here.</p>}
        {days.map((d) => {
          const today = sets.filter((s) => s.day === d);
          return (
            <div key={d} className="border-t pt-2 first:border-t-0 first:pt-0">
              <div className="font-medium">{shortDay(d)}</div>
              {exercises(today).map((ex) => {
                const ss = today.filter((s) => s.exercise === ex).sort((a, b) => a.set_no - b.set_no);
                return (
                  <div key={ex} className="flex items-start gap-2 py-0.5">
                    <div className="min-w-0 flex-1"><span>{ex}</span>
                      <div className="font-mono text-xs text-muted-foreground">{ss.map((s) => `${s.warmup ? 'w ' : ''}${showW(s.weight, unit)}×${s.reps}${s.rir != null ? ` @${s.rir}` : ''}`).join('  ')}</div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button type="button" className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Delete ${ex} on ${d}`}><Trash2 className="h-4 w-4" /></button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Delete {ss.length} sets of {ex}?</AlertDialogTitle><AlertDialogDescription>From {shortDay(d)}. This can't be undone.</AlertDialogDescription></AlertDialogHeader>
                        <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => del.mutate(ss.map((s) => s.id))}>Delete</AlertDialogAction></AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          );
        })}
        {new Set(sets.map((s) => s.day)).size > n && <Button variant="ghost" size="sm" onClick={() => setN(n + 10)}>Show more</Button>}
      </CardContent>
    </Card>
  );
}

export function Lifting() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const q = useSets();
  const [unit, setUnit] = useUnit();
  const [ex, setEx] = useState<string | null>(null);
  const sets = q.data ?? [];
  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      <div className="flex items-center justify-end gap-2 text-sm"><span className="text-muted-foreground">Units</span>
        <Chips><Chip on={unit === 'kg'} onClick={() => setUnit('kg')}>kg</Chip><Chip on={unit === 'lb'} onClick={() => setUnit('lb')}>lb</Chip></Chips>
      </div>
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : (
        <Arrange page="lifting" cards={[
          { id: 'log', label: 'Log a lift', node: <LogSession sets={sets} unit={unit} today={today} /> },
          { id: 'e1rm', label: 'Estimated 1-rep max', node: <Strength sets={sets} unit={unit} ex={ex} setEx={setEx} /> },
          { id: 'volume', label: 'Weekly volume', node: <Volume sets={sets} unit={unit} ex={ex ?? exercises(sets)[0] ?? null} /> },
          { id: 'history', label: 'History', node: <History sets={sets} unit={unit} /> },
          { id: 'import', label: 'Import from another app', node: <Import sets={sets} unit={unit} /> }
        ]} />
      )}
    </div>
  );
}
