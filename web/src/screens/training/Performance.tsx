import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Chips } from '@/components/chips';
import { Arrange } from '@/components/Arrange';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { usePlannedTests, usePref, useProfile, useWellness } from '@/hooks/data';
import { MY_ZONES_KEY, type MyZones } from '@/lib/myzones';
import { RunEfCard, ThresholdCard, Vo2Card, ZonesCard, isLift, settingsFor, sportMatch, usePhaseShade, PhaseKey } from '@/screens/training/perfCards';
import type { Profile } from '@/lib/types';
import { PowerProfileCard, SignatureCard } from '@/components/Compare';
import { useActivities, useCurves, usePaceCurves } from '@/hooks/perf';
import { BEST_SECS, bestEfforts, isRide, isRun, latestWeight, mmss, n, pace, paceRows, secsLabel, testResults, type Activity, type Curve, type PaceCurve } from '@/lib/perf';
import { todayIn } from '@/lib/time';
import type { Unit } from '@/lib/lifting';
import { BestLifts, Strength } from '@/screens/training/liftCards';
import { AchievementsCard } from '@/components/Achievements';
import { UNIT_KEY, useSets } from '@/hooks/lifting';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ANALYSIS_TABS, PERF_TABS, SubTabs } from '@/screens/Layout';

type Range = '30' | '90' | '1y';
const RANGES: { id: Range; label: string; long: string }[] = [{ id: '30', label: '1M', long: 'Last month' }, { id: '90', label: '3M', long: 'Last 3 months' }, { id: '1y', label: '1Y', long: 'Last year' }];
const TABLE_SECS = BEST_SECS.filter((s) => s <= 7200);
type Pt = { watts: number; wkg: number | null; id: string | null; day: string | null };

// Power curve: your best power over the last month, 3 months or year, drawn against your all-time best curve.
// The table lists only all-time bests, each linked to the ride it came from.
function PowerCurve({ rides, curves, today, weight, onOpen, sport = 'ride' }: { rides: Activity[]; curves: Curve[]; today: string; weight: number | null; onOpen: (id: string) => void; sport?: 'ride' | 'run' }) {
  const [range, setRange] = useState<Range>('90');
  const [wkg, setWkg] = useState(false);
  const dayOf = (id: string | null | undefined) => rides.find((r) => r.id === id);
  const fromApi = (c: Curve | undefined) => (s: number): Pt | null => {
    if (!c) return null;
    const i = c.secs.indexOf(s); if (i < 0 || !c.watts[i]) return null;
    const a = dayOf(c.activity_ids?.[i]);
    return { watts: c.watts[i], wkg: c.wkg?.[i] ?? (weight ? +(c.watts[i] / weight).toFixed(2) : null), id: a?.id ?? c.activity_ids?.[i] ?? null, day: a?.day ?? null };
  };
  const fromRides = (list: Activity[]) => { const ef = bestEfforts(list, weight); return (s: number): Pt | null => ef.find((e) => e.secs === s)?.rank[0] ?? null; };
  const recentRides = useMemo(() => rides.filter((r) => r.day >= addDays(today, range === '1y' ? -365 : -Number(range))), [rides, today, range]);
  const apiYear = curves.find((c) => c.sport === sport && c.curve === '1y');
  const apiAll = curves.find((c) => c.sport === sport && c.curve === 'all');
  const recAt = range === '1y' && apiYear ? fromApi(apiYear) : fromRides(recentRides);
  const allAt = apiAll ? fromApi(apiAll) : fromRides(rides);
  const key = wkg ? 'wkg' : 'watts', unit = wkg ? ' W/kg' : ' W';
  // Evenly spaced standard durations (a log-scale chart does not draw reliably in Recharts)
  const plot = BEST_SECS.map((s) => { const r = recAt(s), c = allAt(s); return { label: secsLabel(s), rec: r ? r[key] : null, all: c ? c[key] : null }; }).filter((p) => p.rec != null || p.all != null);
  const recLabel = RANGES.find((r) => r.id === range)!.long;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="power-curve">{sport === 'run' ? 'Running power curve' : 'Power curve'}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chips>{RANGES.map((r) => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}</Chips>
          <span className="ml-auto"><Chips><Chip on={!wkg} onClick={() => setWkg(false)}>Watts</Chip><Chip on={wkg} onClick={() => setWkg(true)}>W/kg</Chip></Chips></span>
        </div>
        {plot.length ? (
          <div className="h-52">
            <ResponsiveContainer>
              <ComposedChart data={plot} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.cyan} stopOpacity={0.45} /><stop offset="100%" stopColor={C.cyan} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => String(l)} formatter={(v, name) => [`${v}${unit}`, String(name)]} />
                <Line type="monotone" dataKey="all" name="All-time best" stroke={C.orange} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                <Area type="monotone" dataKey="rec" name={recLabel} stroke={C.cyan} strokeWidth={2.5} fill="url(#pc)" connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">{sport === 'run' ? 'No runs with power yet. Running power comes from a Stryd pod or a watch that records it; it fills in after the next sync.' : 'No rides with power yet. This fills in after the next sync.'}</p>}
        <Legend items={[{ label: recLabel, color: C.cyan, area: true }, { label: 'All-time best', color: C.orange, dashed: true }]} />
        <div className="text-sm font-semibold">
          <div className="grid grid-cols-3 gap-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground"><span>Effort</span><span>{wkg ? 'W/kg' : 'Watts'}</span><span>Activity</span></div>
          {TABLE_SECS.map((s) => {
            const b = allAt(s);
            if (!b) return null;
            return (
              <div key={s} className="grid grid-cols-3 gap-2 border-t py-1.5">
                <span>{secsLabel(s)}</span>
                <span>{wkg ? b.wkg ?? '–' : b.watts}</span>
                {b.id ? <button type="button" onClick={() => onOpen(b.id!)} className="text-left underline decoration-dotted">{b.day ? shortDay(b.day) : sport === 'run' ? 'Open run' : 'Open ride'}</button> : <span className="text-muted-foreground">–</span>}
              </div>
            );
          })}
        </div>
        <HowToRead>Your best average power for each length of effort. The shaded curve is your best over the range you pick (1M, 3M or 1Y); the dashed curve is your all-time best. Where the two meet, that all-time best was set in the range you picked. The table lists your all-time bests; tap the date to open that ride. W/kg uses the weight saved on each ride in intervals.icu.</HowToRead>
      </CardContent>
    </Card>
  );
}

function Tests({ results }: { results: ReturnType<typeof testResults> }) {
  const [pick, setPick] = useState<Record<string, number>>({});
  if (!results.length) return <Card><CardHeader className="pb-2"><CardTitle help="tests">Test results</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Tests appear here after a planned FTP, VO2 or durability test day in your intervals.icu calendar has a ride with power.</CardContent></Card>;
  const kinds = [...new Set(results.map((r) => r.kind))];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="tests">Test results</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {kinds.map((k) => {
          const list = results.filter((r) => r.kind === k), latest = list[0], prev = list[pick[k] ?? 1];
          const diff = prev ? latest.value - prev.value : null;
          return (
            <div key={k} className="space-y-2">
              <div className="text-sm font-medium">{k} · <span className="text-muted-foreground">{latest.label}</span></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-muted p-2"><div className="text-xs text-muted-foreground">Latest · {shortDay(latest.day)}</div><b className="text-lg">{latest.value} {latest.unit}</b></div>
                <div className="rounded-md bg-muted p-2"><div className="text-xs text-muted-foreground">{prev ? `Compared with ${shortDay(prev.day)}` : 'No earlier test'}</div>{prev && diff != null && <b className="text-lg">{diff >= 0 ? '+' : ''}{diff} W ({((diff / prev.value) * 100).toFixed(1)}%)</b>}</div>
              </div>
              {list.length > 2 && <Chips>{list.slice(1).map((r, i) => <Chip key={r.day} on={(pick[k] ?? 1) === i + 1} onClick={() => setPick({ ...pick, [k]: i + 1 })}>{shortDay(r.day)} · {r.value} W</Chip>)}</Chips>}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function Fitness({ p, rides }: { p: Profile; rides: Activity[] }) {
  const pts = [...rides].reverse().map((r) => ({ day: r.day, eftp: n(r, 'icu_pm_ftp', 'icu_eftp') })).filter((x) => x.eftp);
  const shade = usePhaseShade(p, pts.map((x) => x.day));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="eftp">eFTP</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {pts.length ? (
          <div className="h-44">
            <ResponsiveContainer>
              <AreaChart data={pts} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                <defs><linearGradient id="ef" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.4} /><stop offset="100%" stopColor={C.green} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                {shade.areas}
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} {...axis} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} W`, 'eFTP']} />
                <Area dataKey="eftp" name="eFTP" stroke={C.green} fill="url(#ef)" strokeWidth={2} connectNulls isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">Fills in after rides with power are synced.</p>}
        <PhaseKey on={shade.on} />
        <p className="text-xs text-muted-foreground">Latest eFTP <b className="font-mono">{pts.at(-1)?.eftp ?? '–'} W</b> (intervals.icu's estimate from your rides).</p>
      </CardContent>
    </Card>
  );
}

function EfDecoupling({ p, rides }: { p: Profile; rides: Activity[] }) {
  const pts = [...rides].reverse().filter((r) => (r.moving_time ?? 0) >= 3600).map((r) => ({ day: r.day, ef: n(r, 'icu_efficiency_factor'), dec: n(r, 'decoupling') }));
  const shade = usePhaseShade(p, pts.map((x) => x.day));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="ef-decoupling">Efficiency and decoupling</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {pts.some((p) => p.ef != null || p.dec != null) ? (
          <div className="h-44">
            <ResponsiveContainer>
              <ComposedChart data={pts} margin={{ top: 5, right: -10, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                {shade.areas}
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis yAxisId="ef" domain={['auto', 'auto']} {...axis} />
                <YAxis yAxisId="dec" orientation="right" {...axis} unit="%" />
                <Tooltip {...tooltipStyle} />
                <Bar yAxisId="dec" dataKey="dec" name="Decoupling %" fill={C.orange} fillOpacity={0.5} />
                <Line yAxisId="ef" dataKey="ef" name="EF" stroke={C.cyan} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">Shows rides of 60 minutes or more once synced.</p>}
        <PhaseKey on={shade.on} />
        <Legend items={[{ label: 'Efficiency factor (NP ÷ HR)', color: C.cyan }, { label: 'Decoupling (Pw:HR)', color: C.orange, area: true }]} />
        <HowToRead>EF rising on similar steady rides means more power for the same heart rate. Decoupling is how much heart rate drifts up against power over a ride; about 5% or less on a long steady ride is the usual guide (Friel). Rides of 60 minutes or more only.</HowToRead>
      </CardContent>
    </Card>
  );
}

const PACE_RANGES = [{ id: '84d', label: '84 d' }, { id: '1y', label: 'Year' }, { id: 'all', label: 'All-time' }];

function PaceCurveCard({ curves, acts, onOpen }: { curves: PaceCurve[]; acts: Activity[]; onOpen: (id: string) => void }) {
  const [range, setRange] = useState('84d');
  const c = curves.find((x) => x.curve === range);
  const rows = paceRows(c);
  const dayOf = (id: string | null) => acts.find((a) => a.id === id)?.day;
  const cs = c?.critical_speed ?? null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="pace-curve">Pace curve</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Chips>{PACE_RANGES.map((r) => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}</Chips>
        {rows.length ? (
          <div className="h-52">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 5, right: 8, left: -6, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
                <YAxis {...axis} reversed domain={['dataMin - 10', 'dataMax + 10']} tickFormatter={(v) => mmss(Number(v))} width={46} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${mmss(Number(v))} /km`, 'Best pace']} />
                {cs && <ReferenceLine y={Math.round(1000 / cs)} stroke={C.orange} strokeDasharray="4 3" />}
                <Line type="monotone" dataKey="paceSec" stroke={C.cyan} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">{curves.length ? 'No runs at these distances in this range.' : 'Fills in after the next sync, once you have runs in intervals.icu.'}</p>}
        {cs && <p className="text-sm">Critical speed pace <b className="font-mono">{pace(cs)}</b> <span className="text-muted-foreground">(dashed line)</span></p>}
        {!!rows.length && (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Best efforts</th><th>Time</th><th>Pace /km</th><th>Date</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.meters} className="border-t">
                <td className="py-1">{r.label}</td>
                <td className="text-center font-mono">{mmss(r.secs)}</td>
                <td className="text-center font-mono">{mmss(r.paceSec)}</td>
                <td className="text-center text-xs text-muted-foreground">{dayOf(r.activity) ? <button type="button" className="underline decoration-dotted" onClick={() => onOpen(r.activity!)}>{shortDay(dayOf(r.activity)!)}</button> : '–'}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <HowToRead>Your fastest time for each distance, from any run (it can be part of a longer run). Faster pace is higher on the chart. Critical speed is intervals.icu's estimate, from your curve, of the fastest pace that is still steady for your body; most runners can hold it for roughly 20 to 40 minutes. Real pace, not adjusted for hills.</HowToRead>
      </CardContent>
    </Card>
  );
}

const FIXED = [{ id: 'ride', label: '🚴 Cycling' }, { id: 'run', label: '🏃 Running' }, { id: 'lift', label: '🏋️ Lifting' }];
const typeLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2');

// Performance by sport (Ben 2026-11-19): Cycling, Running and Lifting chips, every other sport under More sports.
// Each sport has its own card list: press and hold to move cards, Choose cards to switch them on or off.
type Part = 'achievements' | 'profile' | 'curves' | 'zones' | 'tests' | 'physiology';
export function Performance({ part = 'achievements' }: { part?: Part }) {
  const p = useProfile().data!;
  const acts = useActivities(p), curves = useCurves(p), tests = usePlannedTests(p), paceCurves = usePaceCurves(p), lifts = useSets(), wellness = useWellness(p);
  const my = usePref<MyZones>(MY_ZONES_KEY, {});
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const all = acts.data ?? [];
  const others = useMemo(() => {
    const c: Record<string, number> = {};
    all.filter((a) => !isRide(a) && !isRun(a) && !isLift(a)).forEach((a) => { c[a.type] = (c[a.type] ?? 0) + 1; });
    (p.athlete?.sports ?? []).forEach((s) => s.types.forEach((t) => { if (!/Ride|Run|WeightTraining/.test(t) && !(t in c) && s.types[0] === t) c[t] = 0; }));
    return Object.keys(c).sort((a, b) => c[b] - c[a]);
  }, [all, p.athlete]);
  const want = params.get('sport') ?? 'ride';
  const sport = ['ride', 'run', 'lift', ...others].includes(want) ? want : 'ride';
  const [ex, setEx] = useState<string | null>(null);
  const unit: Unit = (() => { try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'; } catch { return 'kg'; } })();
  const today = todayIn(p.time_zone);
  const rides = useMemo(() => all.filter(isRide), [all]);
  const runs = useMemo(() => all.filter(isRun), [all]);
  const mine = useMemo(() => all.filter(sportMatch(sport)), [all, sport]);
  const weight = latestWeight(rides) ?? p.athlete?.weight ?? null;
  const results = useMemo(() => testResults(tests.data ?? [], all), [tests.data, all]);
  const open = (id: string) => navigate(`/training/sessions?open=${encodeURIComponent(id)}`);
  const st = settingsFor(p, my.value, sport);
  const label = FIXED.find((s) => s.id === sport)?.label.slice(3) ?? typeLabel(sport);
  const well = wellness.data ?? [];
  const sportQ = `?sport=${encodeURIComponent(sport)}`;
  const tabs = part === 'physiology' ? ANALYSIS_TABS : PERF_TABS.map((t) => ({ ...t, to: t.to + sportQ }));
  if (acts.isLoading) return <><SubTabs tabs={tabs} /><p className="text-muted-foreground">Loading…</p></>;
  const chips = (list: { id: string; label: string }[], more: boolean) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {list.map((s) => <Chip key={s.id} on={sport === s.id} onClick={() => setParams({ sport: s.id }, { replace: true })}>{s.label}</Chip>)}
      {more && others.length > 0 && (
        <select className="h-8 rounded-full border bg-card px-3 text-sm" value={others.includes(sport) ? sport : ''} onChange={(e) => e.target.value && setParams({ sport: e.target.value }, { replace: true })} aria-label="More sports">
          <option value="">More sports ▾</option>{others.map((k) => <option key={k} value={k}>{typeLabel(k)}</option>)}
        </select>
      )}
    </div>
  );
  const none = (t: string) => <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t}</CardContent></Card>;
  const cards = (key: string, list: { id: string; label: string; node: React.ReactNode; off?: boolean }[]) => <Arrange key={key} page={key} cards={list} />;
  let content: React.ReactNode = null;
  if (part === 'achievements') content = <AchievementsCard />;
  else if (part === 'physiology') {
    content = <>{chips(FIXED.filter((f) => f.id !== 'lift'), false)}{sport === 'run'
      ? cards('physio-run', [
        { id: 'lt', label: 'Lactate threshold', node: <ThresholdCard sport="run" acts={runs} settings={st} paceCurves={paceCurves.data ?? []} /> },
        { id: 'vo2', label: 'VO2max', node: <Vo2Card p={p} sport="run" acts={runs} wellness={well} paceCurves={paceCurves.data ?? []} settings={st} weight={weight} /> },
        { id: 'ef', label: 'Running efficiency and decoupling', node: <RunEfCard p={p} runs={runs} settings={st} /> }])
      : cards('physio-ride', [
        { id: 'lt', label: 'Lactate threshold', node: <ThresholdCard sport="ride" acts={rides} settings={st} paceCurves={[]} /> },
        { id: 'vo2', label: 'VO2max', node: <Vo2Card p={p} sport="ride" acts={rides} wellness={well} paceCurves={[]} settings={st} weight={weight} /> },
        { id: 'fitness', label: 'eFTP', node: <Fitness p={p} rides={rides} /> },
        { id: 'ef', label: 'Efficiency and decoupling', node: <EfDecoupling p={p} rides={rides} /> }])}</>;
  } else {
    let c: React.ReactNode = null;
    if (part === 'profile') c = sport === 'ride' ? cards('perf-profile', [
      { id: 'profile', label: 'Power profile (Coggan)', node: <PowerProfileCard rides={rides} curves={curves.data ?? []} today={today} weight={weight} /> },
      { id: 'signature', label: 'Morton 3P (PP · HIE · TP)', node: <SignatureCard rides={rides} curves={curves.data ?? []} today={today} /> }])
      : sport === 'lift' ? <Strength sets={lifts.data ?? []} unit={unit} ex={ex} setEx={setEx} />
      : none('The power profile is for cycling. For this sport, see Curves and Zones.');
    if (part === 'curves') c = sport === 'ride' ? <PowerCurve rides={rides} curves={curves.data ?? []} today={today} weight={weight} onOpen={open} />
      : sport === 'run' ? cards('perf-curves-run', [
        { id: 'pace', label: 'Pace curve', node: <PaceCurveCard curves={paceCurves.data ?? []} acts={runs} onOpen={open} /> },
        { id: 'power', label: 'Running power curve', node: <PowerCurve sport="run" rides={runs} curves={curves.data ?? []} today={today} weight={weight} onOpen={open} /> }])
      : sport === 'lift' ? <BestLifts sets={lifts.data ?? []} unit={unit} />
      : none('No curve for this sport yet. See Zones.');
    if (part === 'zones') c = <ZonesCard acts={mine} settings={st} today={today} sportLabel={label} />;
    if (part === 'tests') c = sport === 'ride' ? <Tests results={results} /> : none('Test results are for cycling tests (VO2 and FTP tests on your calendar).');
    content = <>{chips(FIXED, true)}{c}</>;
  }
  return (
    <div className="space-y-4">
      <SubTabs tabs={tabs} />
      {content}
    </div>
  );
}
