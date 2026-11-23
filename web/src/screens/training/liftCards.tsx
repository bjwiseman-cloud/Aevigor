import { useNavigate } from 'react-router-dom';
import { PhotoLogButton } from '@/components/PhotoLog';
import type { ReadLift } from '@/lib/logreader';
// Lifting cards used on other tabs: e1RM (Performance > Lifting), weekly volume (Load > Lifting), file import (Activities).
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';
import { HelpQ } from '@/components/HelpQ';
import { MAIN_LIFTS, e1rm, e1rmSeries, exercises, fromKg, heaviest, importCsv, mainLiftNames, setKey, showW, weeklyVolume, type ImportResult, type LiftSet, type Unit } from '@/lib/lifting';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Chips } from '@/components/chips';
import { BodyFigure, ScaleLegend, figureSex } from '@/components/BodyMap';
import { useExercises } from '@/components/ExercisePicker';
import { useProfile, usePref } from '@/hooks/data';
import { colorFor, levelName, muscleLabel, type MuscleKey } from '@/lib/muscles';
import { DEFAULT_LANDMARKS, LANDMARK_KEY, hardSets, volumeLevel, weekStart, type Landmark } from '@/lib/volume';
import { todayIn } from '@/lib/time';
import { cn } from '@/lib/utils';
import { addDays } from '@rules';
import { C, HowToRead, axis, shortDay, tooltipStyle } from '@/components/charts';

// Estimated 1RM (Ben 2026-11-23): Squat, Bench and Deadlift as the main choices, every other lift in a drop-down.
export function Strength({ sets, unit, ex, setEx }: { sets: LiftSet[]; unit: Unit; ex: string | null; setEx: (e: string) => void }) {
  const list = useMemo(() => exercises(sets.filter((s) => e1rm(s.weight, s.reps) != null)), [sets]);
  const main = useMemo(() => mainLiftNames(sets.filter((s) => e1rm(s.weight, s.reps) != null)), [sets]);
  const mainNames = MAIN_LIFTS.map((m) => main[m.key]).filter((x): x is string => !!x);
  const others = list.filter((e) => !mainNames.includes(e));
  const pick = ex && list.includes(ex) ? ex : mainNames[0] ?? list[0];
  const data = useMemo(() => (pick ? e1rmSeries(sets, pick).map((p) => ({ ...p, v: Math.round(fromKg(p.e1rm, unit) * 10) / 10 })) : []), [sets, pick, unit]);
  const best = data.reduce((m, p) => Math.max(m, p.v), 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="strength">Estimated 1-rep max</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {MAIN_LIFTS.map((m) => {
            const name = main[m.key];
            return <Chip key={m.key} on={!!name && name === pick} onClick={() => name ? setEx(name) : undefined}>{m.label}{!name && <span className="ml-1 text-[10px] text-muted-foreground">none yet</span>}</Chip>;
          })}
          {others.length > 0 && (
            <select className="h-8 max-w-[11rem] rounded-full border bg-card px-3 text-sm" aria-label="Other lifts"
              value={pick && others.includes(pick) ? pick : ''} onChange={(e) => e.target.value && setEx(e.target.value)}>
              <option value="">Other lifts ▾</option>{others.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
        </div>
        {list.length && pick ? <>
          <p className="text-sm"><b>{pick}</b> · best <b className="font-mono">{best} {unit}</b> <span className="text-muted-foreground">· latest {data.at(-1)?.v} {unit}</span></p>
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

function VolumeChart({ sets, unit, ex }: { sets: LiftSet[]; unit: Unit; ex: string | null }) {
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

// Weekly volume: the body heat map of hard sets per muscle (this week, or step back) and the volume-load bars.
export function Volume({ sets, unit, ex }: { sets: LiftSet[]; unit: Unit; ex: string | null }) {
  const p = useProfile().data!;
  const all = useExercises();
  const lm = usePref<Partial<Record<MuscleKey, Landmark>>>(LANDMARK_KEY, {});
  const [back, setBack] = useState(0);
  const [cur, setCur] = useState<string | null>(null);
  const [side, setSide] = useState<'front' | 'back'>('front');
  const swipe = useRef<number | null>(null);
  const byName = useMemo(() => {
    const m = new Map((all ?? []).map((x) => [x.n.toLowerCase(), x]));
    // Short names from the older lifting log
    for (const [k, v] of [['squat', 'back squat'], ['bench', 'bench press'], ['ohp', 'standing military press']]) if (m.get(v)) m.set(k, m.get(v)!);
    return m;
  }, [all]);
  const from = addDays(weekStart(todayIn(p.time_zone)), -7 * back), to = addDays(from, 6);
  const counts = useMemo(() => hardSets(sets, (n) => byName.get(n.toLowerCase()) ?? null, from, to), [sets, byName, from, to]);
  const land = (k: string) => (lm.value as Record<string, Landmark>)[k] ?? DEFAULT_LANDMARKS[k as MuscleKey];
  const level = (k: string) => volumeLevel(counts[k as MuscleKey], land(k));
  const unknown = useMemo(() => [...new Set(sets.filter((x) => x.day >= from && x.day <= to && !x.warmup && !byName.has(x.exercise.toLowerCase())).map((x) => x.exercise))], [sets, from, to, byName]);
  const l = cur ? land(cur) : undefined;
  return (
    <>
      <Card>
        <CardHeader className="pb-2"><CardTitle help="strength">Weekly volume by muscle</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <Button size="sm" variant="outline" onClick={() => setBack(Math.min(26, back + 1))} aria-label="Earlier week">‹</Button>
            <span>Week of {shortDay(from)}</span>
            <Button size="sm" variant="outline" disabled={!back} onClick={() => setBack(back - 1)} aria-label="Later week">›</Button>
          </div>
          {/* Swipe left or right on the body to turn it (Ben 2026-11-23, replaces the Front / Back buttons) */}
          <div className="mx-auto w-full max-w-[220px] touch-pan-y select-none"
            onPointerDown={(e) => { swipe.current = e.clientX; }}
            onPointerUp={(e) => { if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 40) { setSide(side === 'front' ? 'back' : 'front'); navigator.vibrate?.(8); } swipe.current = null; }}
            onPointerCancel={() => { swipe.current = null; }}>
            <div key={side} className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
              <BodyFigure sex={figureSex(p.sex)} side={side} selected={cur} fill={(k) => (level(k) ? colorFor('volume', level(k)) : undefined)} onMuscle={(k) => setCur(cur === k ? null : k)} />
            </div>
            <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-muted-foreground" aria-live="polite">
              <span className={cn('h-1.5 w-1.5 rounded-full', side === 'front' ? 'bg-primary' : 'bg-muted-foreground/40')} />
              <button type="button" className="rounded px-1" aria-label="Turn the body" onClick={() => setSide(side === 'front' ? 'back' : 'front')}>{side === 'front' ? 'Front' : 'Back'} · swipe to turn</button>
              <span className={cn('h-1.5 w-1.5 rounded-full', side === 'back' ? 'bg-primary' : 'bg-muted-foreground/40')} />
            </div>
          </div>
          <ScaleLegend scale="volume" />
          {cur && (
            <div className="rounded-md border p-3 text-sm">
              <b>{muscleLabel(cur)}</b>: {counts[cur as MuscleKey] ?? 0} hard sets this week
              {l ? <div className="text-xs text-muted-foreground">MV {l.mv} · MEV {l.mev} · MAV {l.mavLo}-{l.mavHi} · MRV {l.mrv} sets a week{level(cur) ? ` · ${levelName('volume', level(cur))}` : ''}</div>
                : <div className="text-xs text-muted-foreground">No landmarks set for this muscle. Add them in Settings &gt; Weekly volume landmarks.</div>}
            </div>
          )}
          {unknown.length > 0 && <p className="text-xs text-muted-foreground">Not counted (exercise not in the list, so its muscles are unknown): {unknown.join(', ')}</p>}
          <HowToRead>Each muscle is coloured by its hard sets this week (Monday to Sunday): working sets with 0-4 reps in reserve, 1 set for the main muscle and half a set for helping muscles. The colours show where that number falls against the volume landmarks MV, MEV, MAV and MRV (Renaissance Periodization's typical numbers, which you can change in Settings). It needs every working set logged, not just top sets. Tap a muscle for its numbers.</HowToRead>
        </CardContent>
      </Card>
      <VolumeChart sets={sets} unit={unit} ex={ex} />
    </>
  );
}

export function LiftImport({ sets, unit }: { sets: LiftSet[]; unit: Unit }) {
  const navigate = useNavigate();
  const [read, setRead] = useState<ReadLift[] | null>(null);
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
        <PhotoLogButton unit={unit} onRead={setRead} />
        <p className="text-xs text-muted-foreground">Photo of my log: take a photo or pick a screenshot of a lifting log. It is read on your phone; you check it, then add the time, duration, heart rate, RPE and Feel, the same as in Post Activity.</p>
        {read && (
          <div className="space-y-2 rounded-md border border-primary/60 p-3">
            <div className="font-semibold">Does this match your log?</div>
            <ul className="space-y-1">
              {read.map((l, i) => (
                <li key={i}><b>{l.name}</b>{!l.matched && <span className="text-xs text-status-caution"> (new name, check it)</span>}
                  <div className="text-xs text-muted-foreground">{l.sets.map((x) => `${x.kg || '–'} ${unit} × ${x.reps}${x.rir ? ` @${x.rir} RIR` : ''}`).join(' · ')}</div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => navigate('/checkin/session', { state: { photo: read } })}>Yes, add the details</Button>
              <Button size="sm" variant="outline" onClick={() => setRead(null)}>Not right</Button>
            </div>
            <p className="text-xs text-muted-foreground">You can fix any set on the next screen before saving. Not right? Try a sharper, straight-on photo.</p>
          </div>
        )}
        {shown && (shown.error ? <p className="text-status-warn">{shown.error}</p> : <>
          <p>Found <b>{shown.sets.length}</b> sets{shown.app !== 'CSV' ? ` (looks like ${shown.app})` : ''}{shown.skipped ? `, ${shown.skipped} rows skipped` : ''}. <b>{fresh.length}</b> are new.</p>
          {!shown.unitFound && <div className="flex items-center gap-2"><span>Weights in the file are in</span><Chips><Chip on={fileUnit === 'kg'} onClick={() => setFileUnit('kg')}>kg</Chip><Chip on={fileUnit === 'lb'} onClick={() => setFileUnit('lb')}>lb</Chip></Chips></div>}
          <Button size="sm" disabled={!fresh.length || go.isPending} onClick={() => go.mutate()}>Import {fresh.length} sets</Button>
        </>)}
      </CardContent>
    </Card>
  );
}


// Best lifts (Ben 2026-11-23): the heaviest weight actually lifted (not an estimate). Squat, Bench and Deadlift
// always show as colourful tiles (same look as Achievements); any other exercise is picked from a drop-down.
const LIFT_TONE = ['from-rose-400 via-pink-500 to-red-500', 'from-violet-400 via-purple-500 to-indigo-500', 'from-amber-300 via-orange-400 to-red-400 text-amber-950', 'from-sky-300 via-cyan-400 to-blue-500 text-sky-950'];
function LiftTile({ label, name, b, unit, i }: { label: string; name: string | null; b?: { weight: number; reps: number; day: string }; unit: Unit; i: number }) {
  const fresh = !!b && Date.now() - Date.parse(b.day + 'T12:00:00Z') < 14 * 864e5;
  return (
    <div style={{ animationDelay: `${i * 80}ms` }}
      className={cn('relative overflow-hidden rounded-xl bg-gradient-to-br p-3 text-white shadow-md animate-pop motion-reduce:animate-none', LIFT_TONE[i % LIFT_TONE.length], fresh && 'ring-2 ring-yellow-300 ring-offset-2 ring-offset-card')}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden" />
      {fresh && <span className="absolute right-2 top-2 rounded-full bg-white px-1.5 py-px text-[10px] font-extrabold uppercase tracking-wider text-rose-600 shadow animate-pulse">New</span>}
      <div className="relative text-2xl leading-none animate-float motion-reduce:animate-none" style={{ animationDelay: `${i * 230}ms` }}>🏋️</div>
      <div className="relative mt-1.5 truncate text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
      <div className="relative font-display text-2xl font-extrabold italic leading-tight">{b ? `${showW(b.weight, unit)} ${unit}` : '–'}</div>
      <div className="relative truncate text-[11px] opacity-85">{b ? `${b.reps} rep${b.reps > 1 ? 's' : ''} · ${shortDay(b.day)}` : 'not logged yet'}{name && name.toLowerCase() !== label.toLowerCase() ? ` · ${name}` : ''}</div>
    </div>
  );
}

export function BestLifts({ sets, unit }: { sets: LiftSet[]; unit: Unit }) {
  const top = useMemo(() => heaviest(sets), [sets]);
  const main = useMemo(() => mainLiftNames(sets), [sets]);
  const mainNames = MAIN_LIFTS.map((m) => main[m.key]).filter(Boolean) as string[];
  const rest = useMemo(() => exercises(sets).filter((e) => !mainNames.includes(e) && top.has(e)).sort((a, b) => a.localeCompare(b)), [sets, top, mainNames.join()]);
  const [pick, setPick] = useState('');
  const other = pick && rest.includes(pick) ? pick : '';
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="strength">Best lifts</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          {MAIN_LIFTS.map((m, i) => <LiftTile key={m.key} label={m.label} name={main[m.key]} b={main[m.key] ? top.get(main[m.key]!) : undefined} unit={unit} i={i} />)}
          {other && <LiftTile key={other} label={other} name={other} b={top.get(other)} unit={unit} i={3} />}
        </div>
        {rest.length > 0 && (
          <select className="h-9 w-full rounded-md border bg-card px-3 text-sm" aria-label="Other exercises" value={other} onChange={(e) => setPick(e.target.value)}>
            <option value="">Other exercises ({rest.length}) ▾</option>
            {rest.map((e) => <option key={e} value={e}>{e} · {showW(top.get(e)!.weight, unit)} {unit}</option>)}
          </select>
        )}
        <p className="text-xs text-muted-foreground">The heaviest weight you actually lifted for at least 1 rep, warm-ups left out.</p>
      </CardContent>
    </Card>
  );
}
