// Performance cards added in the final beta round (Ben, BUILD-LIST #38, #41, #42, #44):
// time in zones for any sport, lactate threshold, VO2max, running efficiency and decoupling,
// and estimated cycle-phase shading behind the day-by-day charts.
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Chip, Chips } from '@/components/chips';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { useCycle } from '@/hooks/cycle';
import { PHASES, phaseRuns, showsPhases } from '@/lib/cycle';
import { isRide, isRun, n, mmss, pace, paceRows, type Activity, type Curve, type PaceCurve } from '@/lib/perf';
import { hrZones, paceZones, powerZones, sportName, type ZoneRow } from '@/lib/zones';
import { effective, type MyZones } from '@/lib/myzones';
import type { Profile, SportSettings } from '@/lib/types';

// ---------- Which activities and settings belong to a sport ----------
export const isLift = (a: Activity) => /weight|strength/i.test(a.type);
export function sportMatch(sport: string) {
  if (sport === 'ride') return isRide;
  if (sport === 'run') return isRun;
  if (sport === 'lift') return isLift;
  return (a: Activity) => a.type === sport;
}
const TYPES: Record<string, string> = { ride: 'Ride', run: 'Run', lift: 'WeightTraining' };
export const typeOf = (sport: string) => TYPES[sport] ?? sport;
export function settingsFor(p: Profile, my: MyZones, sport: string): SportSettings & { vo2max?: number | null; lt1_hr?: number | null } {
  const t = typeOf(sport);
  const icu = (p.athlete?.sports ?? []).find((s) => s.types.includes(t)) ?? (sport === 'ride' ? (p.athlete?.sports ?? []).find((s) => s.types.some((x) => /Ride/.test(x))) : undefined);
  const name = icu ? sportName(icu.types) : sport === 'ride' ? 'Cycling' : sport === 'run' ? 'Running' : sportName([t]);
  return effective(icu, my[name], icu?.types ?? [t]);
}

// ---------- Estimated cycle phases behind a day-by-day chart ----------
// The chart's x values are activity days, so each phase run is snapped to the nearest plotted days inside it.
export function usePhaseShade(p: Profile, days: string[]) {
  const cyc = useCycle(p);
  return useMemo(() => {
    if (!showsPhases(cyc.settings) || !days.length || !cyc.days.length) return { areas: [], on: false };
    const sorted = [...days].sort();
    const runs = phaseRuns(sorted[0], sorted[sorted.length - 1], cyc.days);
    const areas = runs.map((r) => {
      const inside = sorted.filter((d) => d >= r.x1 && d <= r.x2);
      return inside.length ? <ReferenceArea key={'ph' + r.x1} x1={inside[0]} x2={inside[inside.length - 1]} fill={PHASES[r.phase].color} fillOpacity={0.2} stroke="none" ifOverflow="hidden" /> : null;
    }).filter(Boolean);
    return { areas, on: areas.length > 0 };
  }, [cyc.settings, cyc.days, days.join()]); // eslint-disable-line react-hooks/exhaustive-deps
}
export function PhaseKey({ on }: { on: boolean }) {
  if (!on) return null;
  return <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>Cycle phases (estimated):</span>{Object.values(PHASES).map((x) => <span key={x.label} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />{x.label}</span>)}</div>;
}

// ---------- Time in zones ----------
const ZONE_COL = ['#94a3b8', '#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444', '#a855f7', '#be185d', '#7c2d12', '#334155'];
type ZKind = 'power' | 'hr' | 'pace';
const ZK: { id: ZKind; label: string; key: string }[] = [{ id: 'power', label: 'Power', key: 'zt_power' }, { id: 'hr', label: 'Heart rate', key: 'zt_hr' }, { id: 'pace', label: 'Pace', key: 'zt_pace' }];
const ZR = [{ id: 28, label: '4 wk' }, { id: 84, label: '12 wk' }, { id: 365, label: '1 yr' }];
const hrs = (s: number) => (s >= 3600 ? `${(s / 3600).toFixed(1)} h` : `${Math.round(s / 60)} min`);

export function zoneTotals(acts: Activity[], key: string) {
  const tot: number[] = [];
  for (const a of acts) {
    const v = a.raw[key];
    if (typeof v !== 'string') continue;
    v.split(',').forEach((x, i) => { tot[i] = (tot[i] ?? 0) + (Number(x) || 0); });
  }
  return tot;
}

export function ZonesCard({ acts, settings, today, sportLabel }: { acts: Activity[]; settings: SportSettings; today: string; sportLabel: string }) {
  const [range, setRange] = useState(84);
  const recent = acts.filter((a) => a.day >= addDays(today, -range + 1));
  const kinds = ZK.filter((k) => acts.some((a) => typeof a.raw[k.key] === 'string'));
  const [pick, setPick] = useState<ZKind | null>(null);
  const kind = kinds.find((k) => k.id === pick) ?? kinds[0];
  const rows: ZoneRow[] = !kind ? [] : kind.id === 'power' ? powerZones(settings) : kind.id === 'hr' ? hrZones(settings) : paceZones(settings);
  const tot = kind ? zoneTotals(recent, kind.key) : [];
  const sum = tot.reduce((s, x) => s + x, 0);
  const data = tot.map((secs, i) => ({ z: rows[i]?.name?.split(' ')[0] || `Z${i + 1}`, name: rows[i]?.name || `Zone ${i + 1}`, secs, h: +(secs / 3600).toFixed(2), pct: sum ? Math.round((secs / sum) * 100) : 0, range: rows[i] ? `${rows[i].from} to ${rows[i].to}` : '' }));
  const hasZones = !!(settings.power_zones?.length || settings.hr_zones?.length || settings.pace_zones?.length);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="zones">Time in zones</CardTitle><p className="text-xs text-muted-foreground">{sportLabel}</p></CardHeader>
      <CardContent className="space-y-3">
        {!kinds.length ? (
          <p className="text-sm text-muted-foreground">{hasZones ? 'No zone times yet. They fill in from the next sync for sessions with power, heart rate or pace.' : 'Set a threshold and zones for this sport in Profile (or intervals.icu Sport Settings) to see time in zones.'}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Chips>{kinds.map((k) => <Chip key={k.id} on={kind?.id === k.id} onClick={() => setPick(k.id)}>{k.label}</Chip>)}</Chips>
              <span className="ml-auto"><Chips>{ZR.map((r) => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.label}</Chip>)}</Chips></span>
            </div>
            {sum > 0 ? (
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="z" {...axis} interval={0} />
                    <YAxis {...axis} unit=" h" />
                    <Tooltip {...tooltipStyle} labelFormatter={(_l, pl) => { const d = pl?.[0]?.payload; return d ? `${d.name}${d.range ? ` · ${d.range}` : ''}` : ''; }} formatter={(_v, _n, it) => [`${hrs(it.payload.secs)} (${it.payload.pct}%)`, 'Time']} />
                    <Bar dataKey="h" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {data.map((_d, i) => <Cell key={i} fill={ZONE_COL[i % ZONE_COL.length]} />)}
                      <LabelList dataKey="pct" position="top" formatter={(v: number) => (v ? `${v}%` : '')} fontSize={10} fill={C.axis} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <p className="text-sm text-muted-foreground">No {kind?.label.toLowerCase()} zone time in this range.</p>}
            {rows.length > 0 && (
              <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-0.5 text-xs">
                {data.map((d, i) => <div key={i} className="contents"><span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: ZONE_COL[i % ZONE_COL.length] }} />{d.name}</span><span className="text-muted-foreground">{d.range}</span><span className="text-right font-mono">{hrs(d.secs)}</span></div>)}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Total {hrs(sum)} in {recent.filter((a) => kind && typeof a.raw[kind.key] === 'string').length} sessions.</p>
          </>
        )}
        <HowToRead>How long you spent in each zone over the range you pick. intervals.icu works out each session's zone times with the zones in your intervals.icu Sport Settings at the time; the limits listed are the ones in your Profile now.</HowToRead>
      </CardContent>
    </Card>
  );
}

// ---------- Lactate threshold ----------
function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return <div className="rounded-md bg-muted p-2"><div className="text-xs text-muted-foreground">{label}</div><b className="text-lg">{value ?? '–'}</b>{sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}</div>;
}
const monthKey = (d: string) => d.slice(0, 7);

export function ThresholdCard({ sport, acts, settings, paceCurves }: { sport: 'ride' | 'run'; acts: Activity[]; settings: SportSettings & { lt1_hr?: number | null }; paceCurves: PaceCurve[] }) {
  const latest = acts.find((a) => n(a, 'icu_pm_ftp', 'icu_eftp'));
  const eftp = latest ? n(latest, 'icu_pm_ftp', 'icu_eftp') : null;
  const cs = paceCurves.find((c) => c.curve === '84d')?.critical_speed ?? paceCurves.find((c) => c.critical_speed)?.critical_speed ?? null;
  // Month by month: best 20-min power x 0.95 (rides), the usual field estimate of threshold power
  const months = useMemo(() => {
    if (sport !== 'ride') return [];
    const m: Record<string, number> = {};
    for (const a of acts) { const b = a.best?.[1200]; if (b) m[monthKey(a.day)] = Math.max(m[monthKey(a.day)] ?? 0, Math.round(b * 0.95)); }
    return Object.entries(m).sort().slice(-12).map(([k, v]) => ({ m: k, v }));
  }, [acts, sport]);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="lactate-threshold">Lactate threshold</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {sport === 'ride'
            ? <><Stat label="Threshold power (FTP)" value={settings.ftp ? `${settings.ftp} W` : null} sub="from your Profile" /><Stat label="eFTP" value={eftp ? `${Math.round(eftp)} W` : null} sub="intervals.icu estimate" /></>
            : <><Stat label="Threshold pace" value={settings.threshold_pace ? pace(settings.threshold_pace) : null} sub="from your Profile" /><Stat label="Critical speed" value={cs ? pace(cs) : null} sub="from your pace curve" /></>}
          <Stat label="Threshold heart rate (LTHR)" value={settings.lthr ? `${settings.lthr} bpm` : null} />
          <Stat label="LT1 heart rate" value={settings.lt1_hr ? `${settings.lt1_hr} bpm` : settings.hr_zones?.[1] ? `${settings.hr_zones[1]} bpm` : null} sub={settings.lt1_hr ? 'your own number' : 'top of zone 2'} />
        </div>
        {months.length > 1 && (
          <div className="h-36">
            <ResponsiveContainer>
              <BarChart data={months} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="m" {...axis} tickFormatter={(v) => String(v).slice(5)} />
                <YAxis {...axis} domain={['dataMin - 20', 'auto']} />
                <Tooltip {...tooltipStyle} formatter={(v) => [`${v} W`, 'Best 20 min × 0.95']} />
                <Bar dataKey="v" fill={C.green} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <HowToRead>{sport === 'ride'
          ? 'Lactate threshold is roughly the hardest effort you can hold steady for 30 to 60 minutes. FTP is your set number; eFTP is intervals.icu\'s estimate from your rides. The bars are each month\'s best 20-minute power × 0.95, the common field test estimate (Allen and Coggan). Only a lab test measures lactate itself.'
          : 'Lactate threshold pace is roughly the fastest pace you can hold steady for about an hour. Critical speed from your pace curve sits close to it for most runners (Jones 2019). Only a lab test measures lactate itself.'}</HowToRead>
      </CardContent>
    </Card>
  );
}

// ---------- VO2max ----------
// Cycling estimate from best 5-min power per kg: VO2max ≈ 16.6 + 8.87 × W/kg (Sitko 2021).
export const vo2FromPower = (wkg: number) => Math.round((16.6 + 8.87 * wkg) * 10) / 10;
// Running estimate from a best time (Daniels and Gilbert VDOT): metres and seconds.
export function vdot(meters: number, secs: number) {
  const t = secs / 60, v = meters / t;
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return Math.round((vo2 / pct) * 10) / 10;
}

export function Vo2Card({ p, sport, acts, wellness, paceCurves, settings, weight }: { p: Profile; sport: 'ride' | 'run'; acts: Activity[]; wellness: { day: string; extra?: unknown }[]; paceCurves: PaceCurve[]; settings: { vo2max?: number | null }; weight: number | null }) {
  const watch = wellness.map((w) => ({ day: w.day, v: (w.extra as Record<string, unknown> | null)?.vo2max })).filter((x): x is { day: string; v: number } => typeof x.v === 'number').sort((a, b) => a.day.localeCompare(b.day));
  const est = useMemo(() => {
    if (sport === 'ride') {
      return [...acts].reverse().filter((a) => a.best?.[300]).map((a) => {
        const w = n(a, 'icu_weight', 'weight') ?? weight;
        return w ? { day: a.day, est: vo2FromPower(a.best![300] / w) } : null;
      }).filter((x): x is { day: string; est: number } => !!x);
    }
    return [];
  }, [acts, sport, weight]);
  // Running: from the best 5 km (else 3 km or 10 km) on each pace curve range
  const runEst = sport === 'run' ? ['84d', '1y', 'all'].map((id) => {
    const rows = paceRows(paceCurves.find((c) => c.curve === id));
    const r = rows.find((x) => x.meters === 5000) ?? rows.find((x) => x.meters === 3000) ?? rows.find((x) => x.meters === 10000);
    return r ? { id, label: id === '84d' ? 'Last 84 days' : id === '1y' ? 'Last year' : 'All-time', v: vdot(r.meters, r.secs), from: `${r.label} in ${mmss(r.secs)}` } : null;
  }).filter(Boolean) as { id: string; label: string; v: number; from: string }[] : [];
  const series = [...new Set([...watch.map((x) => x.day), ...est.map((x) => x.day)])].sort().filter((d) => d >= addDays(watch.at(-1)?.day ?? est.at(-1)?.day ?? d, -365))
    .map((d) => ({ day: d, watch: watch.find((x) => x.day === d)?.v ?? null, est: est.find((x) => x.day === d)?.est ?? null }));
  const shade = usePhaseShade(p, series.map((x) => x.day));
  const best90 = est.filter((x) => x.day >= addDays(est.at(-1)?.day ?? '', -90)).reduce((m, x) => Math.max(m, x.est), 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="vo2max">VO2max</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Watch" value={watch.length ? String(watch.at(-1)!.v) : null} sub={watch.length ? shortDay(watch.at(-1)!.day) : 'from intervals.icu wellness'} />
          {sport === 'ride'
            ? <Stat label="Estimate from 5-min power" value={best90 ? String(best90) : null} sub="best of the last 90 days" />
            : <Stat label="Estimate from your runs" value={runEst[0] ? String(runEst[0].v) : null} sub={runEst[0]?.from ?? 'needs a 3, 5 or 10 km best'} />}
          {settings.vo2max ? <Stat label="Your own number" value={String(settings.vo2max)} sub="from Profile" /> : null}
        </div>
        {sport === 'run' && runEst.length > 1 && <div className="text-xs text-muted-foreground">{runEst.map((r) => <span key={r.id} className="mr-3">{r.label}: <b className="text-foreground">{r.v}</b> ({r.from})</span>)}</div>}
        {series.length > 1 && (
          <div className="h-40">
            <ResponsiveContainer>
              <ComposedChart data={series} margin={{ top: 5, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                {shade.areas}
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis {...axis} domain={['dataMin - 3', 'dataMax + 3']} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => shortDay(String(l))} />
                <Line dataKey="est" name="Estimate" stroke={C.cyan} strokeWidth={0} dot={{ r: 2.5 }} isAnimationActive={false} />
                <Line dataKey="watch" name="Watch" stroke={C.orange} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        {series.length > 1 && <Legend items={[...(est.length ? [{ label: 'Estimate per ride', color: C.cyan }] : []), ...(watch.length ? [{ label: 'Watch', color: C.orange }] : [])]} />}
        <PhaseKey on={shade.on} />
        <HowToRead>{sport === 'ride'
          ? 'VO2max is how much oxygen your body can use at full effort, in ml per kg per minute. The estimate uses your best 5-minute power per kg in each ride (16.6 + 8.87 × W/kg; Sitko 2021), so it is only as good as your hardest 5 minutes. A watch estimate comes from your wellness data in intervals.icu. Estimates, not a lab test.'
          : 'VO2max is how much oxygen your body can use at full effort, in ml per kg per minute. The run estimate is the VDOT from your best 5 km (or 3 or 10 km) on your pace curve (Daniels and Gilbert), so an easy-paced best gives a low number. A watch estimate comes from your wellness data in intervals.icu. Estimates, not a lab test.'}</HowToRead>
      </CardContent>
    </Card>
  );
}

// ---------- Running efficiency and decoupling ----------
// EF = grade-adjusted speed (m/min) ÷ average HR, or power ÷ average HR. Easy runs of 45 minutes or more only
// (average HR at or below the top of zone 2 when HR zones are set). Decoupling is intervals.icu's first half vs second half.
export function RunEfCard({ p, runs, settings }: { p: Profile; runs: Activity[]; settings: SportSettings }) {
  const [basis, setBasis] = useState<'pace' | 'power'>('pace');
  const z2 = settings.hr_zones?.[1] ?? null;
  const easy = runs.filter((r) => (r.moving_time ?? 0) >= 2700 && n(r, 'average_heartrate', 'icu_average_hr') && (!z2 || (n(r, 'average_heartrate', 'icu_average_hr') ?? 999) <= z2 + 2));
  const hasPower = easy.some((r) => n(r, 'icu_weighted_avg_watts', 'icu_average_watts', 'average_watts'));
  const b = basis === 'power' && hasPower ? 'power' : 'pace';
  const pts = [...easy].reverse().map((r) => {
    const hr = n(r, 'average_heartrate', 'icu_average_hr')!;
    const spd = n(r, 'gap', 'icu_gap', 'average_speed') ?? (r.distance && r.moving_time ? r.distance / r.moving_time : null);
    const w = n(r, 'icu_weighted_avg_watts', 'icu_average_watts', 'average_watts');
    const ef = b === 'power' ? (w ? Math.round((w / hr) * 100) / 100 : null) : spd ? Math.round(((spd * 60) / hr) * 100) / 100 : null;
    return { day: r.day, ef, dec: n(r, 'decoupling') };
  });
  const shade = usePhaseShade(p, pts.map((x) => x.day));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="ef-decoupling">Running efficiency and decoupling</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {hasPower && <Chips><Chip on={b === 'pace'} onClick={() => setBasis('pace')}>Pace ÷ HR</Chip><Chip on={b === 'power'} onClick={() => setBasis('power')}>Power ÷ HR</Chip></Chips>}
        {pts.some((x) => x.ef != null || x.dec != null) ? (
          <div className="h-44">
            <ResponsiveContainer>
              <ComposedChart data={pts} margin={{ top: 5, right: -10, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                {shade.areas}
                <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                <YAxis yAxisId="ef" domain={['auto', 'auto']} {...axis} />
                <YAxis yAxisId="dec" orientation="right" {...axis} unit="%" />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => shortDay(String(l))} />
                <Bar yAxisId="dec" dataKey="dec" name="Decoupling %" fill={C.orange} fillOpacity={0.5} />
                <Line yAxisId="ef" dataKey="ef" name="EF" stroke={C.cyan} strokeWidth={2} dot={{ r: 2 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">Shows easy runs of 45 minutes or more with heart rate, once synced.</p>}
        <Legend items={[{ label: b === 'power' ? 'EF (power ÷ HR)' : 'EF (graded speed in m/min ÷ HR)', color: C.cyan }, { label: 'Decoupling (first half vs second half)', color: C.orange, area: true }]} />
        <PhaseKey on={shade.on} />
        <HowToRead>Efficiency factor (EF) rising on similar easy runs means you run faster, or make more power, for the same heart rate. It uses grade-adjusted pace so hills count fairly. Decoupling is how much heart rate drifts up against pace from the first half to the second half; under about 5% on a long easy run is the usual guide for good aerobic fitness (Friel). Easy runs of 45 minutes or more only{z2 ? `, with average heart rate up to the top of your zone 2 (${z2} bpm)` : ''}.</HowToRead>
      </CardContent>
    </Card>
  );
}

export const curvesFor = (curves: Curve[], sport: string) => curves.filter((c) => c.sport === sport);
