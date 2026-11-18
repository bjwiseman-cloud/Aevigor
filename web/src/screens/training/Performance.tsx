import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Chips } from '@/components/chips';
import { Arrange } from '@/components/Arrange';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { usePlannedTests, useProfile } from '@/hooks/data';
import { useActivities, useCurves, usePaceCurves } from '@/hooks/perf';
import { BEST_SECS, bestEfforts, isRide, isRun, latestWeight, mmss, n, pace, paceRows, secsLabel, testResults, type Activity, type Curve, type PaceCurve } from '@/lib/perf';
import { todayIn } from '@/lib/time';
import { e1rmSeries, exercises, fromKg, showW, type LiftSet, type Unit } from '@/lib/lifting';
import { Strength, UNIT_KEY, useSets } from '@/screens/training/Lifting';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

type Recent = '30' | '60' | '90';
type Compare = 's0' | '1y' | 'all';
const RECENT: { id: Recent; label: string }[] = [{ id: '30', label: '30 d' }, { id: '60', label: '60 d' }, { id: '90', label: '90 d' }];
const COMPARE: { id: Compare; label: string }[] = [{ id: 's0', label: 'Season' }, { id: '1y', label: 'Year' }, { id: 'all', label: 'All-time' }];
const TABLE_SECS = BEST_SECS.filter((s) => s <= 7200);

// Power curve: a recent curve (30/60/90 days, from each ride's bests) over a longer one (season, year, all time from intervals.icu).
// The two can overlap: the longer range always includes the recent days, so where the recent line touches it, those are current bests.
function PowerCurve({ rides, curves, today, weight, onOpen }: { rides: Activity[]; curves: Curve[]; today: string; weight: number | null; onOpen: (id: string) => void }) {
  const [recent, setRecent] = useState<Recent>('90');
  const [compare, setCompare] = useState<Compare>('1y');
  const [wkg, setWkg] = useState(false);
  const inRange = useMemo(() => rides.filter((r) => r.day >= addDays(today, -Number(recent))), [rides, today, recent]);
  const efforts = useMemo(() => bestEfforts(inRange, weight), [inRange, weight]);
  const api = curves.find((c) => c.sport === 'ride' && c.curve === compare);
  const dayOf = (id: string | null | undefined) => rides.find((r) => r.id === id);
  const cmpAt = (s: number) => {
    if (!api) return null;
    const i = api.secs.indexOf(s); if (i < 0 || !api.watts[i]) return null;
    const a = dayOf(api.activity_ids?.[i]);
    return { watts: api.watts[i], wkg: api.wkg?.[i] ?? (weight ? +(api.watts[i] / weight).toFixed(2) : null), id: a?.id ?? null, day: a?.day ?? null };
  };
  const recAt = (s: number) => efforts.find((e) => e.secs === s)?.rank[0] ?? null;
  const key = wkg ? 'wkg' : 'watts', unit = wkg ? ' W/kg' : ' W';
  // Evenly spaced standard durations (a log-scale chart does not draw reliably in Recharts)
  const plot = BEST_SECS.map((s) => { const r = recAt(s), c = cmpAt(s); return { label: secsLabel(s), rec: r ? r[key] : null, cmp: c ? c[key] : null }; }).filter((p) => p.rec != null || p.cmp != null);
  const cmpLabel = COMPARE.find((c) => c.id === compare)!.label, recLabel = `Last ${recent} days`;
  const cell = (e: { watts: number; wkg: number | null; id: string | null; day: string | null } | null) => e ? (
    <button type="button" disabled={!e.id} onClick={() => e.id && onOpen(e.id)} className="inline-flex items-baseline gap-1.5 font-mono enabled:underline enabled:decoration-dotted">
      <span>{wkg ? e.wkg ?? '–' : e.watts}</span>{e.day && <span className="font-sans text-[11px] text-muted-foreground">{shortDay(e.day)}</span>}
    </button>
  ) : <span className="text-muted-foreground">–</span>;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="power-curve">Power curve</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="w-16 text-muted-foreground">Recent</span><Chips>{RECENT.map((r) => <Chip key={r.id} on={recent === r.id} onClick={() => setRecent(r.id)}>{r.label}</Chip>)}</Chips></div>
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className="w-16 text-muted-foreground">Compare</span><Chips>{COMPARE.map((r) => <Chip key={r.id} on={compare === r.id} onClick={() => setCompare(r.id)}>{r.label}</Chip>)}</Chips></div>
        <Chips><Chip on={!wkg} onClick={() => setWkg(false)}>Watts</Chip><Chip on={wkg} onClick={() => setWkg(true)}>W/kg</Chip></Chips>
        {plot.length ? (
          <div className="h-52">
            <ResponsiveContainer>
              <ComposedChart data={plot} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.cyan} stopOpacity={0.45} /><stop offset="100%" stopColor={C.cyan} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => String(l)} formatter={(v, name) => [`${v}${unit}`, String(name)]} />
                <Line type="monotone" dataKey="cmp" name={cmpLabel} stroke={C.orange} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls isAnimationActive={false} />
                <Area type="monotone" dataKey="rec" name={recLabel} stroke={C.cyan} strokeWidth={2.5} fill="url(#pc)" connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">No rides with power yet. This fills in after the next sync.</p>}
        <Legend items={[{ label: recLabel, color: C.cyan, area: true }, { label: cmpLabel, color: C.orange, dashed: true }]} />
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Best efforts</th><th className="text-left">🥇 {recLabel}</th><th className="text-left">🥇 {cmpLabel}</th></tr></thead>
          <tbody>{TABLE_SECS.map((s) => {
            const r = recAt(s);
            return (
              <tr key={s} className="border-t">
                <td className="py-1">{secsLabel(s)}</td>
                <td>{cell(r ? { watts: r.watts, wkg: r.wkg, id: r.id, day: r.day } : null)}</td>
                <td>{cell(cmpAt(s))}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <HowToRead>Your best average power for each length of effort. The shaded curve is the recent range you pick; the dashed curve is the longer range to compare against. They can overlap: the season, year and all-time ranges include the recent days, so where the two curves meet, that best was set recently. Only the top effort is listed; tap it to open that ride in Sessions. W/kg uses the weight saved on each ride in intervals.icu.</HowToRead>
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

function Fitness({ rides }: { rides: Activity[] }) {
  const pts = [...rides].reverse().map((r) => ({ day: r.day, eftp: n(r, 'icu_pm_ftp', 'icu_eftp') })).filter((p) => p.eftp);
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
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} {...axis} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} W`, 'eFTP']} />
                <Area dataKey="eftp" name="eFTP" stroke={C.green} fill="url(#ef)" strokeWidth={2} connectNulls isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">Fills in after rides with power are synced.</p>}
        <p className="text-xs text-muted-foreground">Latest eFTP <b className="font-mono">{pts.at(-1)?.eftp ?? '–'} W</b> (intervals.icu's estimate from your rides).</p>
      </CardContent>
    </Card>
  );
}

function EfDecoupling({ rides }: { rides: Activity[] }) {
  const pts = [...rides].reverse().filter((r) => (r.moving_time ?? 0) >= 3600).map((r) => ({ day: r.day, ef: n(r, 'icu_efficiency_factor'), dec: n(r, 'decoupling') }));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="ef-decoupling">Efficiency and decoupling</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {pts.some((p) => p.ef != null || p.dec != null) ? (
          <div className="h-44">
            <ResponsiveContainer>
              <ComposedChart data={pts} margin={{ top: 5, right: -10, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
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

// Best e1RM per exercise (the lifting "best efforts")
function LiftBests({ sets, unit }: { sets: LiftSet[]; unit: Unit }) {
  const rows = exercises(sets).slice(0, 12).map((ex) => {
    const top = e1rmSeries(sets, ex).reduce<null | { day: string; e1rm: number; reps: number; weight: number }>((m, p) => (!m || p.e1rm > m.e1rm ? p : m), null);
    return top ? { ex, ...top } : null;
  }).filter(Boolean) as { ex: string; day: string; e1rm: number; reps: number; weight: number }[];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="strength">Best lifts</CardTitle></CardHeader>
      <CardContent>
        {rows.length ? (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Exercise</th><th className="text-left">🥇 e1RM</th><th className="text-left">From</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.ex} className="border-t">
                <td className="py-1">{r.ex}</td>
                <td><span className="font-mono">{Math.round(fromKg(r.e1rm, unit))} {unit}</span> <span className="text-[11px] text-muted-foreground">{shortDay(r.day)}</span></td>
                <td className="text-xs text-muted-foreground">{r.reps} × {showW(r.weight, unit)}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="text-sm text-muted-foreground">Log or import lifting sets in the Lifting tab to see your best lifts.</p>}
      </CardContent>
    </Card>
  );
}

type Sport = 'ride' | 'run' | 'lift';
const SPORTS: { id: Sport; label: string }[] = [{ id: 'ride', label: '🚴 Cycling' }, { id: 'run', label: '🏃 Running' }, { id: 'lift', label: '🏋️ Lifting' }];

export function Performance() {
  const p = useProfile().data!;
  const acts = useActivities(p), curves = useCurves(p), tests = usePlannedTests(p), paceCurves = usePaceCurves(p), lifts = useSets();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sport = (['ride', 'run', 'lift'].includes(params.get('sport') ?? '') ? params.get('sport') : 'ride') as Sport;
  const [ex, setEx] = useState<string | null>(null);
  const unit: Unit = (() => { try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'; } catch { return 'kg'; } })();
  const today = todayIn(p.time_zone);
  const rides = useMemo(() => (acts.data ?? []).filter(isRide), [acts.data]);
  const weight = latestWeight(rides);
  const results = useMemo(() => testResults(tests.data ?? [], acts.data ?? []), [tests.data, acts.data]);
  const open = (id: string) => navigate(`/training/sessions?open=${encodeURIComponent(id)}`);
  if (acts.isLoading) return <><SubTabs tabs={TRAINING_TABS} /><p className="text-muted-foreground">Loading…</p></>;
  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      <Chips>{SPORTS.map((s) => <Chip key={s.id} on={sport === s.id} onClick={() => setParams({ sport: s.id }, { replace: true })}>{s.label}</Chip>)}</Chips>
      {sport === 'ride' && (
        <Arrange page="performance" cards={[
          { id: 'curve', label: 'Power curve', node: <PowerCurve rides={rides} curves={curves.data ?? []} today={today} weight={weight} onOpen={open} /> },
          { id: 'tests', label: 'Test results', node: <Tests results={results} /> },
          { id: 'fitness', label: 'eFTP', node: <Fitness rides={rides} /> },
          { id: 'ef', label: 'Efficiency and decoupling', node: <EfDecoupling rides={rides} /> }
        ]} />
      )}
      {sport === 'run' && <PaceCurveCard curves={paceCurves.data ?? []} acts={(acts.data ?? []).filter(isRun)} onOpen={open} />}
      {sport === 'lift' && (
        <>
          <Strength sets={lifts.data ?? []} unit={unit} ex={ex} setEx={setEx} />
          <LiftBests sets={lifts.data ?? []} unit={unit} />
        </>
      )}
    </div>
  );
}
