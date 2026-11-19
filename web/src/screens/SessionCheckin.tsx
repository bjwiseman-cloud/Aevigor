// Post Activity: pick a session from the last 7 days (or a gym session with no watch activity), rate session RPE and
// Feel, then the ride conditions checklist (rides) or lifts + sore / joint pain / pump body map (lifting and other).
// Everything is sent to the intervals.icu activity. Answers the app filled in itself show an "Auto" tag.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ReadLift } from '@/lib/logreader';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addDays } from '@rules';
import { callApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { niceDay, todayIn } from '@/lib/time';
import { useProfile, useSessionLogs, useWellness, useCheckins } from '@/hooks/data';
import { useSets, useUnit } from '@/hooks/lifting';
import { useActivities } from '@/hooks/perf';
import { isRide, n, type Activity } from '@/lib/perf';
import { e1rm, exercises, fromKg, showW, toKg } from '@/lib/lifting';
import { HelpQ } from '@/components/HelpQ';
import { BodyMapEditor, figureSex, type MapMode, type MapValue } from '@/components/BodyMap';
import { PhotoLogButton } from '@/components/PhotoLog';
import { ExercisePicker } from '@/components/ExercisePicker';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { shortDay } from '@/components/charts';
import { cn } from '@/lib/utils';
import { CheckinSeg } from '@/screens/Checkin';

const RPE_LABELS = ['', 'Very easy', 'Easy', 'Moderate', 'Somewhat hard', 'Hard', 'Hard+', 'Very hard', 'Very hard+', 'Near max', 'Max'];
// intervals.icu activity Feel: 1 Strong … 5 Weak (same words as intervals.icu)
const FEEL = ['Strong', 'Good', 'Normal', 'Poor', 'Weak'];
const LIFT_MODES: MapMode[] = [{ id: 'sore', label: 'Sore', scale: 'sore', target: 'muscle' }, { id: 'joint', label: 'Joint pain', scale: 'joint', target: 'joint' }, { id: 'pump', label: 'Pump', scale: 'pump', target: 'muscle' }];
const OTHER_MODES = LIFT_MODES.slice(0, 2);
const RPE_HELP = 'Session RPE (Foster CR-10): how hard the whole session felt, rated about 30 min after it ended. RPE × minutes gives the session load used for lifting and badminton. Saved to this activity in intervals.icu.';
const FEEL_HELP = 'How your body felt during the session. Same five answers as Feel in intervals.icu (and Garmin\'s "How did you feel?"), saved to this activity.';
const COND_KEYS = ['type', 'len', 'time', 'fan', 'strap', 'fuel', 'heat', 'hyd', 'ill', 'sleep', 'hard'];
const COND_TEST_KEYS = ['caf', 'warm', 'zero', 'meal'];
// [steady label, test label, why (steady), why (test)], as in the live app
const COND_INFO: Record<string, [string, string, string, string]> = {
  type: ['Steady zone 2 ride', 'Same test or race format', 'EF and decoupling are only fair between steady, easy rides. Intervals and surges move heart rate for reasons that have nothing to do with fitness.', 'Compare like with like: a 20-min test only with other 20-min tests, a crit only with crits.'],
  len: ['Usual length and power', 'Same course or set-up', 'Longer or harder rides drift more, so compare rides of a similar length and power.', 'A different course, gearing or trainer set-up changes the result, so keep it the same between tests.'],
  time: ['Usual time of day', 'Usual time of day', 'Heart rate and power shift through the day. Similar start times make rides easier to compare.', 'Most people are a little stronger in the late afternoon than early morning. Test at the same time each time.'],
  fan: ['Same fan and room', 'Same fan and room', 'Airflow cools you. Less fan means a hotter body and a higher heart rate at the same power.', 'Airflow cools you. A hotter body gives up power sooner, so keep the fan set-up the same.'],
  strap: ['Chest strap and usual power meter', 'Chest strap and usual power meter', 'Chest straps read heart rate more accurately than wrist sensors. A different power meter can read a few % differently.', 'A different power meter can read a few % differently, which can look like a gain or loss that is not real.'],
  fuel: ['Usual carbs during the ride', 'Usual carbs during the ride', 'Running low on carbs lets heart rate creep up late in a ride.', 'Running low on carbs lowers power in long efforts, which matters most for durability.'],
  heat: ['Usual temperature', 'Usual temperature', 'Heat makes your heart work harder at the same power, so a hot ride can look like lost fitness when it is not.', 'Heat lowers the power you can hold, so a hot test can look like lost fitness when it is not.'],
  hyd: ['Drank your usual amount', 'Drank your usual amount', 'Drinking less than usual lets heart rate drift up through the ride.', 'Starting or riding a bit dry lowers power and raises heart rate.'],
  ill: ['Not sick', 'Not sick', 'Being sick raises heart rate and lowers power, so the ride does not show your real fitness.', 'Being sick lowers power, so the result does not show your real fitness.'],
  sleep: ['Slept well, not run down', 'Slept well, not run down', 'Poor sleep or a tired body makes the same effort feel and look harder.', 'Poor sleep or a tired body lowers test power.'],
  hard: ['No hard day before', 'No hard day before', 'A hard day before leaves fatigue that can change heart rate and power.', 'A hard day before leaves fatigue that can lower test power.'],
  caf: ['', 'Same caffeine as usual (or none)', '', 'Caffeine can raise test power by a few percent. Take the same amount, or none, before every test so results are fair.'],
  warm: ['', 'Same warm-up and trainer mode', '', 'A different warm-up, or ERG instead of slope mode, changes pacing and the result. Keep both the same.'],
  zero: ['', 'Power meter zeroed before the ride', '', 'Zeroing (calibrating) the power meter before a test keeps readings accurate from test to test.'],
  meal: ['', 'Usual meal before the ride', '', 'What and when you eat before a test changes your energy, especially in long efforts like durability.']
};
const TEST_RE = /ftp|20.?min.*(test|tt)|vo2|5.?min.*test|durab|race|crit|\btt\b|time trial|fondo/i;
const isLift = (a: Activity) => a.type === 'WeightTraining';
const median = (a: (number | null | undefined)[]) => { const v = a.filter((x): x is number => typeof x === 'number' && isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const hourOf = (a: Activity) => Number(String(a.start_local ?? '').slice(11, 13)) || null;

function Opts({ opts, value, onPick, cols }: { opts: string[]; value: number | null | undefined; onPick: (v: number) => void; cols: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {opts.map((o, i) => (
        <button key={o} type="button" onClick={() => onPick(i)}
          className={cn('rounded-md border px-1 py-2 text-xs leading-tight', value === i ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>{o}</button>
      ))}
    </div>
  );
}
function Sec({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return <Card><CardContent className="space-y-2 py-3"><div className="flex items-center justify-between gap-2"><b>{title}</b>{help && <HelpQ text={help} />}</div>{children}</CardContent></Card>;
}
export function Auto({ on }: { on: boolean }) {
  return on ? <span className="ml-1.5 rounded border border-primary/50 px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-primary" title="Filled in automatically">Auto</span> : null;
}

type SetRow = { kg: string; reps: string; rir: string };
type Lift = { name: string; sets: SetRow[]; auto?: boolean };
const blankSet: SetRow = { kg: '', reps: '', rir: '' };

export function SessionCheckin() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const acts = useActivities(p), logs = useSessionLogs(p), wellness = useWellness(p), checkins = useCheckins(p), lifted = useSets();
  const [unit] = useUnit();
  const qc = useQueryClient();
  const recent = useMemo(() => (acts.data ?? []).filter((a) => a.day >= addDays(today, -6) && (a.moving_time ?? 0) >= 900)
    .sort((a, b) => String(b.start_local ?? b.day).localeCompare(String(a.start_local ?? a.day))), [acts.data, today]);
  const logged = (a: Activity) => (logs.data ?? []).some((l) => l.activity_id === a.id);
  const [id, setId] = useState<string | null>(null);
  const manual = id === 'manual';
  const a = manual ? undefined : recent.find((x) => x.id === id) ?? recent.find((x) => !logged(x)) ?? recent[0];
  const prev = (logs.data ?? []).find((l) => l.activity_id === a?.id);
  const kind: 'ride' | 'lift' | 'other' = manual ? 'lift' : a ? (isRide(a) ? 'ride' : isLift(a) ? 'lift' : 'other') : 'other';

  const [rpe, setRpe] = useState(5);
  const [feel, setFeel] = useState<number | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'z2' | 'test'>('z2');
  const [cond, setCond] = useState<Record<string, boolean>>({});
  const [temp, setTemp] = useState(''), [carbs, setCarbs] = useState('');
  const [lifts, setLifts] = useState<Lift[]>([]);
  const [manualDay, setManualDay] = useState(today);
  const [mStart, setMStart] = useState(''), [mMin, setMMin] = useState(''), [mHr, setMHr] = useState('');
  const [body, setBody] = useState<MapValue>({});
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));
  // "Photo of my log" from Import Activity opens this form as a lifting log with the lifts it read
  const loc = useLocation(), nav = useNavigate();
  const photo = (loc.state as { photo?: ReadLift[] } | null)?.photo;
  const photoHold = useRef(false);
  useEffect(() => {
    if (!photo || !lifted.data) return;
    photoHold.current = true;
    setId('manual'); setRpe(5); setFeel(null); setNote('');
    setLifts(photo.map((r) => ({ name: r.name, sets: r.sets, auto: true })));
    nav('.', { replace: true, state: null });
  }, [photo, lifted.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Guesses for each checklist line from intervals.icu and the check-in, as in the live app; a saved answer wins
  const guess = useMemo(() => {
    if (!a || kind !== 'ride') return { val: {} as Record<string, boolean>, why: {} as Record<string, string>, isTest: false, usualCarbs: null as number | null, temp: '' };
    const all = acts.data ?? [];
    const np = n(a, 'icu_weighted_avg_watts'), ap = n(a, 'icu_average_watts', 'average_watts');
    const ifv = n(a, 'icu_intensity') !== null ? n(a, 'icu_intensity')! / 100 : null;
    const vi = np && ap ? np / ap : null;
    const isTest = TEST_RE.test(a.name ?? '') || (ifv !== null && ifv > 0.85);
    const rides = all.filter((x) => isRide(x) && x.id !== a.id && x.day >= addDays(a.day, -60));
    const uHour = median(rides.map(hourOf)), h0 = hourOf(a);
    const rideLogs = (logs.data ?? []).filter((l) => l.kind === 'ride' && l.activity_id !== a.id);
    const uTemp = median(rideLogs.map((l) => l.data.temp)), usualCarbs = median(rideLogs.map((l) => l.data.carbs));
    const t = n(a, 'average_temp');
    const w = (wellness.data ?? []).find((x) => x.day === a.day), c = (checkins.data ?? []).find((x) => x.day === a.day);
    const sl = w?.sleep_secs ? w.sleep_secs / 3600 : null;
    const sick = c?.sick === 'Mild' || c?.sick === 'Yes' || w?.extra?.Sickness === 1 || w?.extra?.Sickness === 2;
    let tot = 0, prevDay = 0;
    all.forEach((x) => { if (x.day < a.day && x.day >= addDays(a.day, -28)) tot += x.load ?? 0; if (x.day === addDays(a.day, -1)) prevDay += x.load ?? 0; });
    const avgDay = tot / 28;
    const trainer = !!a.raw.trainer || /Virtual/.test(a.type);
    const val: Record<string, boolean> = {
      type: isTest ? true : vi === null || ifv === null ? true : vi <= 1.05 && ifv >= 0.6 && ifv <= 0.75,
      len: isTest ? true : (a.moving_time ?? 0) >= 3600,
      time: uHour === null || !h0 ? true : Math.abs(h0 - uHour) <= 2,
      fan: prev?.data.c?.fan ?? true, strap: prev?.data.c?.strap ?? true, fuel: true,
      heat: t === null || uTemp === null ? true : Math.abs(t - uTemp) <= 2,
      hyd: prev?.data.c?.hyd ?? true, ill: !sick, sleep: sl === null ? true : sl >= 7,
      hard: !(prevDay > 0 && avgDay > 0 && prevDay > avgDay * 1.5),
      caf: true, warm: true, zero: true, meal: true
    };
    const why: Record<string, string> = {
      type: isTest ? 'Named or ridden as a test or race' : vi !== null && ifv !== null ? `Variability ${vi.toFixed(2)} · intensity ${ifv.toFixed(2)}` : 'From intervals.icu',
      len: `${Math.round((a.moving_time ?? 0) / 60)} min${np ? ` · ${Math.round(np)} W NP` : ''}`,
      time: `Started ${String(a.start_local ?? '').slice(11, 16) || '–'}${uHour !== null ? ` · usually about ${uHour}:00` : ''}`,
      fan: trainer ? 'Indoor (trainer)' : 'Outdoor',
      heat: t !== null ? `${Math.round(t)} °C${uTemp !== null ? ` · usually ${uTemp} °C` : ''}` : 'No temperature recorded',
      ill: sick ? 'Sickness logged that day' : 'No sickness logged that day',
      sleep: sl !== null ? `${Math.round(sl * 10) / 10} h sleep` : 'No sleep data',
      hard: `Day before: load ${Math.round(prevDay)}${avgDay ? ` · usual day ${Math.round(avgDay)}` : ''}`,
      fuel: usualCarbs !== null ? `Usually ${usualCarbs} g carbs/h` : ''
    };
    return { val, why, isTest, usualCarbs, temp: t === null ? '' : String(Math.round(t)) };
  }, [a?.id, kind, acts.data, logs.data, wellness.data, checkins.data]);

  // What the app filled in by itself (from intervals.icu, the watch or other connectors) rather than the person
  const autoRpe = !prev?.rpe && !!(a && n(a, 'icu_rpe'));
  const autoFeel = !prev?.data.feel && !!(a && n(a, 'feel'));
  const liftDay = manual ? manualDay : a?.day;

  useEffect(() => {
    setTouched({});
    if (manual) { if (!photoHold.current) { setLifts(loadLifts(null)); setBody({}); } return; }
    if (!a) return;
    const d = prev?.data ?? {};
    setRpe(prev?.rpe ?? (n(a, 'icu_rpe') ? Math.round(n(a, 'icu_rpe')!) : 5));
    const f = d.feel ?? n(a, 'feel');
    setFeel(f && f >= 1 && f <= 5 ? Math.round(f) : null); setNote(prev?.note ?? '');
    setMode(d.mode ?? (guess.isTest ? 'test' : 'z2'));
    setCond({ ...guess.val, ...(d.c ?? {}) });
    setTemp(d.temp != null ? String(d.temp) : guess.temp); setCarbs(d.carbs != null ? String(d.carbs) : '');
    if (!photoHold.current) setLifts(loadLifts(a));
    setBody({ sore: d.body?.sore ?? {}, joint: d.body?.joint ?? {}, pump: d.body?.pump ?? {} });
  }, [a?.id, manual, prev, guess, lifted.data]);

  function loadLifts(x: Activity | null | undefined): Lift[] {
    const all = lifted.data ?? [];
    const mine = x ? all.filter((s) => s.activity_id === x.id || (!s.activity_id && s.source === 'session' && s.day === x.day))
      : all.filter((s) => s.source === 'manual' && s.day === manualDay);
    const out: Lift[] = exercises(mine).map((name) => ({
      name, sets: mine.filter((s) => s.exercise === name).sort((p1, p2) => p1.set_no - p2.set_no)
        .map((s) => ({ kg: showW(s.weight, unit), reps: String(s.reps), rir: s.rir == null ? '' : String(s.rir) }))
    }));
    return out;
  }
  useEffect(() => { if (manual && !photoHold.current) setLifts(loadLifts(null)); }, [manualDay]);

  if (acts.isLoading || logs.isLoading) return <><CheckinSeg on="session" /><p className="text-muted-foreground">Loading…</p></>;

  const keys = [...COND_KEYS, ...(mode === 'test' ? COND_TEST_KEYS : [])];
  const recentNames = exercises(lifted.data ?? []);
  const setLift = (i: number, l: Lift) => setLifts(lifts.map((x, j) => (j === i ? l : x)));
  const bestE1 = (l: Lift) => {
    let best: number | null = null;
    for (const s of l.sets) { const r = Number(s.reps) + (Number(s.rir) || 0); const v = Number(s.kg) > 0 && Number(s.reps) >= 1 && r <= 12 ? e1rm(toKg(Number(s.kg), unit), r) : null; if (v && (!best || v > best)) best = v; }
    return best;
  };

  async function save(allGood = false) {
    if (!manual && !a) return;
    setSaving(true);
    try {
      let copied = false, manualId: string | null = null;
      if (manual) {
        const r = await callApi<{ id: string; copied: boolean }>('manual-session', { day: manualDay, start: mStart, minutes: mMin, hr: mHr, rpe, feel, note, data: { body }, lifts: liftSummary() });
        manualId = r.id; copied = r.copied;
      }
      if (!manual && a) {
        const data: Record<string, unknown> = { feel };
        if (kind === 'ride') Object.assign(data, { mode, c: Object.fromEntries(keys.map((k) => [k, !!cond[k]])), temp, carbs: carbs === '' && allGood && cond.fuel && guess.usualCarbs !== null ? guess.usualCarbs : carbs });
        else Object.assign(data, { body });
        const r = await callApi<{ copied: boolean }>('session', { id: a.id, kind, rpe, note, data, lifts: kind === 'lift' ? liftSummary() : undefined });
        copied = r.copied;
      }
      if (kind === 'lift' && liftDay) {
        const rows = lifts.flatMap((l) => l.sets.filter((s) => Number(s.reps) >= 1).map((s, i) => ({
          day: liftDay, exercise: l.name.slice(0, 80), set_no: i + 1, reps: Math.round(Number(s.reps)), weight: Math.round(toKg(Number(s.kg) || 0, unit) * 100) / 100,
          rir: s.rir === '' ? null : Math.max(0, Math.min(10, Math.round(Number(s.rir)))), warmup: false, note: null,
          source: manual ? 'manual' : 'session', activity_id: manual ? manualId : a!.id
        })));
        if (manual) await supabase.from('lift_sets').delete().eq('day', liftDay).eq('source', 'manual');
        else {
          await supabase.from('lift_sets').delete().eq('activity_id', a!.id);
          await supabase.from('lift_sets').delete().eq('day', liftDay).eq('source', 'session').is('activity_id', null);
        }
        if (rows.length) { const { error } = await supabase.from('lift_sets').insert(rows); if (error) throw error; }
      }
      toast.success(manual ? (copied ? 'Saved, and added to intervals.icu' : 'Saved') : copied ? 'Saved and sent to intervals.icu' : 'Saved to this session');
      await qc.invalidateQueries({ queryKey: ['session_logs'] }); await qc.invalidateQueries({ queryKey: ['lift_sets'] }); if (manual) await qc.invalidateQueries({ queryKey: ['activities'] });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  function liftSummary() {
    return lifts.filter((l) => l.sets.some((s) => Number(s.reps) >= 1)).map((l) => `${l.name}: ${l.sets.filter((s) => Number(s.reps) >= 1).map((s) => `${s.kg || 0}${unit}×${s.reps}${s.rir !== '' ? ` @${s.rir} RIR` : ''}`).join(', ')}`).join('; ').slice(0, 1500);
  }

  const item = (x: Activity) => (
    <button key={x.id} type="button" onClick={() => { photoHold.current = false; setId(x.id); }} className={cn('flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm', x.id === a?.id ? 'border-primary bg-muted' : 'bg-card')}>
      <span>{x.name || x.type}<br /><small className="text-muted-foreground">{shortDay(x.day)} · {Math.round((x.moving_time ?? 0) / 60)} min</small></span>
      <small className="text-muted-foreground">{logged(x) ? '✓ logged' : 'not logged'}</small>
    </button>
  );
  const ai = a ? recent.indexOf(a) : 0, first = recent.slice(0, Math.max(3, ai + 1)), rest = recent.slice(first.length);

  const liftCard = (
    <Sec title="Lifts" help="Log each exercise and its sets: weight, reps and RIR (reps in reserve, how many more reps you could have done). e1RM = weight × (1 + (reps + RIR) ÷ 30), the Epley formula, for 12 or fewer total reps. Hard sets (0-4 RIR) count toward weekly volume. Saved to your lifting log and this activity.">
      {lifts.map((l, i) => {
        const b = bestE1(l);
        return (
          <div key={i} className="space-y-1.5 rounded-md border p-2">
            <div className="flex items-center gap-2"><b className="flex-1 text-sm">{l.name}<Auto on={!!l.auto} /></b>
              <button type="button" aria-label={`Remove ${l.name}`} className="p-1 text-muted-foreground" onClick={() => setLifts(lifts.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button></div>
            <div className="grid grid-cols-[1.25rem_1fr_1fr_1fr_1.5rem] gap-1.5 text-[11px] text-muted-foreground"><span>#</span><span>{unit.toUpperCase()}</span><span>REPS</span><span>RIR</span><span /></div>
            {l.sets.map((s, k) => (
              <div key={k} className="grid grid-cols-[1.25rem_1fr_1fr_1fr_1.5rem] items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{k + 1}</span>
                {(['kg', 'reps', 'rir'] as const).map((f) => <Input key={f} type="number" inputMode="decimal" value={s[f]} aria-label={`${l.name} set ${k + 1} ${f}`}
                  onChange={(e) => setLift(i, { ...l, sets: l.sets.map((x, j) => (j === k ? { ...x, [f]: e.target.value } : x)) })} />)}
                {l.sets.length > 1 ? <button type="button" aria-label="Remove set" className="text-muted-foreground" onClick={() => setLift(i, { ...l, sets: l.sets.filter((_, j) => j !== k) })}><X className="h-3.5 w-3.5" /></button> : <span />}
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={() => setLift(i, { ...l, sets: [...l.sets, { ...(l.sets.at(-1) ?? blankSet) }] })}><Plus className="mr-1 h-3.5 w-3.5" /> Add set</Button>
              {b && <span className="font-mono text-xs">e1RM {Math.round(fromKg(b, unit) * 2) / 2} {unit}</span>}
            </div>
          </div>
        );
      })}
      <Button type="button" variant="outline" className="w-full" onClick={() => setPicker(true)}><Plus className="mr-1 h-4 w-4" /> Add exercise</Button>
      <PhotoLogButton unit={unit} onRead={(read) => setLifts([...lifts.filter((l) => l.sets.some((x) => x.reps !== '' || x.kg !== '')), ...read.map((r) => ({ name: r.name, sets: r.sets, auto: true }))])} />
      <p className="text-xs text-muted-foreground">Take a photo or pick a screenshot of your workout log. It is read on your phone; rows it fills in are tagged Auto.</p>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} recent={recentNames} onPick={(name) => setLifts([...lifts, { name, sets: [{ ...blankSet }] }])} />
    </Sec>
  );

  return (
    <div className="space-y-3">
      <CheckinSeg on="session" />
      <Sec title="Pick a session">
        <div className="space-y-1.5">{first.map(item)}</div>
        {!recent.length && <p className="text-xs text-muted-foreground">No sessions of 15 min or more in the last 7 days. Pull down to sync.</p>}
        {rest.length > 0 && (
          <Accordion type="single" collapsible><AccordionItem value="r" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm text-muted-foreground">Earlier this week ({rest.length})</AccordionTrigger>
            <AccordionContent className="space-y-1.5">{rest.map(item)}</AccordionContent>
          </AccordionItem></Accordion>
        )}
        <button type="button" onClick={() => { if (!manual) { setRpe(5); setFeel(null); setNote(''); } setId('manual'); }} className={cn('w-full rounded-md border border-dashed px-3 py-2 text-left text-sm', manual ? 'border-primary bg-muted' : 'text-muted-foreground')}>Log a lift without a watch activity</button>
      </Sec>

      {manual && (
        <>
          <Sec title="Gym session" help={RPE_HELP}>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold uppercase">Date<Input type="date" value={manualDay} max={today} onChange={(e) => setManualDay(e.target.value)} /></label>
              <label className="block text-xs font-semibold uppercase">Start time<Input type="time" value={mStart} onChange={(e) => setMStart(e.target.value)} /></label>
              <label className="block text-xs font-semibold uppercase">Duration (min)<Input type="number" inputMode="numeric" min={1} max={600} value={mMin} onChange={(e) => setMMin(e.target.value)} /></label>
              <label className="block text-xs font-semibold uppercase">Average HR (optional)<Input type="number" inputMode="numeric" min={30} max={230} value={mHr} onChange={(e) => setMHr(e.target.value)} /></label>
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide">Session RPE (1-10)</div>
            <Slider min={1} max={10} step={1} value={[rpe]} onValueChange={([v]) => setRpe(v)} aria-label="Session RPE" />
            <p className="text-sm">{rpe} · {RPE_LABELS[rpe]}{mMin ? <span className="text-muted-foreground"> · session load about {rpe * Number(mMin)}</span> : null}</p>
          </Sec>
          <Sec title="Feel" help={FEEL_HELP}>
            <Opts cols={5} opts={FEEL} value={feel === null ? null : feel - 1} onPick={(i) => setFeel(i + 1)} />
          </Sec>
          {liftCard}
          <Sec title="Sore muscles, joint pain and pump">
            <BodyMapEditor sex={figureSex(p.sex)} modes={LIFT_MODES} value={body} onChange={setBody}
              help="Pick a mode, then tap a muscle (or a joint for joint pain) and set the level. Saved to this session only. A log of how it felt, not medical advice." />
          </Sec>
          <Sec title="Note"><Input type="text" maxLength={300} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></Sec>
          <p className="text-xs text-muted-foreground">Saving adds this session to intervals.icu (as a weight training activity) when you are connected, so it counts toward your Load.</p>
        </>
      )}

      {a && !manual && (
        <>
          <Sec title={a.name || a.type} help={RPE_HELP}>
            <p className="text-xs text-muted-foreground">{niceDay(a.day)} · {Math.round((a.moving_time ?? 0) / 60)} min{a.load != null ? ` · load ${Math.round(a.load)}` : ''}</p>
            <div className="text-xs font-semibold uppercase tracking-wide">Session RPE (1-10)<Auto on={autoRpe && !touched.rpe} /></div>
            <Slider min={1} max={10} step={1} value={[rpe]} onValueChange={([v]) => { setRpe(v); touch('rpe'); }} aria-label="Session RPE" />
            <p className="text-sm">{rpe} · {RPE_LABELS[rpe]}</p>
          </Sec>

          <Sec title="Feel" help={FEEL_HELP}>
            <Opts cols={5} opts={FEEL} value={feel === null ? null : feel - 1} onPick={(i) => { setFeel(i + 1); touch('feel'); }} />
            {autoFeel && !touched.feel && <p className="text-xs"><Auto on /></p>}
          </Sec>

          {kind === 'ride' && (
            <Sec title="Ride conditions" help="Compare a ride only with rides done in similar conditions, so EF, decoupling, tests and durability stay fair. Lines marked Auto were filled in from intervals.icu and your check-in. Tap a line to flip ✓ / ✕, then tap All good. Tests and races add 4 more checks.">
              <div className="grid grid-cols-2 gap-1.5">
                {(['z2', 'test'] as const).map((m) => <button key={m} type="button" onClick={() => { setMode(m); touch('mode'); }} className={cn('rounded-md border px-2 py-1.5 text-sm', mode === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{m === 'z2' ? 'Zone 2 / steady' : 'Test or race'}</button>)}
              </div>
              <div className="divide-y">
                {keys.map((k) => <CondRow key={k} on={!!cond[k]} auto={!!guess.why[k] && prev?.data.c?.[k] === undefined && !touched['c' + k]} label={COND_INFO[k][mode === 'test' ? 1 : 0]} why={guess.why[k]} info={COND_INFO[k][mode === 'test' ? 3 : 2]} onFlip={() => { setCond({ ...cond, [k]: !cond[k] }); touch('c' + k); }} />)}
              </div>
              <Button type="button" variant="outline" className="w-full" disabled={saving} onClick={() => save(true)}>✓ All good: save checklist</Button>
              <Accordion type="single" collapsible defaultValue={carbs || temp ? 'n' : undefined}><AccordionItem value="n" className="border-b-0">
                <AccordionTrigger className="py-2 text-sm text-muted-foreground">Add numbers (optional)</AccordionTrigger>
                <AccordionContent className="space-y-2">
                  <label className="block text-xs font-semibold uppercase">Room / outdoor temp (°C)<Auto on={!!guess.temp && prev?.data.temp == null && !touched.temp} /><Input type="number" inputMode="decimal" value={temp} onChange={(e) => { setTemp(e.target.value); touch('temp'); }} /></label>
                  <label className="block text-xs font-semibold uppercase">Carbs per hour (g)<Input type="number" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></label>
                </AccordionContent>
              </AccordionItem></Accordion>
            </Sec>
          )}

          {kind === 'lift' && liftCard}

          {kind !== 'ride' && (
            <Sec title={kind === 'lift' ? 'Sore muscles, joint pain and pump' : 'Sore muscles and joint pain'}>
              <BodyMapEditor sex={figureSex(p.sex)} modes={kind === 'lift' ? LIFT_MODES : OTHER_MODES} value={body} onChange={setBody}
                help="Pick a mode, then tap a muscle (or a joint for joint pain) and set the level. Saved to this activity only: your morning check-in still sets the day's soreness and injury. A log of how it felt, not medical advice." />
            </Sec>
          )}

          <Sec title="Note"><Input type="text" maxLength={300} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></Sec>
        </>
      )}
      {(a || manual) && <Button type="button" className="w-full" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save'}</Button>}
    </div>
  );
}

function CondRow({ on, auto, label, why, info, onFlip }: { on: boolean; auto: boolean; label: string; why?: string; info: string; onFlip: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onFlip} aria-label="Flip" className={cn('h-7 w-7 shrink-0 rounded-full border text-sm font-bold', on ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600')}>{on ? '✓' : '✕'}</button>
        <button type="button" onClick={onFlip} className="flex-1 text-left text-sm">{label}<Auto on={auto} />{why && <small className="block text-xs text-muted-foreground">{why}</small>}</button>
        <button type="button" aria-label="Why this matters" onClick={() => setOpen(!open)} className="h-6 w-6 shrink-0 rounded-full border text-xs text-muted-foreground">?</button>
      </div>
      {open && <p className="mt-1 pl-9 text-xs text-muted-foreground">{info}</p>}
    </div>
  );
}
