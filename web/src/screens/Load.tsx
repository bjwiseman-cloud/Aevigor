import { useMemo, useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { useDailyLoad, usePlannedTests, useProfile, LOAD_BACK, PLAN_AHEAD } from '@/hooks/data';
import { FORM_ZONES, RAMP_ZONES, TEST_READY, formZone, pmc, rampZone, weekly, type Sport } from '@/lib/metrics';
import { todayIn, fmt } from '@/lib/time';

const SHOW_BACK = 84, SHOW_AHEAD = 28;

function ZoneBar({ label, value, zones, unit = '' }: {
  label: string; value: number | null; unit?: string;
  zones: readonly { name: string; from: number; to: number; color: string }[];
}) {
  const min = zones[0].from, max = zones[zones.length - 1].to;
  const row = Object.fromEntries(zones.map((z) => [z.name, z.to - z.from]));
  const zone = value === null ? null : zones.find((z) => value < z.to) ?? zones[zones.length - 1];
  const clamped = value === null ? null : Math.min(max, Math.max(min, value));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono" style={{ color: zone?.color }}>{fmt(value, unit)} {zone && <span className="text-xs">· {zone.name}</span>}</span>
      </div>
      <ResponsiveContainer width="100%" height={26}>
        <BarChart data={[row]} layout="vertical" margin={{ top: 4, right: 0, bottom: 4, left: 0 }}>
          <XAxis type="number" domain={[0, max - min]} hide />
          <YAxis type="category" hide />
          {zones.map((z) => <Bar key={z.name} dataKey={z.name} stackId="z" fill={z.color} fillOpacity={0.35} isAnimationActive={false} />)}
          {clamped !== null && <ReferenceLine x={clamped - min} stroke="#ffffff" strokeWidth={3} />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const TEST_LABEL: Record<string, string> = { 'FTP test': 'FTP test', 'VO2 test': 'VO2 test', 'Durability test': 'Durability test' };

export function Load() {
  const profile = useProfile();
  const p = profile.data;
  const load = useDailyLoad(p);
  const tests = usePlannedTests(p);
  const [sport, setSport] = useState<Sport>('ride');
  const today = p ? todayIn(p.time_zone) : '';

  const points = useMemo(
    () => (load.data && today ? pmc(load.data, sport, addDays(today, -LOAD_BACK), addDays(today, PLAN_AHEAD), today) : []),
    [load.data, sport, today]
  );
  const shown = points.filter((x) => x.day >= addDays(today, -SHOW_BACK) && x.day <= addDays(today, SHOW_AHEAD));
  const now = points.find((x) => x.day === today);
  const weeks = useMemo(() => weekly(points, today), [points, today]);
  const next = (tests.data ?? []).find((t) => t.day >= today && t.kind !== 'Durability test')
    ?? (tests.data ?? []).find((t) => t.day >= today);
  const nextPoint = next && points.find((x) => x.day === next.day);
  const daysTo = next ? Math.round((Date.parse(next.day) - Date.parse(today)) / 86400000) : null;
  const ready = nextPoint ? nextPoint.form >= TEST_READY.from && nextPoint.form <= TEST_READY.to : false;
  const hasData = (load.data ?? []).some((r) => r.actual > 0 || r.planned > 0);
  const testDays = (tests.data ?? []).filter((t) => t.day >= shown[0]?.day && t.day <= shown[shown.length - 1]?.day);

  if (load.isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-xl text-primary">Load</h1>
        <ToggleGroup type="single" variant="outline" size="sm" value={sport} onValueChange={(v) => v && setSport(v as Sport)}>
          <ToggleGroupItem value="ride">Cycling</ToggleGroupItem>
          <ToggleGroupItem value="run">Running</ToggleGroupItem>
          <ToggleGroupItem value="all">All</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!hasData && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          No training load yet. Tap <b>Sync</b> after your rides and runs reach intervals.icu. Planned workouts in your intervals.icu calendar show up here too.
        </CardContent></Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Next test</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          {next && nextPoint ? (
            <>
              <p className="font-mono text-2xl text-primary">{daysTo === 0 ? 'Today' : `${daysTo} day${daysTo === 1 ? '' : 's'}`}</p>
              <p>{TEST_LABEL[next.kind] ?? next.kind} on {shortDay(next.day)}{next.name ? ` (${next.name})` : ''}</p>
              <p>
                Projected Form that day: <span className="font-mono" style={{ color: formZone(nextPoint.form).color }}>{fmt(nextPoint.form)}</span>{' '}
                {ready ? <span className="text-status-go">✓ in the test-ready band (+5 to +15)</span>
                  : <span className="text-muted-foreground">(test-ready band is +5 to +15)</span>}
              </p>
              <p className="text-xs text-muted-foreground">Projected from the workouts planned in intervals.icu. It changes if the plan changes.</p>
            </>
          ) : (
            <p className="text-muted-foreground">No test planned. Name a planned workout in intervals.icu with "FTP test", "VO2 test" or "Durability test" and it shows here.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 pt-6">
          <ZoneBar label="Ramp rate (Fitness change per week)" value={now?.ramp ?? null} zones={RAMP_ZONES} />
          <ZoneBar label="Form today" value={now?.form ?? null} zones={FORM_ZONES} />
          <HowToRead>
            <p><b>Ramp rate</b> is how much Fitness rose in the last 7 days. 3 to 7 a week builds fitness at a pace most people absorb; over 8 is fast and raises the risk of getting run down.</p>
            <p><b>Form</b> is yesterday's Fitness minus Fatigue. The zones match intervals.icu: below −30 high risk, −30 to −10 optimal training, −10 to +5 grey zone, +5 to +20 fresh, above +20 transition (losing fitness).</p>
            <p>Current zone: ramp {now?.ramp != null ? rampZone(now.ramp).name.toLowerCase() : 'not enough data'}, Form {now ? formZone(now.form).name.toLowerCase() : 'not enough data'}.</p>
          </HowToRead>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-base">Fitness, Fatigue and load</CardTitle></CardHeader>
        <CardContent>
          <Legend items={[
            { label: 'Actual load', color: C.cyan, area: true }, { label: 'Planned load', color: C.yellow, area: true, dashed: true },
            { label: 'Fitness', color: C.green }, { label: 'Fatigue', color: C.magenta }
          ]} />
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={shown} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={28} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} />
              <Area type="step" dataKey="planned" name="Planned" stroke={C.yellow} strokeDasharray="4 3" fill={C.yellow} fillOpacity={0.12} isAnimationActive={false} />
              <Area type="step" dataKey="actual" name="Actual" stroke={C.cyan} fill={C.cyan} fillOpacity={0.3} isAnimationActive={false} connectNulls={false} />
              <Line type="monotone" dataKey="atl" name="Fatigue" stroke={C.magenta} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Line type="monotone" dataKey="ctl" name="Fitness" stroke={C.green} strokeWidth={3} dot={false} isAnimationActive={false} />
              <ReferenceLine x={today} stroke={C.text} strokeDasharray="2 2" label={{ value: 'today', fill: C.axis, fontSize: 10, position: 'insideTopRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
          <HowToRead>
            <p><b>Actual load</b> is each day's training stress: power for rides, pace for runs (heart rate as backup), and session RPE (RPE × minutes) for lifting and badminton. <b>Planned load</b> comes from the workouts in your intervals.icu calendar.</p>
            <p><b>Fitness</b> is your 42-day weighted load; <b>Fatigue</b> is your 7-day weighted load. After today the lines follow the plan.</p>
          </HowToRead>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-base">Weekly load vs plan</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={weeks} margin={{ top: 16, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="week" {...axis} tickFormatter={shortDay} />
              <YAxis {...axis} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="planned" name="Planned" fill={C.yellow} fillOpacity={0.25} stroke={C.yellow} strokeDasharray="3 2" isAnimationActive={false} />
              <Bar dataKey="actual" name="Actual" isAnimationActive={false}>
                {weeks.map((w) => <Cell key={w.week} fill={w.pct !== null && w.pct > 120 ? C.orange : C.cyan} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-1 grid grid-cols-4 gap-1 text-center font-mono text-[11px] sm:grid-cols-8">
            {weeks.map((w) => (
              <div key={w.week} className={w.pct !== null && w.pct > 120 ? 'text-status-warn' : 'text-muted-foreground'}>
                {shortDay(w.week)}<br />{w.pct === null ? 'no plan' : `${w.pct}%`}
              </div>
            ))}
          </div>
          <HowToRead>
            <p>Each pair of bars is one week (Monday to Sunday): planned load dashed, actual solid. The percentage is actual ÷ planned. Weeks more than 20% over plan turn orange, the same rule as the load alert on Today.</p>
          </HowToRead>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-1"><CardTitle className="text-base">Form</CardTitle></CardHeader>
        <CardContent>
          <Legend items={[...FORM_ZONES.map((z) => ({ label: z.name, color: z.color, area: true })), { label: 'Test-ready', color: '#ffffff', area: true, dashed: true }]} />
          <ResponsiveContainer width="100%" height={210}>
            <ComposedChart data={shown} margin={{ top: 8, right: 4, bottom: 0, left: -18 }}>
              {FORM_ZONES.map((z) => <ReferenceArea key={z.name} y1={z.from} y2={z.to} fill={z.color} fillOpacity={0.1} stroke="none" ifOverflow="hidden" />)}
              <ReferenceArea y1={TEST_READY.from} y2={TEST_READY.to} fill="#ffffff" fillOpacity={0.06} stroke="#ffffff" strokeDasharray="3 3" strokeOpacity={0.4} ifOverflow="hidden" />
              <CartesianGrid stroke={C.grid} vertical={false} strokeOpacity={0.5} />
              <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={28} />
              <YAxis {...axis} domain={[-40, 30]} ticks={[-30, -10, 5, 20]} allowDataOverflow />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="form" name="Form" stroke={C.text} strokeWidth={2} dot={false} isAnimationActive={false} />
              <ReferenceLine x={today} stroke={C.text} strokeDasharray="2 2" />
              {testDays.map((t) => (
                <ReferenceLine key={t.day + t.kind} x={t.day} stroke={C.yellow} strokeDasharray="1 3"
                  label={{ value: t.kind.replace(' test', ''), fill: C.yellow, fontSize: 9, position: 'insideTopLeft' }} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
          <HowToRead>
            <p>The coloured bands are the intervals.icu Form zones. The dashed white band (+5 to +15) is where you want to be on VO2 and FTP test days. Yellow lines mark planned tests; after today the line is projected from the plan.</p>
          </HowToRead>
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">Training guidance, not medical advice.</p>
    </div>
  );
}
