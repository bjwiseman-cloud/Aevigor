import { useMemo, useState } from 'react';
import { Area, AreaChart, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Chips } from '@/components/chips';
import { Arrange } from '@/components/Arrange';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { usePlannedTests, useProfile } from '@/hooks/data';
import { useActivities, useCurves } from '@/hooks/perf';
import { BEST_SECS, MEDALS, bestEfforts, curveFromEfforts, isRide, latestWeight, n, secsLabel, testResults, type Activity, type Curve } from '@/lib/perf';
import { todayIn } from '@/lib/time';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

type Range = '30' | '60' | '90' | 's0' | '1y' | 'all';
const RANGES: { id: Range; label: string }[] = [{ id: '30', label: '30 d' }, { id: '60', label: '60 d' }, { id: '90', label: '90 d' }, { id: 's0', label: 'Season' }, { id: '1y', label: 'Year' }, { id: 'all', label: 'All-time' }];

function PowerCurve({ rides, curves, today, weight }: { rides: Activity[]; curves: Curve[]; today: string; weight: number | null }) {
  const [range, setRange] = useState<Range>('90');
  const [wkg, setWkg] = useState(false);
  const local = /^\d+$/.test(range);
  const inRange = local ? rides.filter((r) => r.day >= addDays(today, -Number(range))) : [];
  const efforts = useMemo(() => bestEfforts(inRange, weight), [inRange, weight]);
  const api = curves.find((c) => c.sport === 'ride' && c.curve === range);
  const data = local ? curveFromEfforts(efforts)
    : api ? BEST_SECS.map((s) => { const i = api.secs.indexOf(s); return i < 0 || !api.watts[i] ? null : { secs: s, watts: api.watts[i], wkg: api.wkg?.[i] ?? (weight ? +(api.watts[i] / weight).toFixed(2) : null) }; }).filter(Boolean) as { secs: number; watts: number; wkg: number | null }[] : [];
  // Evenly spaced standard durations (a log-scale area chart does not draw reliably in Recharts)
  const plot = data.map((p) => ({ ...p, label: secsLabel(p.secs) }));
  const key = wkg ? 'wkg' : 'watts', unit = wkg ? ' W/kg' : ' W';
  const table = local ? efforts : api ? [5, 60, 300, 1200, 3600].map((s) => { const i = api.secs.indexOf(s); return i < 0 ? null : { secs: s, rank: [{ id: '', day: '', name: null, watts: api.watts[i], wkg: api.wkg?.[i] ?? (weight ? +(api.watts[i] / weight).toFixed(2) : null) }] }; }).filter(Boolean) as ReturnType<typeof bestEfforts> : [];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>Power curve</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Chips>{RANGES.map((r) => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}</Chips>
        <Chips><Chip on={!wkg} onClick={() => setWkg(false)}>Watts</Chip><Chip on={wkg} onClick={() => setWkg(true)}>W/kg</Chip></Chips>
        {data.length ? (
          <div className="h-52">
            <ResponsiveContainer>
              <AreaChart data={plot} margin={{ top: 5, right: 8, left: -14, bottom: 0 }}>
                <defs><linearGradient id="pc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.cyan} stopOpacity={0.45} /><stop offset="100%" stopColor={C.cyan} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="label" {...axis} interval="preserveStartEnd" minTickGap={8} />
                <YAxis {...axis} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => String(l)} formatter={(v) => [`${v}${unit}`, 'Best']} />
                <Area type="monotone" dataKey={key} stroke={C.cyan} strokeWidth={2} fill="url(#pc)" connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">{local ? 'No rides with power in this range yet.' : 'This range fills in after the next sync.'}</p>}
        {!!table.length && (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Best efforts</th>{local ? MEDALS.map((m) => <th key={m}>{m}</th>) : <th>Best</th>}</tr></thead>
            <tbody>{table.map((e) => (
              <tr key={e.secs} className="border-t">
                <td className="py-1">{secsLabel(e.secs)}</td>
                {(local ? [0, 1, 2] : [0]).map((i) => { const r = e.rank[i]; return <td key={i} className="text-center font-mono" title={r?.name ?? ''}>{r ? `${wkg ? r.wkg ?? '–' : r.watts}` : '–'}{r?.day && <div className="text-[10px] text-muted-foreground">{shortDay(r.day)}</div>}</td>; })}
              </tr>
            ))}</tbody>
          </table>
        )}
        <HowToRead>Your best average power for each length of effort. 🥇🥈🥉 are your three best rides for that length in the range picked (one value per ride). W/kg uses the weight saved on each ride in intervals.icu.</HowToRead>
      </CardContent>
    </Card>
  );
}

function Tests({ results }: { results: ReturnType<typeof testResults> }) {
  const [pick, setPick] = useState<Record<string, number>>({});
  if (!results.length) return <Card><CardHeader className="pb-2"><CardTitle>Test results</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Tests appear here after a planned FTP, VO2 or durability test day in your intervals.icu calendar has a ride with power.</CardContent></Card>;
  const kinds = [...new Set(results.map((r) => r.kind))];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>Test results</CardTitle></CardHeader>
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

function Fitness({ rides, weight }: { rides: Activity[]; weight: number | null }) {
  const pts = [...rides].reverse().map((r) => ({ day: r.day, eftp: n(r, 'icu_pm_ftp', 'icu_eftp'), map: r.best?.[300] ?? null }));
  const has = pts.some((p) => p.eftp || p.map);
  const best5 = Math.max(0, ...rides.map((r) => r.best?.[300] ?? 0));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>eFTP and 5-min max power</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md bg-muted p-2 text-sm"><div className="text-xs text-muted-foreground">5-min max power (≈ VO2max power, MAP), last 6 months</div><b className="text-lg">{best5 ? `${best5} W` : '–'}</b>{best5 && weight ? <span className="text-muted-foreground"> · {(best5 / weight).toFixed(2)} W/kg</span> : null}</div>
        {has ? (
          <div className="h-44">
            <ResponsiveContainer>
              <ComposedChart data={pts} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                <defs><linearGradient id="ef" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.green} stopOpacity={0.4} /><stop offset="100%" stopColor={C.green} stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis domain={['auto', 'auto']} {...axis} />
                <Tooltip {...tooltipStyle} />
                <Area dataKey="eftp" name="eFTP" stroke={C.green} fill="url(#ef)" strokeWidth={2} connectNulls />
                <Line dataKey="map" name="5-min best" stroke={C.magenta} strokeWidth={0} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">Fills in after rides with power are synced.</p>}
        <Legend items={[{ label: 'eFTP (intervals.icu)', color: C.green, area: true }, { label: '5-min best per ride', color: C.magenta }]} />
      </CardContent>
    </Card>
  );
}

function EfDecoupling({ rides }: { rides: Activity[] }) {
  const pts = [...rides].reverse().filter((r) => (r.moving_time ?? 0) >= 3600).map((r) => ({ day: r.day, ef: n(r, 'icu_efficiency_factor'), dec: n(r, 'decoupling') }));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>Efficiency and decoupling</CardTitle></CardHeader>
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

export function Performance() {
  const p = useProfile().data!;
  const acts = useActivities(p), curves = useCurves(p), tests = usePlannedTests(p);
  const today = todayIn(p.time_zone);
  const rides = useMemo(() => (acts.data ?? []).filter(isRide), [acts.data]);
  const weight = latestWeight(rides);
  const results = useMemo(() => testResults(tests.data ?? [], acts.data ?? []), [tests.data, acts.data]);
  if (acts.isLoading) return <><SubTabs tabs={TRAINING_TABS} /><p className="text-muted-foreground">Loading…</p></>;
  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      <p className="text-xs text-muted-foreground">Cycling. Running power and pace curves come next.</p>
      <Arrange page="performance" cards={[
        { id: 'curve', label: 'Power curve', node: <PowerCurve rides={rides} curves={curves.data ?? []} today={today} weight={weight} /> },
        { id: 'tests', label: 'Test results', node: <Tests results={results} /> },
        { id: 'fitness', label: 'eFTP and 5-min max power', node: <Fitness rides={rides} weight={weight} /> },
        { id: 'ef', label: 'Efficiency and decoupling', node: <EfDecoupling rides={rides} /> }
      ]} />
    </div>
  );
}
