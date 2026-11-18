// Trends, ported from the live app (Apps Script V15-V18): 4 or 12 weeks, a picker for which charts show
// (saved to the account), HRV day-to-day variation (CV), the amber "Building fatigue" shading, the check-in
// logs, extra numbers from intervals.icu, the Load charts, and one slider that moves through every chart.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { addDays } from '@rules';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Chip, Chips } from '@/components/chips';
import { C, HowToRead, Legend, axis, shortDay, tooltipStyle } from '@/components/charts';
import { useCheckins, useDailyLoad, usePref, useProfile, useWellness } from '@/hooks/data';
import { EXTRA_METRICS, flagRuns, trends, type TrendPoint } from '@/lib/metrics';
import { todayIn } from '@/lib/time';
import { LoadTrendCards } from '@/screens/Load';

const ALL: [string, string][] = [
  ['feel', 'Feel · check-in score'], ['hrv', 'HRV · 7-day trend'], ['cv', 'HRV day-to-day variation (CV)'], ['sleep', 'Sleep'], ['rhr', 'Resting HR'],
  ['clarity', 'Mental clarity'], ['libido', 'Libido (optional log)'], ['caffeine', 'Caffeine'], ['alcohol', 'Alcohol'], ['bodyTemp', 'Body temperature'], ['rpe', 'Daily RPE'], ['load', 'Training load'],
  ['pmc', 'Fitness · Fatigue'], ['form', 'Form zones'], ['plan', 'Actual vs planned load'],
  ['weight', 'Body weight'], ['bodyFat', 'Body fat'], ['vo2max', 'VO2 max (watch estimate)'], ['steps', 'Steps'], ['sleepScore', 'Sleep score'],
  ['spO2', 'Blood oxygen (SpO2)'], ['respiration', 'Breathing rate'], ['hydration', 'Hydration']
];
const GROUPS: Record<string, string> = { feel: 'Readiness signals', clarity: 'Check-in logs', pmc: 'Training load (same as the Load tab)', weight: 'From intervals.icu or your watch' };
const DEFAULT = ['feel', 'hrv', 'cv', 'sleep', 'rhr', 'clarity', 'libido', 'rpe', 'load'];
const FATIGUE = 'rgba(255,176,46,0.22)';
const H = 140;
const margin = { top: 6, right: 4, bottom: 0, left: -22 };
const r1 = (v: number | null | undefined) => (v === null || v === undefined ? '–' : String(Math.round(v * 10) / 10));

function TrendCard({ title, legend, children, how, help }: { title: string; legend: ReactNode; children: ReactNode; how: ReactNode; help?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-base" help={help}>{title}</CardTitle></CardHeader>
      <CardContent>{legend}{children}<HowToRead>{how}</HowToRead></CardContent>
    </Card>
  );
}

function Picker({ on, libOn, onSave }: { on: string[]; libOn: boolean; onSave: (v: string[]) => void }) {
  const [draft, setDraft] = useState<string[] | null>(null);
  const cur = draft ?? on;
  const list = ALL.filter(([k]) => k !== 'libido' || libOn);
  return (
    <Accordion type="single" collapsible className="rounded-lg border bg-card px-3">
      <AccordionItem value="p" className="border-b-0">
        <AccordionTrigger className="py-2 text-sm">⚙ Choose charts ({on.filter((k) => list.some(([x]) => x === k)).length} on)</AccordionTrigger>
        <AccordionContent className="space-y-1 text-sm">
          {list.map(([k, label]) => (
            <div key={k}>
              {GROUPS[k] && <div className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{GROUPS[k]}</div>}
              <label className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={cur.includes(k)} onChange={(e) => setDraft(e.target.checked ? [...cur, k] : cur.filter((x) => x !== k))} />{label}
              </label>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={() => { onSave(cur); setDraft(null); }}>Save</Button>
            <Button size="sm" variant="outline" onClick={() => { onSave(DEFAULT); setDraft(null); }}>Reset to default</Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function Trends() {
  const p = useProfile().data!;
  const wellness = useWellness(p), checkins = useCheckins(p), load = useDailyLoad(p);
  const pref = usePref<string[]>('trends_metrics', DEFAULT);
  const [range, setRange] = useState(28);
  const today = todayIn(p.time_zone);
  const from = addDays(today, -range + 1);
  const libOn = !!p.libido_log;
  const on = (k: string) => pref.value.includes(k) && (k !== 'libido' || libOn);

  const data = useMemo(() => {
    if (!wellness.data || !checkins.data || !load.data) return [];
    return trends(wellness.data, checkins.data, load.data.filter((r) => r.day <= today), from, today);
  }, [wellness.data, checkins.data, load.data, from, today]);

  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(data.length - 1); }, [data.length]);
  const sel: TrendPoint | undefined = data[idx];

  if (wellness.isLoading || checkins.isLoading || load.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  const hasData = data.some((d) => d.hrv !== null || d.rhr !== null || d.feel !== null || d.sleep !== null);
  const runs = flagRuns(data);
  const fatigueShade = runs.map(([a, b]) => <ReferenceArea key={a} x1={a} x2={b} fill={FATIGUE} fillOpacity={1} stroke="none" ifOverflow="hidden" />);
  const marker = sel ? <ReferenceLine x={sel.day} stroke={C.text} strokeOpacity={0.6} /> : null;
  const x = <XAxis dataKey="day" {...axis} tickFormatter={shortDay} minTickGap={30} />;
  const grid = <CartesianGrid stroke={C.grid} vertical={false} />;
  const tip = <Tooltip {...tooltipStyle} />;
  const sleepVals = data.map((d) => d.sleep).filter((v): v is number => v !== null);
  const sleepMax = Math.max(10, Math.ceil(Math.max(0, ...sleepVals)));
  const sleepMin = Math.min(3, Math.floor(Math.min(3, ...sleepVals)));
  const chart = (children: ReactNode, height = H) => (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={margin} syncId="trends">{children}</ComposedChart>
    </ResponsiveContainer>
  );

  const cards: Record<string, ReactNode> = {
    feel: (
      <TrendCard title="Feel · check-in score" help="feel"
        legend={<Legend items={[{ label: 'Daily /25', color: C.green }, { label: '7-day', color: C.green }, { label: 'Your normal', color: C.green, area: true }, { label: 'Sick', color: C.red, area: true }, { label: 'Mild', color: C.yellow, area: true }]} />}
        how={<p>Your morning check-in scored out of 25 (higher is better). The band is your 4-week normal. Well below it, or any answer at the worst level, sets GO EASY. The short bars along the bottom mark sick days.</p>}>
        {chart(<>
          {grid}{x}<YAxis {...axis} domain={[5, 25]} ticks={[10, 15, 20, 25]} />{tip}
          <Area dataKey="feelBand" name="Normal" stroke="none" fill={C.green} fillOpacity={0.12} isAnimationActive={false} />
          <Bar dataKey={(d: TrendPoint) => (d.sick ? 6.2 : null)} name="Sick" isAnimationActive={false} barSize={6}>
            {data.map((d) => <Cell key={d.day} fill={d.sick === 'Yes' ? C.red : C.yellow} />)}
          </Bar>
          <Line dataKey="feel" name="Feel" stroke="none" dot={{ r: 2.5, fill: C.green, strokeWidth: 0 }} isAnimationActive={false} />
          <Line dataKey="feel7" name="7-day" stroke={C.green} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>)}
      </TrendCard>
    ),
    hrv: (
      <TrendCard title="HRV · 7-day trend" help="hrv"
        legend={<Legend items={[{ label: 'Daily ms', color: C.cyan }, { label: '7-day', color: C.cyan }, { label: 'Normal band', color: C.cyan, area: true }, { label: 'Building fatigue', color: '#ffb02e', area: true }]} />}
        how={<p>Dots are each morning, the bold line is the 7-day average and the band is your 60-day normal (-0.5 to +1 SD, on a log scale like intervals.icu). The shaded amber area marks days when HRV sat below its band and day-to-day variation (CV) was outside its usual range for 3+ days: a stronger sign of fatigue (<a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/22367011/" target="_blank" rel="noopener">Plews 2012</a>).</p>}>
        {chart(<>
          {fatigueShade}{grid}{x}<YAxis {...axis} domain={['dataMin - 3', 'dataMax + 3']} allowDecimals={false} />{tip}
          <Area dataKey="hrvBand" name="Normal" stroke="none" fill={C.cyan} fillOpacity={0.12} isAnimationActive={false} />
          <Line dataKey="hrv" name="HRV" stroke="none" dot={{ r: 2.5, fill: C.cyan, strokeWidth: 0 }} isAnimationActive={false} />
          <Line dataKey="hrv7" name="7-day" stroke={C.cyan} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>, 160)}
      </TrendCard>
    ),
    cv: (
      <TrendCard title="HRV day-to-day variation (CV)" help="hrv"
        legend={<Legend items={[{ label: 'CV % (7 days)', color: C.magenta }, { label: 'Your usual range', color: C.magenta, area: true }, { label: 'Building fatigue', color: '#ffb02e', area: true }]} />}
        how={<p>How much your morning HRV jumps around from day to day over the last 7 days (coefficient of variation of ln HRV). The band is your 60-day usual range. On its own it means little; together with HRV below its band for 3+ days (shaded amber, Building fatigue) it is a stronger sign of fatigue (<a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/22367011/" target="_blank" rel="noopener">Plews 2012</a>).</p>}>
        {chart(<>
          {fatigueShade}{grid}{x}<YAxis {...axis} domain={[(m: number) => Math.max(0, Math.floor(m - 1)), (m: number) => Math.ceil(m + 1)]} tickFormatter={(v) => `${v}%`} />{tip}
          <Area dataKey="cvBand" name="Usual range" stroke="none" fill={C.magenta} fillOpacity={0.12} isAnimationActive={false} />
          <Line dataKey="cv" name="CV %" stroke={C.magenta} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>, 120)}
      </TrendCard>
    ),
    sleep: (
      <TrendCard title="Sleep" help="sleep"
        legend={<Legend items={[{ label: 'Nightly', color: C.cyan }, { label: '7-night', color: C.cyan }, { label: '7-9 h target', color: C.green, area: true }, { label: '6-7 h', color: C.yellow, area: true }]} />}
        how={<p>Bars are each night. Target 7-9 h, borderline 6-7 h, short under 6 h. A night under 6 h lowers the status one step; two in a row count toward the Weekly check (<a className="text-primary underline" href="https://pubmed.ncbi.nlm.nih.gov/25315456/" target="_blank" rel="noopener">Fullagar 2015</a>).</p>}>
        {chart(<>
          <ReferenceArea y1={7} y2={9} fill={C.green} fillOpacity={0.1} stroke="none" />
          <ReferenceArea y1={6} y2={7} fill={C.yellow} fillOpacity={0.1} stroke="none" />
          {grid}{x}<YAxis {...axis} domain={[sleepMin, sleepMax]} ticks={[4, 6, 7, 9, ...(sleepMax > 10 ? [sleepMax] : [])]} />{tip}
          <Bar dataKey="sleep" name="Sleep (h)" isAnimationActive={false}>
            {data.map((d) => <Cell key={d.day} fill={d.sleep !== null && d.sleep < 6 ? C.red : d.sleep !== null && d.sleep < 7 ? C.yellow : C.cyan} fillOpacity={0.6} />)}
          </Bar>
          <Line dataKey="sleep7" name="7-night" stroke={C.cyan} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>, 130)}
      </TrendCard>
    ),
    rhr: (
      <TrendCard title="Resting HR" help="rhr"
        legend={<Legend items={[{ label: 'Daily bpm', color: C.orange }, { label: '7-day', color: C.orange }, { label: 'Normal band', color: C.orange, area: true }]} />}
        how={<p>Lower is better. The band is your 60-day average ± 0.5 SD, as in intervals.icu. Resting HR only confirms the other signals: high resting HR with low HRV and low Feel is a stronger reason to go easy.</p>}>
        {chart(<>
          {grid}{x}<YAxis {...axis} domain={['dataMin - 2', 'dataMax + 2']} allowDecimals={false} />{tip}
          <Area dataKey="rhrBand" name="Normal" stroke="none" fill={C.orange} fillOpacity={0.14} isAnimationActive={false} />
          <Line dataKey="rhr" name="Resting HR" stroke="none" dot={{ r: 2.5, fill: C.orange, strokeWidth: 0 }} isAnimationActive={false} />
          <Line dataKey="rhr7" name="7-day" stroke={C.orange} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>, 130)}
      </TrendCard>
    ),
    clarity: (
      <TrendCard title="Mental clarity" help="feel"
        legend={<Legend items={[{ label: 'Daily 1-5', color: C.cyan }, { label: '7-day', color: C.cyan }]} />}
        how={<p>Your morning answer: 1 very foggy, 2 foggy, 3 normal, 4 clear, 5 very sharp. Dots are each morning and the bold line is the 7-day average. A log only: it does not change the status.</p>}>
        {chart(<>
          {grid}{x}<YAxis {...axis} domain={[0.5, 5.5]} ticks={[1, 3, 5]} />{tip}
          <Line dataKey="clarity" name="Clarity" stroke="none" dot={{ r: 2.5, fill: C.cyan, strokeWidth: 0 }} isAnimationActive={false} />
          <Line dataKey="clarity7" name="7-day" stroke={C.cyan} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>, 110)}
      </TrendCard>
    ),
    libido: (
      <TrendCard title="Libido · 7-day average"
        legend={<Legend items={[{ label: 'Daily 0-7', color: C.magenta }, { label: '7-day average', color: C.magenta }]} />}
        how={<p>Optional private log on a 0-7 scale (0 none, 4 moderate, 7 very high). Dots are each day you logged. The bold line is the 7-day average and only shows for weeks with at least 4 days logged. A pattern in your own entries, not a measure of health. Not medical advice.</p>}>
        {chart(<>
          {grid}{x}<YAxis {...axis} domain={[-0.5, 7.5]} ticks={[0, 4, 7]} />{tip}
          <Line dataKey="libido" name="Libido" stroke="none" dot={{ r: 2.5, fill: C.magenta, strokeWidth: 0 }} isAnimationActive={false} />
          <Line dataKey="libido7" name="7-day" stroke={C.magenta} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
          {marker}
        </>, 110)}
      </TrendCard>
    ),
    rpe: (
      <TrendCard title="Daily RPE · hardest session" help="load-vs-plan"
        legend={<Legend items={[{ label: 'RPE 1-10, day before each morning', color: C.yellow, area: true }]} />}
        how={<p>The hardest session of each day, all sports, shown against the next morning. It does not change the status; it helps explain the next morning.</p>}>
        {chart(<>
          {grid}{x}<YAxis {...axis} domain={[0, 10]} ticks={[0, 5, 10]} />{tip}
          <Bar dataKey="rpe" name="RPE (day before)" fill={C.yellow} fillOpacity={0.65} isAnimationActive={false} />
          {marker}
        </>, 110)}
      </TrendCard>
    ),
    load: (
      <TrendCard title="Training load" help="fitness-fatigue-form"
        legend={<Legend items={[{ label: 'Daily load', color: C.magenta }, { label: '7-day weighted', color: C.magenta, area: true }]} />}
        how={<p>Daily load from intervals.icu (power for rides, pace for runs, session RPE for lifting and badminton) with a 7-day weighted line, like Fatigue on the Load tab. Each morning shows the day before.</p>}>
        {chart(<>
          {grid}{x}<YAxis {...axis} domain={[0, 'auto']} />{tip}
          <Area dataKey="atl" name="7-day weighted" stroke={C.magenta} strokeWidth={2.5} fill={C.magenta} fillOpacity={0.16} isAnimationActive={false} />
          <Line dataKey="load" name="Load (day before)" stroke="none" dot={{ r: 2.5, fill: C.magenta, strokeWidth: 0 }} isAnimationActive={false} />
          {marker}
        </>, 130)}
      </TrendCard>
    )
  };
  for (const [k, m] of Object.entries(EXTRA_METRICS)) {
    const title = ALL.find(([a]) => a === k)![1];
    const has = data.some((d) => d.x[k]?.v !== null);
    const col = k === 'caffeine' ? C.yellow : k === 'alcohol' ? C.magenta : k === 'bodyTemp' ? C.orange : C.cyan;
    const rows = data.map((d) => ({ day: d.day, v: d.x[k]?.v ?? null, v7: d.x[k]?.v7 ?? null }));
    cards[k] = !has ? (
      <Card key={k}><CardHeader className="pb-1"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">{m.col ? 'Nothing logged for these weeks yet. Add it in the check-in under ☕ Caffeine · alcohol · temperature.' : 'No entries in intervals.icu for these weeks yet. It fills in once your watch or scale syncs it, or you log it there.'}</CardContent></Card>
    ) : (
      <TrendCard title={title} legend={<Legend items={[{ label: 'Daily', color: col, area: !!m.bars }, { label: '7-day', color: col }]} />} how={<p>{m.how}</p>}>
        <ResponsiveContainer width="100%" height={120}>
          <ComposedChart data={rows} margin={margin} syncId="trends">
            {grid}{x}<YAxis {...axis} domain={m.bars ? [0, 'auto'] : ['dataMin - 1', 'dataMax + 1']} tickFormatter={(v) => String(Math.round(v * 10) / 10)} />
            <Tooltip {...tooltipStyle} formatter={(v) => [`${m.d ? Math.round(Number(v) * 10) / 10 : Math.round(Number(v))}${m.u}`, title]} />
            {m.bars ? <Bar dataKey="v" name="Daily" fill={col} fillOpacity={0.5} isAnimationActive={false} />
              : <Line dataKey="v" name="Daily" stroke="none" dot={{ r: 2.5, fill: col, strokeWidth: 0 }} isAnimationActive={false} />}
            <Line dataKey="v7" name="7-day" stroke={col} strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
            {marker}
          </ComposedChart>
        </ResponsiveContainer>
      </TrendCard>
    );
  }

  const loadKeys = ['pmc', 'form', 'plan'].filter(on);
  const parts: string[] = [];
  if (sel) {
    if (on('feel')) parts.push(`Feel ${r1(sel.feel)}`);
    if (on('hrv')) parts.push(`HRV ${r1(sel.hrv)} (7d ${r1(sel.hrv7)})`);
    if (on('cv')) parts.push(`CV ${r1(sel.cv)}%`);
    if (on('sleep')) parts.push(`Sleep ${r1(sel.sleep)} h`);
    if (on('rhr')) parts.push(`RHR ${r1(sel.rhr)}`);
    if (on('clarity')) parts.push(`Clarity ${r1(sel.clarity)}`);
    if (on('libido')) parts.push(`Libido ${r1(sel.libido)} (7d ${r1(sel.libido7)})`);
    for (const [k, m] of Object.entries(EXTRA_METRICS)) if (on(k)) { const v = sel.x[k]?.v; parts.push(`${ALL.find(([a]) => a === k)![1].split(' (')[0]} ${v == null ? '–' : (m.d ? r1(v) : Math.round(v)) + m.u}`); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-bold tracking-wide">Trends</h1>
        <Chips><Chip on={range === 28} onClick={() => setRange(28)}>4 weeks</Chip><Chip on={range === 84} onClick={() => setRange(84)}>12 weeks</Chip></Chips>
      </div>
      <Picker on={pref.value} libOn={libOn} onSave={async (v) => { try { await pref.save(v); toast.success('Saved'); } catch (e) { toast.error((e as Error).message); } }} />

      {!hasData && (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          No data yet. Trends fill in once your watch's HRV, resting HR and sleep reach intervals.icu, and as you do the morning check-in. Pull down to sync.
        </CardContent></Card>
      )}

      {ALL.filter(([k]) => on(k)).map(([k]) => (
        ['pmc', 'form', 'plan'].includes(k)
          ? (k === loadKeys[0] ? <LoadTrendCards key="load" from={from} to={today} show={loadKeys} selDay={sel?.day} /> : null)
          : <div key={k}>{cards[k]}</div>
      ))}

      {hasData && sel && (
        <div className="sticky bottom-16 z-[5] -mx-4 border-t bg-background/95 px-4 py-2 backdrop-blur">
          <Slider min={0} max={Math.max(0, data.length - 1)} step={1} value={[idx]} onValueChange={(v) => setIdx(v[0])} aria-label="Day" className="mb-2" />
          <p className="text-xs">
            <b>{shortDay(sel.day)} morning</b> · {parts.join(' · ')}<br />
            Day before: RPE <b>{r1(sel.rpe)}</b> · Load <b>{sel.load}</b>{sel.sick && <span style={{ color: C.red }}> · Sick: {sel.sick}</span>}{sel.fatigueFlag && <span style={{ color: '#d98a00' }}> · Building fatigue</span>}
          </p>
        </div>
      )}
      <p className="text-center text-xs text-muted-foreground">Training guidance, not medical advice.</p>
    </div>
  );
}
