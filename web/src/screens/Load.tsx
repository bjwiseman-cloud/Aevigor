// Load tab, matching the live app's redesign (Ben 2026-11-18, Apps Script V16-V18):
// sport chips (Cycling, Running, Lifting, Combined, More sports) · Next test · Training status (glowing word, or a ribbon over a range) ·
// Fitness/Fatigue (shaded, no load bars) · Form · Ramp rate · one slider for all three · actual vs planned this week.
import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Chip, Chips } from '@/components/chips';
import { HowToRead, axis, shortDay, tooltipStyle } from '@/components/charts';
import { useCalendar, useCheckins, useDailyLoad, usePlannedTests, useProfile, useWellness, LOAD_BACK } from '@/hooks/data';
import { useActivities } from '@/hooks/perf';
import { pmc, type PmcPoint } from '@/lib/metrics';
import { isRide, isRun, testResults } from '@/lib/perf';
import { WeekLoadTypes } from '@/components/Compare';
import { TS_ORDER, mergeDays, statusColor, trainingStatus, weekPct, type Status } from '@/lib/training-status';
import { todayIn } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useSets, useUnit } from '@/hooks/lifting';
import { Volume } from '@/screens/training/liftCards';
import { HelpQ } from '@/components/HelpQ';
import { Arrange } from '@/components/Arrange';
import { SorenessCard } from '@/components/SorenessMap';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

const FIT = '#14b8a6', FAT = '#fb7185', ACT = '#8b5cf6', PLAN = '#f59e0b';
type Zone = [number, number, string, string];
const FORM_Z: Zone[] = [[-999, -30, '#ef4444', 'High risk'], [-30, -10, '#22c55e', 'Optimal'], [-10, 5, '#94a3b8', 'Grey zone'], [5, 20, '#3b82f6', 'Fresh'], [20, 999, '#f59e0b', 'Transition']];
const RAMP_Z: Zone[] = [[-999, 0, '#94a3b8', 'Dropping'], [0, 3, '#3b82f6', 'Gentle'], [3, 7, '#22c55e', 'Ideal'], [7, 8, '#f59e0b', 'Fast'], [8, 999, '#ef4444', 'Too fast']];
const zoneOf = (z: Zone[], v: number) => z.find((x) => v < x[1]) ?? z[z.length - 1];
const RANGES: [string, string][] = [['t', 'Today'], ['7', 'Week'], ['30', 'Month'], ['42', '42 d'], ['90', '3 mo'], ['c', 'Custom']];
const LABEL: Record<string, string> = { ride: 'Cycling', run: 'Running', mix: 'Combined', all: 'All sports', WeightTraining: 'Lifting', Workout: 'Other workout' };
const sportLabel = (k: string) => LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2');
const markOf = (kind: string) => (/test/.test(kind) ? '🎯' : /Race/.test(kind) ? '🏁' : '📅');
const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monday = (d: string) => addDays(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));

// A vertical gradient that colours a line by zone. Offsets follow the plotted values' own top and bottom,
// which is the box the browser uses for objectBoundingBox gradients.
function ZoneGradient({ id, values, zones }: { id: string; values: (number | null)[]; zones: Zone[] }) {
  const v = values.filter((x): x is number => x != null);
  if (!v.length) return null;
  const hi = Math.max(...v), lo = Math.min(...v), span = hi - lo || 1;
  const stops: { o: number; c: string }[] = [];
  [...zones].reverse().forEach((z) => {
    const top = Math.min(hi, z[1]), bot = Math.max(lo, z[0]);
    if (top <= bot && !(hi === lo && lo >= z[0] && lo < z[1])) return;
    stops.push({ o: (hi - top) / span, c: z[2] }, { o: (hi - bot) / span, c: z[2] });
  });
  return <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">{stops.map((s, i) => <stop key={i} offset={Math.min(1, Math.max(0, s.o))} stopColor={s.c} />)}</linearGradient>;
}

// Today's training status as a colourful, gently animated tile in its Garmin-style colour
// (Ben 2026-11-23: same playful look as Achievements; replaces the glowing word)
const TS_ICON: Record<string, string> = { Detraining: '📉', Recovery: '🔋', Peaking: '🏔️', Maintaining: '⚖️', Productive: '🚀', Unproductive: '🌀', Strained: '⚠️', Overreaching: '🛑', Paused: '⏸️' };
function StatusWord({ st }: { st: Status }) {
  const idx = TS_ORDER.findIndex((t) => t[0] === st.word);
  const col = idx >= 0 ? TS_ORDER[idx][1] : '#9ca3af';
  const desc = idx >= 0 ? TS_ORDER[idx][2] : st.word === 'Paused' ? 'You logged being sick, so training status is paused until you are well.' : 'Needs about 6 weeks of training history.';
  const dark = st.word === 'Maintaining';
  return (
    <div className="space-y-3 py-1">
      <div role="img" aria-label={`Training status: ${st.word}`}
        className={cn('relative overflow-hidden rounded-2xl px-4 py-5 text-center shadow-lg animate-pop motion-reduce:animate-none', dark ? 'text-amber-950' : 'text-white')}
        style={{ background: `linear-gradient(135deg, ${col}cc 0%, ${col} 45%, ${col}ee 100%)` }}>
        <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/40 blur-2xl animate-breathe motion-reduce:animate-none" />
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden" />
        <div className="relative text-4xl leading-none animate-float motion-reduce:animate-none">{TS_ICON[st.word] ?? '⏳'}</div>
        <div className="relative mt-2 font-display text-4xl font-extrabold uppercase italic leading-none tracking-wide drop-shadow-sm">{st.word}</div>
        <p className="relative mt-2 text-sm opacity-95">{desc}</p>
      </div>
      <StatusLegend on={(w) => w === st.word} />
      <div className="flex flex-wrap justify-center gap-1.5">{st.chips.map(([t, flag]) => <span key={t} className={cn('rounded-full border px-2 py-0.5 text-xs', flag && 'border-status-caution text-status-caution')}>{t}</span>)}</div>
    </div>
  );
}

function StatusLegend({ on }: { on: (w: string) => boolean }) {
  return <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs">{TS_ORDER.map((t) => <span key={t[0]} className={cn('inline-flex items-center gap-1', !on(t[0]) && 'opacity-50')}><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t[1] }} />{t[0]}</span>)}</div>;
}

function Ribbon({ hist, days, sel }: { hist: Status[]; days: string[]; sel: number }) {
  const n = days.length; if (!n) return <p className="text-sm text-muted-foreground">No status history for this range.</p>;
  const W = 400, bw = W / n, cnt: Record<string, number> = {};
  hist.forEach((h) => { cnt[h.word] = (cnt[h.word] ?? 0) + 1; });
  const cur = hist[Math.min(sel, n - 1)];
  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${W} 30`} preserveAspectRatio="none" className="h-8 w-full">
        {hist.map((h, k) => <rect key={k} x={k * bw} y={k === sel ? 0 : 4} width={Math.max(1, bw - (n > 60 ? 0 : 1.5))} height={k === sel ? 30 : 22} rx={n > 60 ? 0 : 3} fill={statusColor(h.word)} opacity={TS_ORDER.some((t) => t[0] === h.word) ? 1 : 0.35} />)}
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground"><span>{shortDay(days[0])}</span><span>{shortDay(days[n - 1])}</span></div>
      {cur && <p className="text-sm"><b>{shortDay(days[Math.min(sel, n - 1)])}</b>: <b style={{ color: statusColor(cur.word) }}>{cur.word}</b>{(cur.perf.length || cur.sym.length) ? <><br /><span className="text-xs text-muted-foreground">{[...cur.perf, ...cur.sym].join(', ')}</span></> : null}</p>}
      <StatusLegend on={(w) => !!cnt[w]} />
      <div className="flex flex-wrap justify-center gap-1.5 text-xs">{TS_ORDER.filter((t) => cnt[t[0]]).map((t) => <span key={t[0]} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: t[1] }} />{t[0]} {cnt[t[0]]} d</span>)}</div>
    </div>
  );
}

const M = { top: 8, right: 6, bottom: 0, left: -18 };

export function Load() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const load = useDailyLoad(p), tests = usePlannedTests(p), cal = useCalendar(p), acts = useActivities(p), wellness = useWellness(p), checkins = useCheckins(p), lifts = useSets();
  const [liftUnit] = useUnit();
  const [pick, setPick] = useState<string | null>(null);
  const [R, setR] = useState('t');
  const [cf, setCf] = useState(''), [ct, setCt] = useState('');
  const [pj, setPj] = useState(true);
  const [tIdx, setTIdx] = useState<number | null>(null);
  const [selDay, setSelDay] = useState<string | null>(null);
  const [liftMap, setLiftMap] = useState<'volume' | 'sore'>('volume');

  const rows = load.data ?? [];
  const avail = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { if (r.day <= today && r.sessions > 0) c[r.sport] = (c[r.sport] ?? 0) + r.sessions; });
    const keys = Object.keys(c).sort((a, b) => c[b] - c[a]);
    ['ride', 'run'].forEach((k) => { if (!keys.includes(k)) keys.push(k); });
    return { c, keys };
  }, [rows, today]);
  // Fixed chips: Cycling, Running, Lifting, Combined (opens first). Every other intervals.icu sport sits under More sports.
  const FIXED = ['ride', 'run', 'WeightTraining'];
  const shown = avail.keys.filter(Boolean);
  const sport = pick ?? 'mix';
  const others = shown.filter((k) => !FIXED.includes(k));

  const ahead = useMemo(() => (cal.data ?? []).filter((c) => c.day > today && c.day <= addDays(today, 180)), [cal.data, today]);
  const defTarget = Math.max(0, ahead.findIndex((c) => c.kind !== 'Event'));
  const target = ahead.length ? ahead[tIdx ?? defTarget] : null;
  const horizon = ahead.length && ahead[ahead.length - 1].day > addDays(today, 14) ? ahead[ahead.length - 1].day : addDays(today, 14);
  const from = addDays(today, -LOAD_BACK);
  const all = useMemo(() => pmc(rows, sport === 'mix' ? shown : sport, from, horizon, today), [rows, sport, shown.join(), from, horizon, today]);
  const allSports = useMemo(() => pmc(rows, 'all', from, horizon, today), [rows, from, horizon, today]);
  const iToday = all.findIndex((x) => x.day === today);
  const iTarget = target ? all.findIndex((x) => x.day === target.day) : -1;

  // Visible window, as in the live app: Today = last 42 days; ranges count back from today; projection extends to the target
  const end = pj && iTarget > iToday ? iTarget : iToday;
  let a0: number, a1: number;
  if (R === 'c' && cf && ct) { const i0 = all.findIndex((x) => x.day >= (cf < ct ? cf : ct)), i1 = all.findIndex((x) => x.day >= (cf < ct ? ct : cf)); a0 = Math.max(0, i0); a1 = i1 < 0 ? all.length - 1 : i1; }
  else { a1 = end; a0 = Math.max(0, iToday - (R === 't' ? 42 : Number(R) || 42) + 1); }
  let sel = selDay ? all.findIndex((x) => x.day === selDay) : iToday;
  if (sel < a0 || sel > a1) sel = Math.min(a1, Math.max(a0, iToday));
  const win = all.slice(a0, a1 + 1);

  // Training status (all sports), today and day by day for the ribbon
  const statusIn = useMemo(() => ({
    days: mergeDays((wellness.data ?? []) as never[], (checkins.data ?? []) as never[]),
    all: allSports, acts: acts.data ?? [], tests: testResults(tests.data ?? [], acts.data ?? []), lifts: lifts.data ?? []
  }), [wellness.data, checkins.data, allSports, acts.data, tests.data, lifts.data]);
  const status = useMemo(() => trainingStatus(today, statusIn, weekPct(allSports, today)), [statusIn, today, allSports]);
  const ribbonDays = R === 't' ? [] : win.filter((x) => x.day <= today).map((x) => x.day).slice(-120);
  const hist = useMemo(() => ribbonDays.map((d) => (d === today ? status : trainingStatus(d, statusIn, weekPct(allSports, d)))), [ribbonDays.join(), statusIn, status]);

  const marks = (cal.data ?? []).filter((c) => c.day >= (win[0]?.day ?? '') && c.day <= (win[win.length - 1]?.day ?? ''));
  const data = win.map((x, k) => {
    const g = a0 + k, past = g <= iToday, fut = g >= iToday;
    const ramp = x.ramp;
    return { day: x.day, ctlA: past ? x.ctl : null, ctlP: fut ? x.ctl : null, atlA: past ? x.atl : null, atlP: fut ? x.atl : null, formA: past ? x.form : null, formP: fut ? x.form : null, rampA: past ? ramp : null, rampP: fut ? ramp : null };
  });
  const cur: PmcPoint | undefined = all[sel];
  const fz = cur ? zoneOf(FORM_Z, cur.form) : null, rz = cur?.ramp != null ? zoneOf(RAMP_Z, cur.ramp) : null;

  // This week day by day, and the following weeks' plan
  const mon = monday(today);
  const byDay = (d: string) => all.find((x) => x.day === d);
  const week = (st: string) => DN.map((n, j) => { const d = addDays(st, j), pt = byDay(d); return { n, day: d, a: d > today ? null : Math.round(pt?.actual ?? 0), p: Math.round(pt?.planned ?? 0) }; });
  const w0 = week(mon);
  const done = w0.filter((x) => x.a != null), pa = done.reduce((s, x) => s + (x.a ?? 0), 0), pp = done.reduce((s, x) => s + x.p, 0);
  const pct = pp ? Math.round((pa / pp) * 100) : null;
  const [more, setMore] = useState(0);

  const chipsRow = (
    <>
      <Chips>{RANGES.map(([k, l]) => <Chip key={k} on={R === k} onClick={() => { setR(k); if (k === 'c' && !cf) { setCf(addDays(today, -89)); setCt(today); } }}>{l}</Chip>)}</Chips>
      {R === 'c' && <div className="grid grid-cols-2 gap-2"><Input type="date" value={cf} onChange={(e) => setCf(e.target.value)} aria-label="From" /><Input type="date" value={ct} onChange={(e) => setCt(e.target.value)} aria-label="To" /></div>}
    </>
  );
  const marksEls = marks.map((m) => <ReferenceLine key={m.id} x={m.day} stroke="currentColor" strokeOpacity={0.25} strokeDasharray="2 3" label={{ value: markOf(m.kind), position: 'insideTop', fontSize: 12 }} />);
  const selLine = cur ? <ReferenceLine x={cur.day} stroke="currentColor" strokeOpacity={0.6} /> : null;
  const X = <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={24} />;

  if (load.isLoading) return <><SubTabs tabs={TRAINING_TABS} /><p className="text-muted-foreground">Loading…</p></>;
  const hasData = rows.some((r) => r.actual > 0 || r.planned > 0);

  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      <div className="flex flex-wrap items-center gap-1.5">
        {FIXED.map((k) => <Chip key={k} on={sport === k} onClick={() => setPick(k)}>{sportLabel(k)}</Chip>)}
        <Chip on={sport === 'mix'} onClick={() => setPick('mix')}>Combined</Chip>
        {others.length > 0 && (
          <select className="h-8 rounded-full border bg-card px-3 text-sm" value={others.includes(sport) ? sport : ''} onChange={(e) => e.target.value && setPick(e.target.value)} aria-label="More sports">
            <option value="">More sports ▾</option>{others.map((k) => <option key={k} value={k}>{sportLabel(k)}</option>)}
          </select>
        )}
        <span className="ml-auto"><HelpQ text="Combined adds up all your sports. More sports lists every other sport in your intervals.icu history. Add more sports by creating them in intervals.icu > Settings > Sport Settings; they show up here after the next sync." /></span>
      </div>
      {/* Every sport (Ben 2026-11-23): Training status first, then the body map. Lifting shows weekly volume by
          muscle, with soreness and injury one tap away; other sports show soreness and injury. */}

      <Card>
        <CardHeader className="pb-2"><CardTitle help="training-status">Training status</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {chipsRow}
          {R === 't' ? <StatusWord st={status} /> : <Ribbon hist={hist} days={ribbonDays} sel={Math.min(sel - a0, ribbonDays.length - 1)} />}
          <p className="text-xs text-muted-foreground">Uses all your sports. Training guidance, not medical advice.</p>
        </CardContent>
      </Card>
      {sport === 'WeightTraining' && (
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {([['volume', 'Volume by muscle'], ['sore', 'Soreness and injury']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setLiftMap(k)} className={cn('flex-1 rounded-md px-2 py-1.5 text-sm', liftMap === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{l}</button>
          ))}
        </div>
      )}
      {sport === 'WeightTraining' && liftMap === 'volume' ? <Volume sets={lifts.data ?? []} unit={liftUnit} ex={null} /> : <SorenessCard />}

      {!hasData && <Card><CardContent className="pt-6 text-sm text-muted-foreground">No training load yet. Tap Sync after your sessions reach intervals.icu. Planned workouts in your intervals.icu calendar show up here too.</CardContent></Card>}

      {/* Default view (Ben 2026-11-23): Training status and the body map only. The charts are under Choose cards. */}
      <Arrange page="load-v2" cards={[
        { id: 'pmc', label: 'Fitness · Fatigue', off: true, node: (
      <Card>
        <CardHeader className="pb-1"><CardTitle help="fitness-fatigue-form">Fitness · Fatigue</CardTitle><p className="text-xs text-muted-foreground">{sport === 'mix' ? `Combined: ${shown.map(sportLabel).join(' + ')}` : sportLabel(sport)}</p></CardHeader>
        <CardContent className="space-y-2">
          {ahead.length > 0 && (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <input type="checkbox" checked={pj} onChange={(e) => setPj(e.target.checked)} /> Projection to
              <select className="h-8 rounded-md border bg-card px-2 text-sm" value={tIdx ?? defTarget} onChange={(e) => { setTIdx(Number(e.target.value)); setPj(true); }}>
                {ahead.map((c, k) => <option key={c.id} value={k}>{c.kind === 'Event' || /Race/.test(c.kind) ? c.name : c.kind} · {shortDay(c.day)}</option>)}
              </select>
            </label>
          )}
          <div className="h-44">
            <ResponsiveContainer>
              <ComposedChart data={data} margin={M}>
                <defs>
                  <linearGradient id="gFit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={FIT} stopOpacity={0.45} /><stop offset="100%" stopColor={FIT} stopOpacity={0.03} /></linearGradient>
                  <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={FAT} stopOpacity={0.3} /><stop offset="100%" stopColor={FAT} stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                {X}<YAxis {...axis} domain={[0, 'auto']} />
                <Tooltip {...tooltipStyle} formatter={(v, name) => [Math.round(Number(v)), String(name)]} />
                <Area dataKey="atlA" name="Fatigue" stroke={FAT} strokeWidth={2} fill="url(#gFat)" connectNulls isAnimationActive={false} />
                <Area dataKey="ctlA" name="Fitness" stroke={FIT} strokeWidth={3} fill="url(#gFit)" connectNulls isAnimationActive={false} />
                <Line dataKey="atlP" name="Fatigue (projected)" stroke={FAT} strokeOpacity={0.5} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
                <Line dataKey="ctlP" name="Fitness (projected)" stroke={FIT} strokeOpacity={0.5} strokeWidth={2.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
                {marksEls}{selLine}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-3 text-xs"><span><i className="mr-1 inline-block h-1 w-4 rounded align-middle" style={{ background: FIT }} />Fitness</span><span><i className="mr-1 inline-block h-1 w-4 rounded align-middle" style={{ background: FAT }} />Fatigue</span>{ahead.length > 0 && <span><i className="mr-1 inline-block h-0.5 w-4 rounded align-middle" style={{ background: FIT + '80' }} />Projected</span>}<span>🎯 test 🏁 race 📅 event</span></div>
        </CardContent>
      </Card>
        ) },
        { id: 'form', label: 'Form', off: true, node: (
        <ZoneChart title="Form" help="form-zones" data={data} keyA="formA" keyP="formP" zones={FORM_Z} ticks={[-30, -10, 5, 20]} lo={-40} hi={25} X={X} extra={<>{marksEls}{selLine}</>} />
        ) },
        { id: 'ramp', label: 'Ramp rate', off: true, node: (
        <ZoneChart title="Ramp rate" help="ramp-rate" data={data} keyA="rampA" keyP="rampP" zones={RAMP_Z} ticks={[0, 3, 8]} lo={-4} hi={12} X={X} extra={<>{marksEls}{selLine}</>} />
        ) },
        { id: 'plan', label: 'Actual vs planned load', off: true, node: (
      <Card>
        <CardHeader className="pb-2"><CardTitle help="load-vs-plan">Actual vs planned load</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="h-36">
            <ResponsiveContainer>
              <BarChart data={w0} margin={M} barGap={2}>
                <defs><pattern id="stripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={PLAN + '22'} /><line x1="0" y1="0" x2="0" y2="6" stroke={PLAN} strokeWidth="2" strokeOpacity={0.55} /></pattern></defs>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="n" {...axis} /><YAxis {...axis} />
                <Tooltip {...tooltipStyle} labelFormatter={(_l, pl) => (pl?.[0] ? shortDay(String(pl[0].payload.day)) : '')} />
                <Bar dataKey="a" name="Actual" fill={ACT} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="p" name="Planned" fill="url(#stripes)" stroke={PLAN} strokeWidth={1.5} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-3 text-xs"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: ACT }} />Actual</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border align-middle" style={{ borderColor: PLAN, background: PLAN + '44' }} />Planned</span></div>
          <WeekLoadTypes acts={(acts.data ?? []).filter((a) => sport === 'mix' || (sport === 'ride' ? isRide(a) : sport === 'run' ? isRun(a) : a.type === sport))} days={w0} />
          <p><b>This week so far</b> · {pa} done of {pp} planned{pct != null && <> · <b style={{ color: Math.abs(pct - 100) <= 10 ? '#22c55e' : Math.abs(pct - 100) <= 20 ? '#eab308' : '#ef4444' }}>{pct}%</b></>}<br />Whole week planned: {w0.reduce((s, x) => s + x.p, 0)}</p>
          {more > 0 && (
            <Accordion type="multiple">
              {Array.from({ length: more }, (_, k) => week(addDays(mon, 7 * (k + 1)))).map((w) => (
                <AccordionItem key={w[0].day} value={w[0].day}>
                  <AccordionTrigger className="py-2 text-sm"><span>Week of {shortDay(w[0].day)}</span><span className="ml-auto mr-2 text-muted-foreground">{w.reduce((s, x) => s + x.p, 0) || '–'} planned</span></AccordionTrigger>
                  <AccordionContent><table className="w-full text-sm"><tbody>{w.map((x) => <tr key={x.day}><td>{x.n} {shortDay(x.day)}</td><td className="text-right font-mono">{x.p || '–'}</td></tr>)}</tbody></table></AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
          <Button variant="outline" size="sm" disabled={more >= 26} onClick={() => setMore(Math.min(26, more + 4))}>{more ? 'Show 4 more weeks ▾' : 'Next 4 weeks ▾'}</Button>
          <HowToRead>This week day by day: what you did next to what intervals.icu has planned. Within 10% of plan is green, within 20% gold. The only load alert on Today is the last 7 days running more than 20% above plan.</HowToRead>
        </CardContent>
      </Card>
        ) }
      ]} />

      {/* Day picker for the charts: pinned to the bottom of the screen while you scroll (Ben 2026-11-19) */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[5] -mx-4 space-y-2 border-t bg-background/95 px-4 py-2 backdrop-blur">
          <Slider min={a0} max={Math.max(a0, a1)} step={1} value={[sel]} onValueChange={([v]) => setSelDay(all[v]?.day ?? null)} aria-label="Pick a day" />
          {cur && (
            <p className="text-xs">
              <b>{shortDay(cur.day)}</b>{sel > iToday ? ' · projected' : sel === iToday ? ' · today' : ''}<br />
              <span style={{ color: FIT }}>Fitness <b>{Math.round(cur.ctl)}</b></span> · <span style={{ color: FAT }}>Fatigue <b>{Math.round(cur.atl)}</b></span> · <span style={{ color: fz?.[2] }}>Form <b>{Math.round(cur.form)}</b> {fz?.[3]}</span><br />
              <span style={{ color: rz?.[2] }}>Ramp <b>{cur.ramp == null ? '–' : cur.ramp}</b>/wk {rz?.[3]}</span> · <span style={{ color: ACT }}>Load <b>{sel > iToday ? '–' : Math.round(cur.actual ?? 0)}</b></span> · <span style={{ color: PLAN }}>planned <b>{Math.round(cur.planned) || '–'}</b></span>
            </p>
          )}
      </div>
    </div>
  );
}

function ZoneChart({ title, help, data, keyA, keyP, zones, ticks, lo, hi, X, extra }: {
  title: string; help: string; data: Record<string, number | string | null>[]; keyA: string; keyP: string; zones: Zone[]; ticks: number[]; lo: number; hi: number; X: JSX.Element; extra: JSX.Element;
}) {
  const vA = data.map((d) => d[keyA] as number | null), vP = data.map((d) => d[keyP] as number | null);
  const all = [...vA, ...vP].filter((v): v is number => v != null);
  const min = Math.min(lo, ...all.map((v) => v - 3)), max = Math.max(hi, ...all.map((v) => v + 3));
  const id = title.replace(/\W/g, '');
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle help={help}>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <div className="h-36">
          <ResponsiveContainer>
            <ComposedChart data={data} margin={M}>
              <defs><ZoneGradient id={`${id}A`} values={vA} zones={zones} /><ZoneGradient id={`${id}P`} values={vP} zones={zones} /></defs>
              {zones.map((z) => <ReferenceArea key={z[3]} y1={Math.max(z[0], min)} y2={Math.min(z[1], max)} fill={z[2]} fillOpacity={0.1} stroke="none" ifOverflow="hidden" />)}
              {X}<YAxis {...axis} domain={[Math.floor(min), Math.ceil(max)]} ticks={ticks} allowDataOverflow />
              <Tooltip {...tooltipStyle} formatter={(v) => [Math.round(Number(v) * 10) / 10, title]} />
              <Line dataKey={keyA} stroke={`url(#${id}A)`} strokeWidth={3.5} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey={keyP} stroke={`url(#${id}P)`} strokeOpacity={0.45} strokeWidth={2.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
              {extra}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">{zones.map((z) => <span key={z[3]}><i className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: z[2] }} />{z[3]}</span>)}</div>
      </CardContent>
    </Card>
  );
}

// Next test, with the Form projected for that day (all sports). Lives on the Calendar tab (Ben 2026-11-23).
export function NextTestCard() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const load = useDailyLoad(p), tests = usePlannedTests(p);
  const next = (tests.data ?? []).find((t) => t.day >= today && t.kind !== 'Durability test') ?? (tests.data ?? []).find((t) => t.day >= today);
  const pts = useMemo(() => (next ? pmc(load.data ?? [], 'all', addDays(today, -LOAD_BACK), next.day > today ? next.day : addDays(today, 1), today) : []), [load.data, next?.day, today]);
  const nextPt = next && pts.find((x) => x.day === next.day);
  const daysTo = next ? Math.round((Date.parse(next.day) - Date.parse(today)) / 864e5) : null;
  const inBand = nextPt && nextPt.form >= 5 && nextPt.form <= 15;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="next-test">Next test</CardTitle></CardHeader>
      <CardContent className="text-sm">
        {next ? (
          <div className="flex items-center gap-4">
            <div className="font-mono text-3xl">{daysTo}<span className="text-sm"> days</span></div>
            <div><b>{next.kind}</b> · {shortDay(next.day)}
              <div className="text-muted-foreground">Projected Form that day: <b style={{ color: inBand ? '#22c55e' : PLAN }}>{nextPt ? Math.round(nextPt.form) : '–'}</b>{' '}
                {next.kind === 'Durability test' ? '(no target band for durability)' : inBand ? '✓ inside the +5 to +15 test band' : '· aim for +5 to +15'}</div>
            </div>
          </div>
        ) : <p className="text-muted-foreground">No test in your intervals.icu plan yet. Name a workout "FTP test", "VO2 test" or "Durability test".</p>}
      </CardContent>
    </Card>
  );
}

// The Load tab's charts for the Trends page (all sports, the Trends window), as in the live app's Trends picker.
export function LoadTrendCards({ from, to, show, selDay }: { from: string; to: string; show: string[]; selDay?: string }) {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const load = useDailyLoad(p);
  const all = useMemo(() => pmc(load.data ?? [], 'all', addDays(today, -LOAD_BACK), to, today), [load.data, today, to]);
  const win = all.filter((x) => x.day >= from && x.day <= to);
  const data = win.map((x) => ({ day: x.day, ctlA: x.ctl, atlA: x.atl, formA: x.form, formP: null as number | null }));
  const X = <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={24} />;
  const selLine = selDay ? <ReferenceLine x={selDay} stroke="currentColor" strokeOpacity={0.6} /> : <></>;
  const monday0 = monday(from);
  const weeks: { w: string; a: number; p: number }[] = [];
  for (let w = monday0; w <= to; w = addDays(w, 7)) {
    const pts = all.filter((x) => x.day >= w && x.day < addDays(w, 7) && x.day <= today);
    weeks.push({ w, a: Math.round(pts.reduce((s, x) => s + (x.actual ?? 0), 0)), p: Math.round(pts.reduce((s, x) => s + x.planned, 0)) });
  }
  if (load.isLoading) return null;
  return (
    <div className="space-y-4">
      {show.includes('pmc') && (
        <Card>
          <CardHeader className="pb-1"><CardTitle help="fitness-fatigue-form">Fitness · Fatigue</CardTitle><p className="text-xs text-muted-foreground">All sports · same as the Load tab</p></CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer>
                <ComposedChart data={data} margin={M}>
                  <defs>
                    <linearGradient id="tFit" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={FIT} stopOpacity={0.45} /><stop offset="100%" stopColor={FIT} stopOpacity={0.03} /></linearGradient>
                    <linearGradient id="tFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={FAT} stopOpacity={0.3} /><stop offset="100%" stopColor={FAT} stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />{X}<YAxis {...axis} domain={[0, 'auto']} />
                  <Tooltip {...tooltipStyle} formatter={(v, name) => [Math.round(Number(v)), String(name)]} />
                  <Area dataKey="atlA" name="Fatigue" stroke={FAT} strokeWidth={2} fill="url(#tFat)" isAnimationActive={false} />
                  <Area dataKey="ctlA" name="Fitness" stroke={FIT} strokeWidth={3} fill="url(#tFit)" isAnimationActive={false} />
                  {selLine}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 text-xs"><span><i className="mr-1 inline-block h-1 w-4 rounded align-middle" style={{ background: FIT }} />Fitness</span><span><i className="mr-1 inline-block h-1 w-4 rounded align-middle" style={{ background: FAT }} />Fatigue</span></div>
          </CardContent>
        </Card>
      )}
      {show.includes('form') && <ZoneChart title="Form zones" help="form-zones" data={data} keyA="formA" keyP="formP" zones={FORM_Z} ticks={[-30, -10, 5, 20]} lo={-40} hi={25} X={X} extra={selLine} />}
      {show.includes('plan') && (
        <Card>
          <CardHeader className="pb-2"><CardTitle help="load-vs-plan">Actual vs planned load</CardTitle><p className="text-xs text-muted-foreground">Week by week, all sports</p></CardHeader>
          <CardContent>
            <div className="h-36">
              <ResponsiveContainer>
                <BarChart data={weeks} margin={M} barGap={2}>
                  <defs><pattern id="tStripes" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill={PLAN + '22'} /><line x1="0" y1="0" x2="0" y2="6" stroke={PLAN} strokeWidth="2" strokeOpacity={0.55} /></pattern></defs>
                  <CartesianGrid vertical={false} strokeOpacity={0.15} />
                  <XAxis dataKey="w" {...axis} tickFormatter={shortDay} /><YAxis {...axis} />
                  <Tooltip {...tooltipStyle} labelFormatter={(l) => `Week of ${shortDay(String(l))}`} />
                  <Bar dataKey="a" name="Actual" fill={ACT} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="p" name="Planned" fill="url(#tStripes)" stroke={PLAN} strokeWidth={1.5} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex gap-3 text-xs"><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: ACT }} />Actual</span><span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border align-middle" style={{ borderColor: PLAN, background: PLAN + '44' }} />Planned</span></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
