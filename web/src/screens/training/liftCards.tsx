// Lifting cards used on other tabs: e1RM (Performance > Lifting), weekly volume (Load > Lifting), file import (Activities).
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';
import { HelpQ } from '@/components/HelpQ';
import { e1rm, e1rmSeries, exercises, fromKg, importCsv, setKey, showW, weeklyVolume, type ImportResult, type LiftSet, type Unit } from '@/lib/lifting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Chips } from '@/components/chips';
import { C, HowToRead, axis, shortDay, tooltipStyle } from '@/components/charts';

export function Strength({ sets, unit, ex, setEx }: { sets: LiftSet[]; unit: Unit; ex: string | null; setEx: (e: string) => void }) {
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

export function Volume({ sets, unit, ex }: { sets: LiftSet[]; unit: Unit; ex: string | null }) {
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

export function LiftImport({ sets, unit }: { sets: LiftSet[]; unit: Unit }) {
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
  const [busy, setBusy] = useState(false);
  // .fit / .gpx / .tcx: sent to the person's intervals.icu, which works out load, curves and zones; the next sync brings it here
  async function onFile(f: File) {
    if (/\.csv$/i.test(f.name) || f.type === 'text/csv') { setText(await f.text()); return; }
    if (f.size > 10 * 1024 * 1024) { toast.error('That file is over 10 MB.'); return; }
    setBusy(true);
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      await callApi('upload-activity', { name: f.name.slice(0, 120), data: btoa(bin) });
      toast.success('Sent to intervals.icu. It shows here after the next sync.');
      await qc.invalidateQueries();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  }
  const shown: ImportResult | null = parsed;
  return (
    <Card>
      <CardHeader className="pb-2"><div className="flex items-center justify-between gap-2"><CardTitle>Import Activity</CardTitle><HelpQ text="Lifting: a CSV export from FitNotes, Strong, Hevy, Liftosaur, Jefit or a similar app; sets you already have are skipped. Rides, runs and other sessions: a .fit, .gpx or .tcx file, sent to your intervals.icu so load, power curves and Activities update from there." /></div></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <input ref={file} type="file" accept=".csv,text/csv,.fit,.gpx,.tcx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => file.current?.click()}><Upload className="mr-1 h-3.5 w-3.5" /> {busy ? 'Sending…' : 'Choose file (.csv, .fit, .gpx, .tcx)'}</Button>
        {shown && (shown.error ? <p className="text-status-warn">{shown.error}</p> : <>
          <p>Found <b>{shown.sets.length}</b> sets{shown.app !== 'CSV' ? ` (looks like ${shown.app})` : ''}{shown.skipped ? `, ${shown.skipped} rows skipped` : ''}. <b>{fresh.length}</b> are new.</p>
          {!shown.unitFound && <div className="flex items-center gap-2"><span>Weights in the file are in</span><Chips><Chip on={fileUnit === 'kg'} onClick={() => setFileUnit('kg')}>kg</Chip><Chip on={fileUnit === 'lb'} onClick={() => setFileUnit('lb')}>lb</Chip></Chips></div>}
          <Button size="sm" disabled={!fresh.length || go.isPending} onClick={() => go.mutate()}>Import {fresh.length} sets</Button>
        </>)}
      </CardContent>
    </Card>
  );
}

