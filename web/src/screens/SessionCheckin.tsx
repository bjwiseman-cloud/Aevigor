// "After a session", ported from the live app: pick a session from the last 7 days, rate session RPE (copied to
// intervals.icu), then the ride conditions checklist (rides) or top sets, sore muscles, joint pain and pump (lifting).
import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addDays } from '@rules';
import { callApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { niceDay, todayIn } from '@/lib/time';
import { useProfile, useSessionLogs, useWellness, useCheckins } from '@/hooks/data';
import { useActivities } from '@/hooks/perf';
import { isRide, isRun, n, type Activity } from '@/lib/perf';
import { e1rm } from '@/lib/lifting';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { shortDay } from '@/components/charts';
import { cn } from '@/lib/utils';
import { CheckinSeg } from '@/screens/Checkin';

const RPE_LABELS = ['', 'Very easy', 'Easy', 'Moderate', 'Somewhat hard', 'Hard', 'Hard+', 'Very hard', 'Very hard+', 'Near max', 'Max'];
const PERF = ['Much worse', 'Worse', 'Usual', 'Better', 'Much better'];
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Glutes', 'Quads', 'Hamstrings', 'Calves'];
const MUSCLE_LEVELS = ['None', 'Mild', 'Moderate', 'Very'];
const JOINTS = ['Shoulder', 'Elbow', 'Wrist', 'Low back', 'Hip', 'Knee', 'Ankle', 'Other'];
const PUMP = ['None', 'Some', 'Good', 'Great'];
const LIFTS = ['Squat', 'Bench', 'Deadlift', 'Other'];
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
const icon = (a: Activity) => (isRide(a) ? '🚴' : isLift(a) ? '🏋️' : isRun(a) ? '🏃' : '🏸');
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
function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><CardContent className="space-y-2 py-3"><b>{title}</b>{children}</CardContent></Card>;
}

type TopSet = { lift: string; kg: string; reps: string; rir: string };

export function SessionCheckin() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const acts = useActivities(p), logs = useSessionLogs(p), wellness = useWellness(p), checkins = useCheckins(p);
  const qc = useQueryClient();
  const recent = useMemo(() => (acts.data ?? []).filter((a) => a.day >= addDays(today, -6) && (a.moving_time ?? 0) >= 900)
    .sort((a, b) => String(b.start_local ?? b.day).localeCompare(String(a.start_local ?? a.day))), [acts.data, today]);
  const logged = (a: Activity) => (logs.data ?? []).some((l) => l.activity_id === a.id);
  const [id, setId] = useState<string | null>(null);
  const a = recent.find((x) => x.id === id) ?? recent.find((x) => !logged(x)) ?? recent[0];
  const prev = (logs.data ?? []).find((l) => l.activity_id === a?.id);
  const kind: 'ride' | 'lift' | 'other' = a ? (isRide(a) ? 'ride' : isLift(a) ? 'lift' : 'other') : 'other';

  const [rpe, setRpe] = useState(5);
  const [perf, setPerf] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'z2' | 'test'>('z2');
  const [cond, setCond] = useState<Record<string, boolean>>({});
  const [temp, setTemp] = useState(''), [carbs, setCarbs] = useState('');
  const [sets, setSets] = useState<TopSet[]>([]);
  const [sore, setSore] = useState<Record<string, number>>({});
  const [joint, setJoint] = useState(0), [jointWhere, setJointWhere] = useState<string | null>(null), [pump, setPump] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!a) return;
    const d = prev?.data ?? {};
    setRpe(prev?.rpe ?? (n(a, 'icu_rpe') ? Math.round(n(a, 'icu_rpe')!) : 5));
    setPerf(d.perf ? d.perf - 1 : null); setNote(prev?.note ?? '');
    setMode(d.mode ?? (guess.isTest ? 'test' : 'z2'));
    setCond({ ...guess.val, ...(d.c ?? {}) });
    setTemp(d.temp != null ? String(d.temp) : guess.temp); setCarbs(d.carbs != null ? String(d.carbs) : '');
    setSets([0, 1, 2].map(() => ({ lift: '', kg: '', reps: '', rir: '' })));
    setSore(d.sore ?? {}); setJoint(d.joint ?? 0); setJointWhere(d.jointWhere ?? null); setPump(d.pump ?? null);
  }, [a?.id, prev, guess]);

  if (acts.isLoading || logs.isLoading) return <><CheckinSeg on="session" /><p className="text-muted-foreground">Loading…</p></>;
  if (!a) return (
    <><CheckinSeg on="session" /><Card><CardContent className="py-4"><b>No sessions in the last 7 days</b><p className="text-xs text-muted-foreground">Sessions of 15 min or more from intervals.icu show here. Pull down to sync.</p></CardContent></Card></>
  );

  const keys = [...COND_KEYS, ...(mode === 'test' ? COND_TEST_KEYS : [])];
  const topSets = sets.filter((s) => s.lift && Number(s.kg) > 0 && Number(s.reps) >= 1);
  const e1 = topSets.map((s) => { const t = Number(s.reps) + (Number(s.rir) || 0); const v = t <= 12 ? e1rm(Number(s.kg), t) : null; return `${s.lift}: ${v ? `e1RM ${Math.round(v * 2) / 2} kg` : 'over 12 reps, not estimated'}`; });

  async function save(allGood = false) {
    setSaving(true);
    try {
      const data: Record<string, unknown> = { perf: perf === null ? null : perf + 1 };
      if (kind === 'ride') Object.assign(data, { mode, c: Object.fromEntries(keys.map((k) => [k, !!cond[k]])), temp, carbs: carbs === '' && allGood && cond.fuel && guess.usualCarbs !== null ? guess.usualCarbs : carbs });
      if (kind === 'lift') Object.assign(data, { sore, joint, jointWhere, pump });
      const r = await callApi<{ copied: boolean }>('session', { id: a.id, kind, rpe, note, data });
      if (kind === 'lift' && topSets.length) {
        await supabase.from('lift_sets').delete().eq('day', a.day).eq('source', 'session');
        const { error } = await supabase.from('lift_sets').insert(topSets.map((s, i) => ({
          day: a.day, exercise: s.lift, set_no: i + 1, reps: Math.round(Number(s.reps)), weight: Math.round(Number(s.kg) * 4) / 4,
          rir: s.rir === '' ? null : Math.max(0, Math.min(10, Math.round(Number(s.rir)))), warmup: false, note: null, source: 'session'
        })));
        if (error) throw error;
      }
      toast.success(r.copied ? 'Saved. RPE copied to intervals.icu' : 'Saved to this session');
      await qc.invalidateQueries({ queryKey: ['session_logs'] }); await qc.invalidateQueries({ queryKey: ['lift_sets'] });
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  const item = (x: Activity) => (
    <button key={x.id} type="button" onClick={() => setId(x.id)} className={cn('flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm', x.id === a.id ? 'border-primary bg-muted' : 'bg-card')}>
      <span>{icon(x)} {x.name || x.type}<br /><small className="text-muted-foreground">{shortDay(x.day)} · {Math.round((x.moving_time ?? 0) / 60)} min</small></span>
      <small className="text-muted-foreground">{logged(x) ? '✓ logged' : 'not logged'}</small>
    </button>
  );
  const ai = recent.indexOf(a), first = recent.slice(0, Math.max(3, ai + 1)), rest = recent.slice(first.length);

  return (
    <div className="space-y-3">
      <CheckinSeg on="session" />
      <Sec title="Pick a session">
        <div className="space-y-1.5">{first.map(item)}</div>
        {rest.length > 0 && (
          <Accordion type="single" collapsible><AccordionItem value="r" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm text-muted-foreground">Earlier this week ({rest.length})</AccordionTrigger>
            <AccordionContent className="space-y-1.5">{rest.map(item)}</AccordionContent>
          </AccordionItem></Accordion>
        )}
      </Sec>

      <Sec title={`${icon(a)} ${a.name || a.type}`}>
        <p className="text-xs text-muted-foreground">{niceDay(a.day)} · {Math.round((a.moving_time ?? 0) / 60)} min{a.load != null ? ` · load ${Math.round(a.load)}` : ''}</p>
        <div className="text-xs font-semibold uppercase tracking-wide">Session RPE · how hard was the whole session? (1-10)</div>
        <Slider min={1} max={10} step={1} value={[rpe]} onValueChange={([v]) => setRpe(v)} aria-label="Session RPE" />
        <p className="text-sm">{rpe} · {RPE_LABELS[rpe]}</p>
        <p className="text-xs text-muted-foreground">Session RPE (Foster CR-10): how hard the whole session felt, rated about 30 min after it ended. RPE × minutes gives the session load used for lifting and badminton. Saved to this activity in intervals.icu.</p>
      </Sec>

      {kind === 'ride' && (
        <Sec title="🚴 Ride conditions">
          <p className="text-xs text-muted-foreground">Compare a ride only with rides done in similar conditions, so EF, decoupling, tests and durability stay fair. Each line is filled in from intervals.icu and your check-in. Tap a line to flip ✓ / ✕, then tap All good.</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(['z2', 'test'] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={cn('rounded-md border px-2 py-1.5 text-sm', mode === m ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>{m === 'z2' ? 'Zone 2 / steady' : 'Test or race'}</button>)}
          </div>
          {mode === 'test' && <p className="text-xs text-muted-foreground">Tests and races add 4 more checks.</p>}
          <div className="divide-y">
            {keys.map((k) => <CondRow key={k} on={!!cond[k]} label={COND_INFO[k][mode === 'test' ? 1 : 0]} why={guess.why[k]} info={COND_INFO[k][mode === 'test' ? 3 : 2]} onFlip={() => setCond({ ...cond, [k]: !cond[k] })} />)}
          </div>
          <Button type="button" variant="outline" className="w-full" disabled={saving} onClick={() => save(true)}>✓ All good: save checklist</Button>
          <p className="text-xs text-muted-foreground">Saves every line as shown. Flip any that were different first.</p>
          <div className="text-xs font-semibold uppercase tracking-wide">How did it go? (vs usual for this ride)</div>
          <Opts cols={5} opts={PERF} value={perf} onPick={setPerf} />
          <Accordion type="single" collapsible defaultValue={carbs || temp ? 'n' : undefined}><AccordionItem value="n" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm text-muted-foreground">Add numbers (optional)</AccordionTrigger>
            <AccordionContent className="space-y-2">
              <label className="block text-xs font-semibold uppercase">Room / outdoor temp (°C)<Input type="number" inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} /></label>
              <label className="block text-xs font-semibold uppercase">Carbs per hour (g)<Input type="number" inputMode="numeric" value={carbs} onChange={(e) => setCarbs(e.target.value)} /></label>
            </AccordionContent>
          </AccordionItem></Accordion>
        </Sec>
      )}

      {kind === 'lift' && (
        <>
          <Sec title="🏋️ Top sets">
            <p className="text-xs text-muted-foreground">Your heaviest set of each main lift. RIR = reps in reserve. e1RM = kg × (1 + (reps + RIR) ÷ 30), the Epley formula, for 12 or fewer total reps. Saved to your lifting log.</p>
            <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-1.5 text-[11px] text-muted-foreground"><span>LIFT</span><span>KG</span><span>REPS</span><span>RIR</span></div>
            {sets.map((s, i) => (
              <div key={i} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-1.5">
                <select className="h-9 rounded-md border bg-card px-1 text-sm" value={s.lift} onChange={(e) => setSets(sets.map((x, j) => (j === i ? { ...x, lift: e.target.value } : x)))} aria-label="Lift">
                  <option value="" />{LIFTS.map((l) => <option key={l}>{l}</option>)}
                </select>
                {(['kg', 'reps', 'rir'] as const).map((f) => <Input key={f} type="number" inputMode="decimal" placeholder={f} value={s[f]} onChange={(e) => setSets(sets.map((x, j) => (j === i ? { ...x, [f]: e.target.value } : x)))} aria-label={f} />)}
              </div>
            ))}
            <p className="text-xs">{e1.length ? e1.join(' · ') : 'Enter a top set to see its estimated 1-rep max.'}</p>
          </Sec>
          <Sec title="💪 Sore muscles">
            <p className="text-xs text-muted-foreground">Tap a muscle to step through None, Mild, Moderate and Very.</p>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLES.map((m) => { const l = sore[m] ?? 0; return (
                <button key={m} type="button" onClick={() => { const nx = (l + 1) % 4; const s = { ...sore }; if (nx) s[m] = nx; else delete s[m]; setSore(s); }}
                  className={cn('rounded-full border px-2.5 py-1 text-xs', l ? 'border-primary bg-muted' : 'bg-card')}>{m}{l ? ` · ${MUSCLE_LEVELS[l]}` : ''}</button>
              ); })}
            </div>
          </Sec>
          <Sec title="🦴 Joint pain">
            <Slider min={0} max={10} step={1} value={[joint]} onValueChange={([v]) => setJoint(v)} aria-label="Joint pain" />
            <p className="text-sm">{joint ? `${joint} / 10` : 'None'}</p>
            {joint > 0 && <Opts cols={4} opts={JOINTS} value={jointWhere ? JOINTS.indexOf(jointWhere) : null} onPick={(i) => setJointWhere(JOINTS[i])} />}
            <p className="text-xs text-muted-foreground">0 = none, 10 = worst. A log of how it felt. Not medical advice.</p>
          </Sec>
          <Sec title="🎈 Pump"><Opts cols={4} opts={PUMP} value={pump} onPick={setPump} /></Sec>
          <Sec title="📈 How did it go?"><Opts cols={5} opts={PERF} value={perf} onPick={setPerf} /></Sec>
        </>
      )}

      {kind === 'other' && <Sec title="📈 How did it go?"><Opts cols={5} opts={PERF} value={perf} onPick={setPerf} /></Sec>}

      <Sec title="🗒️ Note"><Input type="text" maxLength={300} placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} /></Sec>
      <Button type="button" className="w-full" disabled={saving} onClick={() => save()}>{saving ? 'Saving…' : 'Save session'}</Button>
    </div>
  );
}

function CondRow({ on, label, why, info, onFlip }: { on: boolean; label: string; why?: string; info: string; onFlip: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-2">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onFlip} aria-label="Flip" className={cn('h-7 w-7 shrink-0 rounded-full border text-sm font-bold', on ? 'border-green-600 text-green-600' : 'border-red-600 text-red-600')}>{on ? '✓' : '✕'}</button>
        <button type="button" onClick={onFlip} className="flex-1 text-left text-sm">{label}{why && <small className="block text-xs text-muted-foreground">{why}</small>}</button>
        <button type="button" aria-label="Why this matters" onClick={() => setOpen(!open)} className="h-6 w-6 shrink-0 rounded-full border text-xs text-muted-foreground">?</button>
      </div>
      {open && <p className="mt-1 pl-9 text-xs text-muted-foreground">{info}</p>}
    </div>
  );
}
