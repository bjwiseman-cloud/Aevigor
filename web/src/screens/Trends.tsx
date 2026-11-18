import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { useCheckins, useDailyLoad, useProfile, useWellness } from '@/hooks/data';
import { trends, type TrendPoint } from '@/lib/metrics';
import { fmt, todayIn } from '@/lib/time';

const H = 150;
const margin = { top: 6, right: 4, bottom: 0, left: -22 };

function TrendCard({ title, legend, children, how }: { title: string; legend: ReactNode; children: ReactNode; how: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {legend}
        {children}
        <HowToRead>{how}</HowToRead>
      </CardContent>
    </Card>
  );
}

function Readout({ p }: { p: TrendPoint | undefined }) {
  if (!p) return null;
  const cell = (label: string, v: string) => (
    <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="font-mono text-sm">{v}</div></div>
  );
  return (
    <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 sm:grid-cols-6">
      {cell('Feel', `${fmt(p.feel)} / 25${p.sick ? ' 🤒' : ''}`)}
      {cell('HRV 7-day', `${fmt(p.hrv7)} ms`)}
      {cell('Sleep', `${fmt(p.sleep, ' h')}`)}
      {cell('Resting HR', `${fmt(p.rhr)} bpm`)}
      {cell('RPE day before', fmt(p.prevRpe))}
      {cell('Load day before', String(p.prevLoad))}
    </div>
  );
}

export function Trends() {
  const profile = useProfile();
  const p = profile.data;
  const wellness = useWellness(p);
  const checkins = useCheckins(p);
  const load = useDailyLoad(p);
  const [weeks, setWeeks] = useState('8');
  const today = p ? todayIn(p.time_zone) : '';

  const data = useMemo(() => {
    if (!today || !wellness.data || !checkins.data || !load.data) return [];
    return trends(wellness.data, checkins.data, load.data.filter((r) => r.day <= today), addDays(today, -7 * Number(weeks) + 1), today);
  }, [wellness.data, checkins.data, load.data, weeks, today]);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(data.length - 1); }, [data.length]);
  const sel = data[idx];

  if (wellness.isLoading || checkins.isLoading || load.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const hasData = data.some((d) => d.hrv !== null || d.rhr !== null || d.feel !== null || d.sleep !== null);
  const marker = sel ? <ReferenceLine x={sel.day} stroke={C.text} strokeOpacity={0.6} /> : null;
  const x = <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={30} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold tracking-wide">Trends</h1>
        <ToggleGroup type="single" variant="outline" size="sm" value={weeks} onValueChange={(v) => v && setWeeks(v)}>
          <ToggleGroupItem value="4">4 wk</ToggleGroupItem>
          <ToggleGroupItem value="8">8 wk</ToggleGroupItem>
          <ToggleGroupItem value="12">12 wk</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!hasData ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          No data yet. Trends fill in once your watch's HRV, resting HR and sleep reach intervals.icu, and as you do the morning check-in. Tap <b>Sync</b> to update.
        </CardContent></Card>
      ) : (
        <div className="sticky top-[53px] z-[5] -mx-4 border-b bg-background/95 px-4 py-2 backdrop-blur">
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-mono text-primary">{sel ? shortDay(sel.day) : ''} morning</span>
            <span className="text-muted-foreground">drag to move through the days</span>
          </div>
          <Slider min={0} max={Math.max(0, data.length - 1)} step={1} value={[idx]} onValueChange={(v) => setIdx(v[0])} aria-label="Day" className="mb-2" />
          <Readout p={sel} />
        </div>
      )}

      <TrendCard
        title="1. How you feel"
        legend={<Legend items={[{ label: 'Daily', color: C.cyan }, { label: '7-day', color: C.green }, { label: 'Your normal', color: C.band, area: true }]} />}
        how={<>
          <p>Feel adds up your check-in answers (fatigue, soreness, sleep quality, stress, mood) out of 25. Higher is better. The band is your own 4-week normal (average ± 1 SD). Days you logged sickness are marked in the strip below.</p>
          <p>It carries the most weight in your daily status (<a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/26423706/" target="_blank" rel="noopener">Saw 2016</a>).</p>
        </>}
      >
        <ResponsiveContainer width="100%" height={H}>
          <ComposedChart data={data} margin={margin} syncId="trends">
            <CartesianGrid stroke={C.grid} vertical={false} />{x}
            <YAxis {...axis} domain={[5, 25]} ticks={[5, 10, 15, 20, 25]} />
            <Tooltip {...tooltipStyle} />
            <Area dataKey="feelBand" name="Normal" stroke="none" fill={C.band} fillOpacity={0.12} isAnimationActive={false} />
            <Line dataKey="feel" name="Feel" stroke="none" dot={{ r: 2.5, fill: C.cyan, strokeWidth: 0 }} isAnimationActive={false} />
            <Line dataKey="feel7" name="7-day" stroke={C.green} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-2">
          <span className="w-10 shrink-0 text-[10px] text-muted-foreground">Sick</span>
          <ResponsiveContainer width="100%" height={14}>
            <BarChart data={data} margin={{ top: 0, right: 4, bottom: 0, left: 0 }} barCategoryGap={1}>
              <XAxis dataKey="day" hide />
              <YAxis hide domain={[0, 1]} />
              <Bar dataKey={(d: TrendPoint) => (d.sick ? 1 : 0)} isAnimationActive={false}>
                {data.map((d) => <Cell key={d.day} fill={d.sick === 'Yes' ? C.red : C.yellow} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[10px] text-muted-foreground">Yellow = mild (above the neck), red = sick (below the neck).</p>
      </TrendCard>

      <TrendCard
        title="2. HRV 7-day trend"
        legend={<Legend items={[{ label: 'Daily HRV', color: C.cyan }, { label: '7-day', color: C.green }, { label: '60-day normal', color: C.band, area: true }]} />}
        how={<>
          <p>Overnight HRV (rMSSD, ms) from your watch via intervals.icu. The bold line is the 7-day average, which is what the status uses; single days bounce around a lot.</p>
          <p>The band is your 60-day normal, from 0.5 SD below to 1 SD above your average (worked out on a log scale), the same method intervals.icu uses. Below the band for 3+ days in a row is a deload sign (<a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/22367011/" target="_blank" rel="noopener">Plews 2012</a>).</p>
        </>}
      >
        <ResponsiveContainer width="100%" height={H}>
          <ComposedChart data={data} margin={margin} syncId="trends">
            <CartesianGrid stroke={C.grid} vertical={false} />{x}
            <YAxis {...axis} domain={['dataMin - 5', 'dataMax + 5']} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Area dataKey="hrvBand" name="Normal" stroke="none" fill={C.band} fillOpacity={0.12} isAnimationActive={false} />
            <Line dataKey="hrv" name="HRV" stroke="none" dot={{ r: 2.5, fill: C.cyan, strokeWidth: 0 }} isAnimationActive={false} />
            <Line dataKey="hrv7" name="7-day" stroke={C.green} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        title="3. Sleep"
        legend={<Legend items={[{ label: 'Nightly', color: C.cyan }, { label: '7-night average', color: C.green }, { label: 'Target 7-9 h', color: C.green, area: true }, { label: 'Borderline 6-7 h', color: C.yellow, area: true }]} />}
        how={<p>Hours of sleep from your watch. The bands match intervals.icu: 7 to 9 h target, 6 to 7 h borderline, under 6 h short. A night under 6 h lowers the status one step (<a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/25315456/" target="_blank" rel="noopener">Fullagar 2015</a>).</p>}
      >
        <ResponsiveContainer width="100%" height={H}>
          <ComposedChart data={data} margin={margin} syncId="trends">
            <ReferenceArea y1={7} y2={9} fill={C.green} fillOpacity={0.1} stroke="none" />
            <ReferenceArea y1={6} y2={7} fill={C.yellow} fillOpacity={0.1} stroke="none" />
            <CartesianGrid stroke={C.grid} vertical={false} />{x}
            <YAxis {...axis} domain={[4, 10]} ticks={[4, 6, 7, 9, 10]} allowDataOverflow />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="sleep" name="Sleep (h)" fill={C.cyan} fillOpacity={0.45} isAnimationActive={false} />
            <Line dataKey="sleep7" name="7-night" stroke={C.green} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        title="4. Resting heart rate"
        legend={<Legend items={[{ label: 'Daily', color: C.magenta }, { label: '7-day', color: C.green }, { label: '60-day normal', color: C.band, area: true }]} />}
        how={<p>Overnight resting HR. Lower is usually better. The band is your 60-day average ± 0.5 SD, as in intervals.icu. Resting HR only confirms the other signals; on its own it never changes the status.</p>}
      >
        <ResponsiveContainer width="100%" height={H}>
          <ComposedChart data={data} margin={margin} syncId="trends">
            <CartesianGrid stroke={C.grid} vertical={false} />{x}
            <YAxis {...axis} domain={['dataMin - 3', 'dataMax + 3']} allowDecimals={false} />
            <Tooltip {...tooltipStyle} />
            <Area dataKey="rhrBand" name="Normal" stroke="none" fill={C.band} fillOpacity={0.12} isAnimationActive={false} />
            <Line dataKey="rhr" name="Resting HR" stroke="none" dot={{ r: 2.5, fill: C.magenta, strokeWidth: 0 }} isAnimationActive={false} />
            <Line dataKey="rhr7" name="7-day" stroke={C.green} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        title="5. Daily RPE"
        legend={<Legend items={[{ label: 'Hardest session that day', color: C.orange }, { label: '7-day average', color: C.green }]} />}
        how={<p>How hard your hardest session felt (RPE 1-10), from the effort you enter for each activity in intervals.icu. The readout above pairs each morning with the day before, so you can see how yesterday's effort lines up with how you feel today.</p>}
      >
        <ResponsiveContainer width="100%" height={H}>
          <ComposedChart data={data} margin={margin} syncId="trends">
            <CartesianGrid stroke={C.grid} vertical={false} />{x}
            <YAxis {...axis} domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="rpe" name="RPE" fill={C.orange} fillOpacity={0.6} isAnimationActive={false} />
            <Line dataKey="rpe7" name="7-day" stroke={C.green} strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
      </TrendCard>

      <TrendCard
        title="6. Training load"
        legend={<Legend items={[{ label: 'Daily load', color: C.cyan }, { label: '7-day weighted (Fatigue)', color: C.magenta, area: true }]} />}
        how={<p>Daily training stress across all sports (power for rides, pace for runs, RPE × minutes for lifting and badminton). The shaded line is the 7-day weighted load, the same as Fatigue on the Load page.</p>}
      >
        <ResponsiveContainer width="100%" height={H}>
          <ComposedChart data={data} margin={margin} syncId="trends">
            <CartesianGrid stroke={C.grid} vertical={false} />{x}
            <YAxis {...axis} />
            <Tooltip {...tooltipStyle} />
            <Area dataKey="atl" name="7-day weighted" stroke={C.magenta} strokeWidth={2.5} fill={C.magenta} fillOpacity={0.15} isAnimationActive={false} />
            <Bar dataKey="load" name="Load" fill={C.cyan} fillOpacity={0.6} isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
      </TrendCard>
      <p className="text-center text-xs text-muted-foreground">Training guidance, not medical advice.</p>
    </div>
  );
}
