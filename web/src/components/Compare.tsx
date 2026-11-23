// Compare 2 to 4 sessions (Ben 2026-11-23): option A bars per metric, two power radars (Coggan profile and
// Xert-style PP/HIE/TP) for sessions with power, and both kinds of load (TSS, and intervals.icu Strain Score).
import { useMemo, useState } from 'react';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HowToRead, C, shortDay, tooltipStyle } from '@/components/charts';
import { useProfile } from '@/hooks/data';
import { duration, isRide, isRun, n, weightOf, type Activity } from '@/lib/perf';
import { CATEGORIES, COGGAN_LABEL, COGGAN_SECS, category, cogganProfile, cogganStep, categoryFloor, riderType, strain, xert } from '@/lib/compare';
import { cn } from '@/lib/utils';
import { TONE } from '@/components/Achievements';
import { Chip, Chips } from '@/components/chips';

export const SESSION_COLOURS = ['#0ea5e9', '#f43f5e', '#a855f7', '#f59e0b'];
const FEEL = ['', '💪 Strong', '🙂 Good', '😐 Normal', '😕 Poor', '😫 Weak'];
const ifOf = (a: Activity) => { const v = n(a, 'icu_intensity'); return v == null ? null : v > 3 ? v / 100 : v; };

type Bar = { icon: string; label: string; colour: string; get: (a: Activity) => number | null; show: (v: number, a: Activity) => string; max?: number };
const BARS: Bar[] = [
  { icon: '⏱️', label: 'Moving time', colour: '#0ea5e9', get: (a) => a.moving_time || null, show: (v) => duration(v) },
  { icon: '🔋', label: 'Load (TSS)', colour: '#8b5cf6', get: (a) => a.load || null, show: (v) => String(Math.round(v)) },
  { icon: '🎯', label: 'Intensity (IF)', colour: '#f59e0b', get: ifOf, show: (v) => v.toFixed(2) },
  { icon: '🔥', label: 'Calories', colour: '#f97316', get: (a) => n(a, 'calories'), show: (v) => `${Math.round(v)} kcal` },
  { icon: '❤️', label: 'Avg heart rate', colour: '#ef4444', get: (a) => n(a, 'average_heartrate'), show: (v) => `${Math.round(v)} bpm` },
  { icon: '💓', label: 'Max heart rate', colour: '#b91c1c', get: (a) => n(a, 'max_heartrate'), show: (v) => `${Math.round(v)} bpm` },
  { icon: '🚀', label: 'Avg speed', colour: '#14b8a6', get: (a) => n(a, 'average_speed'), show: (v, a) => isRun(a) ? `${pace(v)} /km` : `${(v * 3.6).toFixed(1)} km/h` },
  { icon: '😤', label: 'RPE', colour: '#e11d48', get: (a) => n(a, 'icu_rpe'), show: (v) => `${Math.round(v)}/10`, max: 10 }
];
const pace = (ms: number) => { const s = 1000 / ms; return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`; };
const lab = (a: Activity) => (typeof a.raw._label === 'string' ? a.raw._label : shortDay(a.day));
const sportIcon = (a: Activity) => (isRide(a) ? '🚴' : isRun(a) ? '🏃' : '•');

function Key({ cmp }: { cmp: Activity[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {cmp.map((a, i) => <span key={a.id} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: SESSION_COLOURS[i] }} />{lab(a)} {a.raw._label ? '' : sportIcon(a)} <span className="max-w-[110px] truncate">{a.raw._label ? '' : a.name}</span></span>)}
    </div>
  );
}

function Bars({ cmp }: { cmp: Activity[] }) {
  return (
    <div className="space-y-3">
      {BARS.map((b) => {
        const vals = cmp.map((a) => b.get(a));
        if (vals.every((v) => v == null)) return null;
        const mx = b.max ?? Math.max(...vals.map((v) => v ?? 0));
        return (
          <div key={b.label}>
            <div className="mb-1 text-sm font-semibold">{b.icon} {b.label}</div>
            {cmp.map((a, i) => { const v = vals[i]; return (
              <div key={a.id} className="my-0.5 flex items-center gap-2">
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                  {v != null && <div className="h-full rounded-full animate-in slide-in-from-left duration-700 motion-reduce:animate-none" style={{ width: `${Math.max(3, (100 * v) / (mx || 1))}%`, background: `linear-gradient(90deg, ${b.colour}55, ${b.colour})` }} />}
                </div>
                <span className="min-w-[78px] text-right font-mono text-[11px]" style={{ color: SESSION_COLOURS[i] }}>● {v != null ? b.show(v, a) : '–'}</span>
              </div>
            ); })}
          </div>
        );
      })}
      {cmp.some((a) => n(a, 'feel')) && (
        <div>
          <div className="mb-1 text-sm font-semibold">🙂 Feel</div>
          <div className="flex flex-wrap gap-2">{cmp.map((a, i) => <span key={a.id} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: SESSION_COLOURS[i] }}>{FEEL[n(a, 'feel') ?? 0] || '–'}</span>)}</div>
        </div>
      )}
    </div>
  );
}

// Both kinds of load side by side: TSS (one number) and Strain Score (total + CP, W′ and Pmax parts).
function LoadGauges({ cmp }: { cmp: Activity[] }) {
  const ss = cmp.map(strain);
  const mxT = Math.max(...cmp.map((a) => a.load ?? 0), 1), mxS = Math.max(...ss.map((s) => s?.total ?? 0), 1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">{PARTS.map((p) => <span key={p.k} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: p.c }} />{p.label}</span>)}</div>
      {cmp.map((a, i) => { const s = ss[i]; return (
        <div key={a.id} className="space-y-1 rounded-md border p-2" style={{ borderLeft: `4px solid ${SESSION_COLOURS[i]}` }}>
          <div className="text-xs font-semibold">{shortDay(a.day)} · {a.name}</div>
          <div className="flex items-center gap-2 text-xs"><span className="w-14 text-muted-foreground">TSS</span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * (a.load ?? 0)) / mxT}%` }} /></div>
            <span className="w-12 text-right font-mono">{a.load ? Math.round(a.load) : '–'}</span></div>
          <div className="flex items-center gap-2 text-xs"><span className="w-14 text-muted-foreground">Strain</span>
            <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-muted">
              {s && PARTS.map((p) => { const v = s[p.k]; return v ? <div key={p.k} title={`${p.label} ${Math.round(v)}`} style={{ width: `${(100 * v) / mxS}%`, background: p.c }} /> : null; })}
              {s && s.cp == null && s.wp == null && s.pm == null && <div className="bg-slate-500" style={{ width: `${(100 * s.total) / mxS}%` }} />}
            </div>
            <span className="w-12 text-right font-mono">{s ? Math.round(s.total) : '–'}</span></div>
          {s && (s.cp != null || s.wp != null || s.pm != null) && <div className="pl-16 font-mono text-[11px] text-muted-foreground">CP {s.cp != null ? Math.round(s.cp) : '–'} · W′ {s.wp != null ? Math.round(s.wp) : '–'} · Pmax {s.pm != null ? Math.round(s.pm) : '–'}</div>}
        </div>
      ); })}
      {ss.every((s) => !s) && <p className="text-xs text-muted-foreground">No Strain Score from intervals.icu for these sessions yet. It needs W′ and Pmax set in your intervals.icu Sport Settings, and shows after the next sync.</p>}
    </div>
  );
}

// Playful gradient tile, the same look as the Achievements tiles.
function Tile({ tone, icon, top, big, sub, i = 0, dot, children }: { tone: keyof typeof TONE; icon: string; top: string; big?: string; sub?: string; i?: number; dot?: string; children?: React.ReactNode }) {
  return (
    <div style={{ animationDelay: `${i * 70}ms` }} className={cn('relative overflow-hidden rounded-xl bg-gradient-to-br p-3 shadow-md animate-pop motion-reduce:animate-none', TONE[tone])}>
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden" />
      {dot && <span className="absolute right-2 top-2 h-3 w-3 rounded-full ring-2 ring-white" style={{ background: dot }} />}
      <div className="relative text-2xl leading-none animate-float motion-reduce:animate-none" style={{ animationDelay: `${i * 230}ms` }}>{icon}</div>
      <div className="relative mt-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-90">{top}</div>
      {big && <div className="relative font-display text-2xl font-extrabold italic leading-tight">{big}</div>}
      {sub && <div className="relative text-[11px] opacity-90">{sub}</div>}
      {children && <div className="relative">{children}</div>}
    </div>
  );
}
// Category colours climb from cool (Untrained) to hot (World class).
const CAT_TONE: (keyof typeof TONE)[] = ['sky', 'teal', 'emerald', 'lime', 'amber', 'orange', 'rose', 'fuchsia'];
const TYPE_LOOK: Record<string, [keyof typeof TONE, string]> = {
  'All-rounder': ['emerald', '🌟'], Sprinter: ['rose', '⚡'], Pursuiter: ['fuchsia', '🎯'], 'Time trialist (climber type)': ['sky', '⛰️'], 'Unusual V shape': ['amber', '❓']
};
const AXIS_ICON: Record<string, string> = { '5 s': '⚡', '1 min': '🔥', '5 min': '💨', FT: '🛣️' };
const grads = (count: number) => (
  <defs>{SESSION_COLOURS.slice(0, count).map((c, i) => <radialGradient key={i} id={`rg${i}`}><stop offset="0%" stopColor={c} stopOpacity={0.15} /><stop offset="100%" stopColor={c} stopOpacity={0.55} /></radialGradient>)}</defs>
);

export function CogganRadar({ cmp, weight, sex }: { cmp: Activity[]; weight: number | null; sex: string | null | undefined }) {
  const prof = cmp.map((a) => cogganProfile(a, weightOf(a, weight)));
  if (!prof.some(Boolean)) return <p className="text-sm text-muted-foreground">Needs your weight and a power ride with at least 20 min of data.</p>;
  const data = COGGAN_SECS.map((k) => ({ axis: COGGAN_LABEL[k], ...Object.fromEntries(prof.map((p, i) => [`s${i}`, p ? Math.round(cogganStep(k, p.wkg[k], sex) * 10) / 10 : null])), ...Object.fromEntries(prof.map((p, i) => [`w${i}`, p?.wkg[k] ?? null])) }));
  return (
    <div className="space-y-3">
      <div className="h-64"><ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          {grads(cmp.length)}
          <PolarGrid stroke={C.grid} gridType="polygon" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: C.text, fontSize: 13, fontWeight: 700 }} tickFormatter={(v: string) => `${AXIS_ICON[v] ?? ''} ${v}`} />
          <PolarRadiusAxis domain={[0, 40]} ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40] as never} tick={false} axisLine={false} />
          {prof.map((p, i) => p && <Radar key={i} dataKey={`s${i}`} stroke={SESSION_COLOURS[i]} fill={`url(#rg${i})`} fillOpacity={1} strokeWidth={2.5} dot={{ r: 3, fill: SESSION_COLOURS[i] }} isAnimationActive animationDuration={900} />)}
          <Tooltip {...tooltipStyle} formatter={(v: number, k: string, it: { payload?: Record<string, number> }) => { const i = Number(String(k).slice(1)); return [`${it.payload?.[`w${i}`]} W/kg · ${category(v)}`, lab(cmp[i])]; }} />
        </RadarChart>
      </ResponsiveContainer></div>
      {/* the 8 rings, coloured from centre (Untrained) to edge (World class) */}
      <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold">
        {CATEGORIES.map((c, ci) => <div key={c} className={cn('rounded-md bg-gradient-to-br px-1 py-1 text-center leading-tight shadow-sm', TONE[CAT_TONE[ci]])}>{ci + 1}. {c}</div>)}
      </div>
      <p className="text-center text-[11px] text-muted-foreground">Rings from the centre out: Coggan's 8 categories, Untrained to World class</p>
      {prof.map((p, i) => { if (!p) return null; const steps = COGGAN_SECS.map((k) => cogganStep(k, p.wkg[k], sex)); const t = riderType(steps); const [tone, icon] = TYPE_LOOK[t.type] ?? ['violet', '🚴']; return (
        <div key={i} className="space-y-2">
          <Tile tone={tone} icon={icon} top={`${lab(cmp[i])} · rider type`} big={t.type} sub={t.why} dot={SESSION_COLOURS[i]} i={i} />
          <div className="grid grid-cols-4 gap-1.5">
            {COGGAN_SECS.map((k, j) => <Tile key={k} tone={CAT_TONE[Math.min(7, Math.floor(steps[j] / 5))]} icon={AXIS_ICON[COGGAN_LABEL[k]]} top={COGGAN_LABEL[k]} i={i * 4 + j + 1}><div className="font-display text-lg font-extrabold italic leading-tight">{p.wkg[k]}</div><div className="text-[10px] leading-tight opacity-90">W/kg · {category(steps[j])}</div></Tile>)}
          </div>
          <p className="text-[10px] text-muted-foreground">FT from {p.ftFrom}.{cmp[i].raw._label ? '' : ' From this one session, not your all-time best.'}</p>
        </div>
      ); })}
      <HowToRead>
        <p>Each spoke is your best power for that length of effort, in watts per kilo, placed on Coggan's table{sex === 'female' ? ' for women' : ' for men'}. Further out = a higher category. The shape tells your rider type: even all round = all-rounder, bigger at the top (5 s, 1 min) = sprinter, bigger at FT = time trialist (climbers look like this too), bulge at 1 to 5 min = pursuiter. Use it to see your strong and weak points, and watch the shape grow over the year.</p>
        <table className="mt-2 w-full text-[11px]"><thead><tr><th className="text-left">Starts at (W/kg)</th>{COGGAN_SECS.map((k) => <th key={k} className="text-right">{COGGAN_LABEL[k]}</th>)}</tr></thead>
          <tbody>{CATEGORIES.map((c, ci) => <tr key={c} className="border-t"><td>{c}</td>{COGGAN_SECS.map((k) => <td key={k} className="text-right font-mono">{categoryFloor(k, ci, sex)}</td>)}</tr>).reverse()}</tbody></table>
      </HowToRead>
    </div>
  );
}

const XERT_AX = [
  { k: 'pp', label: 'PP', long: 'Peak Power', unit: ' W', tone: 'rose', icon: '⚡' },
  { k: 'hie', label: 'HIE', long: 'High Intensity Energy', unit: ' kJ', tone: 'orange', icon: '🔥' },
  { k: 'tp', label: 'TP', long: 'Threshold Power', unit: ' W', tone: 'sky', icon: '🛣️' }
] as const;
export function XertRadar({ cmp }: { cmp: Activity[] }) {
  const x = cmp.map(xert);
  if (!x.some(Boolean)) return <p className="text-sm text-muted-foreground">Needs a power ride where intervals.icu worked out W′ and eFTP.</p>;
  const mx = { pp: Math.max(...x.map((v) => v?.pp ?? 0)), hie: Math.max(...x.map((v) => v?.hie ?? 0)), tp: Math.max(...x.map((v) => v?.tp ?? 0)) };
  const fmt = (k: 'pp' | 'hie' | 'tp', v: { pp: number; hie: number; tp: number }) => (k === 'hie' ? v.hie.toFixed(1) : String(Math.round(v[k])));
  const data = XERT_AX.map((a) => ({ axis: a.label, ...Object.fromEntries(x.map((v, i) => [`s${i}`, v ? Math.round((100 * v[a.k]) / (mx[a.k] || 1)) : null])), ...Object.fromEntries(x.map((v, i) => [`r${i}`, v ? `${fmt(a.k, v)}${a.unit}` : null])) }));
  return (
    <div className="space-y-3">
      <div className="h-56"><ResponsiveContainer>
        <RadarChart data={data} outerRadius="72%">
          {grads(cmp.length)}
          <PolarGrid stroke={C.grid} gridType="polygon" />
          <PolarAngleAxis dataKey="axis" tick={{ fill: C.text, fontSize: 13, fontWeight: 700 }} tickFormatter={(v: string) => `${XERT_AX.find((a) => a.label === v)?.icon ?? ''} ${v}`} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {x.map((v, i) => v && <Radar key={i} dataKey={`s${i}`} stroke={SESSION_COLOURS[i]} fill={`url(#rg${i})`} fillOpacity={1} strokeWidth={2.5} dot={{ r: 3, fill: SESSION_COLOURS[i] }} animationDuration={900} />)}
          <Tooltip {...tooltipStyle} formatter={(_v: number, k: string, it: { payload?: Record<string, string> }) => { const i = Number(String(k).slice(1)); return [it.payload?.[`r${i}`], lab(cmp[i])]; }} />
        </RadarChart>
      </ResponsiveContainer></div>
      <div className="grid grid-cols-3 gap-1.5">
        {XERT_AX.map((a, j) => (
          <Tile key={a.k} tone={a.tone} icon={a.icon} top={a.long} i={j}>
            <div className="font-display text-xl font-extrabold italic leading-tight">{a.label}</div>
            {x.map((v, i) => <div key={i} className="flex items-center gap-1 font-mono text-[11px]"><span className="h-2 w-2 rounded-full ring-1 ring-white" style={{ background: SESSION_COLOURS[i] }} />{v ? fmt(a.k, v) + a.unit : '–'}</div>)}
          </Tile>
        ))}
      </div>
      <HowToRead>
        <p><b>PP, Peak Power</b> (⚡): your best 5 s power, your sprint. <b>HIE, High Intensity Energy</b> (🔥): the energy you can spend above threshold before you run out, like a battery for attacks and climbs (intervals.icu's W′). <b>TP, Threshold Power</b> (🛣️): the power you can hold for a long time without tiring fast (intervals.icu's eFTP). These are Xert's three terms. Each spoke is scaled to the highest value shown, so the shape shows which of the three moved: a bigger TP spoke means more steady power, a bigger HIE spoke more punch.</p>
      </HowToRead>
    </div>
  );
}

export function CompareCard({ cmp, onClear }: { cmp: Activity[]; onClear: () => void }) {
  const p = useProfile().data!;
  const [view, setView] = useState<'bars' | 'coggan' | 'xert' | 'load'>('bars');
  const power = cmp.some((a) => isRide(a) && a.best);
  const views = [{ id: 'bars', label: 'Metrics' }, ...(power ? [{ id: 'coggan', label: 'Power profile' }, { id: 'xert', label: 'PP · HIE · TP' }] : []), { id: 'load', label: 'Load' }] as const;
  const cur = views.some((v) => v.id === view) ? view : 'bars';
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="compare">Compare {cmp.length} sessions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Key cmp={cmp} />
        <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
          {views.map((v) => <button key={v.id} type="button" onClick={() => setView(v.id as typeof view)} className={cn('flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs', cur === v.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{v.label}</button>)}
        </div>
        {cur === 'bars' && <Bars cmp={cmp} />}
        {cur === 'coggan' && <CogganRadar cmp={cmp} weight={p.athlete?.weight ?? null} sex={p.sex} />}
        {cur === 'xert' && <XertRadar cmp={cmp} />}
        {cur === 'load' && <LoadGauges cmp={cmp} />}
        <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
      </CardContent>
    </Card>
  );
}

// ---- Performance tab cards (Ben 2026-11-23): the same two radars for your best over a range vs all-time ----
type Curve = { sport: string; curve: string; secs: number[]; watts: (number | null)[] };
const RANGES = [{ id: 30, label: '1M' }, { id: 90, label: '3M' }, { id: 365, label: '1Y' }];
/** A made-up "activity" holding the best numbers of a set of rides, so the radars can draw it like a session. */
export function bestOf(rides: Activity[], label: string, curve?: Curve): Activity {
  const best: Record<string, number> = {};
  for (const s of [5, 60, 300, 1200]) {
    const i = curve?.secs.indexOf(s) ?? -1, c = i >= 0 ? curve!.watts[i] : null;
    const r = Math.max(0, ...rides.map((a) => a.best?.[s] ?? 0));
    if (c || r) best[s] = Math.max(c ?? 0, r);
  }
  const mx = (...k: string[]) => { const v = rides.map((a) => n(a, ...k)).filter((x): x is number => x != null); return v.length ? Math.max(...v) : null; };
  const raw: Activity['raw'] = { _label: label };
  const ftp = mx('icu_pm_ftp', 'icu_eftp'), wp = mx('icu_pm_w_prime', 'icu_w_prime');
  if (ftp != null) raw.icu_pm_ftp = ftp;
  if (wp != null) raw.icu_pm_w_prime = wp;
  return { id: label, day: '', start_local: null, type: 'Ride', name: label, moving_time: null, distance: null, load: null, raw, best: Object.keys(best).length ? best : null } as unknown as Activity;
}

function useRangeSets(rides: Activity[], curves: Curve[], today: string, days: number) {
  return useMemo(() => {
    const from = new Date(Date.parse(today + 'T12:00:00Z') - days * 864e5).toISOString().slice(0, 10);
    const r = RANGES.find((x) => x.id === days)!;
    return [bestOf(rides.filter((a) => a.day >= from), `Last ${r.label === '1M' ? 'month' : r.label === '3M' ? '3 months' : 'year'}`), bestOf(rides, 'All-time', curves.find((c) => c.sport === 'ride' && c.curve === 'all'))];
  }, [rides, curves, today, days]);
}
function RangeChips({ v, set }: { v: number; set: (n: number) => void }) {
  return <Chips>{RANGES.map((r) => <Chip key={r.id} on={v === r.id} className="text-xs" onClick={() => set(r.id)}>{r.label}</Chip>)}</Chips>;
}
export function PowerProfileCard({ rides, curves, today, weight }: { rides: Activity[]; curves: Curve[]; today: string; weight: number | null }) {
  const p = useProfile().data!;
  const [days, setDays] = useState(90);
  const sets = useRangeSets(rides, curves, today, days);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="power-profile"><span className="font-display text-xl font-extrabold italic tracking-wide">🕸️ Power profile</span></CardTitle><p className="text-xs text-muted-foreground">Coggan's rider types and categories</p></CardHeader>
      <CardContent className="space-y-2"><RangeChips v={days} set={setDays} /><Key cmp={sets} /><CogganRadar cmp={sets} weight={weight} sex={p.sex} /></CardContent>
    </Card>
  );
}
export function SignatureCard({ rides, curves, today }: { rides: Activity[]; curves: Curve[]; today: string }) {
  const [days, setDays] = useState(90);
  const sets = useRangeSets(rides, curves, today, days);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="pp-hie-tp"><span className="font-display text-xl font-extrabold italic tracking-wide">⚡ PP · HIE · TP</span></CardTitle><p className="text-xs text-muted-foreground">Sprint, punch and steady power, in Xert's terms</p></CardHeader>
      <CardContent className="space-y-2"><RangeChips v={days} set={setDays} /><Key cmp={sets} /><XertRadar cmp={sets} /></CardContent>
    </Card>
  );
}

// ---- Load tab, Actual vs planned card (Ben 2026-11-23): this week's two kinds of load ----
const PARTS = [{ k: 'cp', label: 'SS CP', c: '#3b82f6' }, { k: 'wp', label: 'SS W′', c: '#f97316' }, { k: 'pm', label: 'SS Pmax', c: '#e11d48' }] as const;
export function WeekLoadTypes({ acts, days }: { acts: Activity[]; days: { n: string; day: string }[] }) {
  const rows = days.map((d) => {
    const list = acts.filter((a) => a.day === d.day), ss = list.map(strain).filter(Boolean) as NonNullable<ReturnType<typeof strain>>[];
    return { ...d, tss: list.reduce((s, a) => s + (a.load ?? 0), 0), ss: ss.length ? ss.reduce((s, x) => s + x.total, 0) : null,
      cp: ss.reduce((s, x) => s + (x.cp ?? 0), 0), wp: ss.reduce((s, x) => s + (x.wp ?? 0), 0), pm: ss.reduce((s, x) => s + (x.pm ?? 0), 0) };
  });
  const tss = rows.reduce((s, r) => s + r.tss, 0), any = rows.some((r) => r.ss != null);
  const tot = { ss: rows.reduce((s, r) => s + (r.ss ?? 0), 0), cp: rows.reduce((s, r) => s + r.cp, 0), wp: rows.reduce((s, r) => s + r.wp, 0), pm: rows.reduce((s, r) => s + r.pm, 0) };
  const mx = Math.max(tss, tot.ss, 1);
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="text-xs font-semibold">This week by load type</div>
      <div className="flex items-center gap-2 text-xs"><span className="w-12 text-muted-foreground">TSS</span>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${(100 * tss) / mx}%` }} /></div>
        <span className="w-10 text-right font-mono">{Math.round(tss)}</span></div>
      <div className="flex items-center gap-2 text-xs"><span className="w-12 text-muted-foreground">Strain</span>
        <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-muted">
          {PARTS.map((p) => tot[p.k] ? <div key={p.k} style={{ width: `${(100 * tot[p.k]) / mx}%`, background: p.c }} /> : null)}
          {any && !tot.cp && !tot.wp && !tot.pm && <div className="bg-slate-500" style={{ width: `${(100 * tot.ss) / mx}%` }} />}
        </div>
        <span className="w-10 text-right font-mono">{any ? Math.round(tot.ss) : '–'}</span></div>
      {any ? (
        <>
          <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">{PARTS.map((p) => <span key={p.k} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: p.c }} />{p.label} <b className="font-mono">{Math.round(tot[p.k])}</b></span>)}</div>
          <table className="w-full text-[11px]"><thead className="text-muted-foreground"><tr><td />{rows.map((r) => <td key={r.day} className="text-center">{r.n}</td>)}</tr></thead>
            <tbody><tr><td className="text-muted-foreground">TSS</td>{rows.map((r) => <td key={r.day} className="text-center font-mono">{r.tss ? Math.round(r.tss) : '–'}</td>)}</tr>
              <tr><td className="text-muted-foreground">SS</td>{rows.map((r) => <td key={r.day} className="text-center font-mono">{r.ss != null ? Math.round(r.ss) : '–'}</td>)}</tr></tbody></table>
        </>
      ) : <p className="text-[11px] text-muted-foreground">No Strain Score from intervals.icu this week yet. It needs W′ and Pmax in your intervals.icu Sport Settings.</p>}
    </div>
  );
}
