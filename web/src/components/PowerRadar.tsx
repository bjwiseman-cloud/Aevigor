// Power profile radar, "Neon glow" (Ben 2026-11-24, chosen with the Race Day theme).
// 4 corners: 5 s, 1 min, 5 min, 20 min (text only). Values sit inside the radar. W / W per kg toggle.
// Scaled to the person: on each corner the inner ring is the start of their current Coggan level for that power and
// the outer (dashed, pulsing) ring is the start of the next level up, so the shape shows how far through their level
// they are. Level strip 1 Untrained to 8 World class: their levels lit, the next one dashed; tapping a level draws
// where it starts on each power and says how much is left to reach it. 20-min levels = Coggan's FTP levels / 0.95.
import { useMemo, useState } from 'react';
import { PolarAngleAxis, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer } from 'recharts';
import { CATEGORIES, categoryFloor, cogganStep } from '@/lib/compare';
import { cn } from '@/lib/utils';

export const RADAR_AXES = [
  { key: '5', secs: 5, label: '5 s', coggan: '5', f: 1 },
  { key: '60', secs: 60, label: '1 min', coggan: '60', f: 1 },
  { key: '300', secs: 300, label: '5 min', coggan: '300', f: 1 },
  { key: '1200', secs: 1200, label: '20 min', coggan: 'ft', f: 0.95 }   // 20-min power x 0.95 = FTP on Coggan's table
] as const;

export type AxisRead = { label: string; watts: number; wkg: number; step: number; cat: number; frac: number };

/** Where each best sits on Coggan's table. Null when a power or the weight is missing. */
export function readProfile(best: Record<string, number> | null | undefined, weight: number | null, sex: string | null | undefined): AxisRead[] | null {
  if (!best || !weight) return null;
  const out: AxisRead[] = [];
  for (const a of RADAR_AXES) {
    const w = best[a.secs];
    if (!w) return null;
    const wkg = w / weight, step = cogganStep(a.coggan, wkg * a.f, sex);
    const cat = Math.min(7, Math.floor(step / 5)), frac = cat === 7 ? Math.min(1, (step - 35) / 5) : (step - 5 * cat) / 5;
    out.push({ label: a.label, watts: Math.round(w), wkg: Math.round(wkg * 100) / 100, step, cat, frac });
  }
  return out;
}
/** Watts at the start of level `cat` (0 = Untrained) on one corner. */
export function levelWatts(i: number, cat: number, weight: number, sex: string | null | undefined) {
  const a = RADAR_AXES[i];
  return (categoryFloor(a.coggan, cat, sex) / a.f) * weight;
}

const ORANGE = '#FF6B00', PINK = '#FF2E63', CYAN = '#7FE7FF', LIME = '#B6FF3B';

export function NeonRadar({ best, weight, sex, subtitle }: { best: Record<string, number> | null; weight: number | null; sex: string | null | undefined; subtitle?: string }) {
  const [wkg, setWkg] = useState(false);
  const [tap, setTap] = useState<number | null>(null);
  const prof = useMemo(() => readProfile(best, weight, sex), [best, weight, sex]);
  if (!prof || !weight) return <p className="text-sm text-slate-300">Needs your weight (from intervals.icu) and a best for 5 s, 1 min, 5 min and 20 min.</p>;

  const top = Math.max(...prof.map((p) => p.cat)), next = top < 7 ? top + 1 : null;
  const lit = new Set(prof.map((p) => p.cat));
  const show = (w: number) => (wkg ? `${(w / weight).toFixed(1)}` : `${Math.round(w)}`);
  const unit = wkg ? 'W/kg' : 'W';
  const lvlR = (i: number) => (tap == null ? null : Math.max(0.12, 1 + (tap - prof[i].cat)));
  const data = prof.map((p, i) => ({ axis: p.label, me: 1 + p.frac, inner: 1, next: 2, lvl: lvlR(i), i }));
  const domain = Math.max(2.9, ...data.map((d) => (d.lvl ?? 0) + 0.9));
  // Closest to levelling up: the corner furthest through its level
  const near = prof.map((p, i) => ({ p, i })).filter((x) => x.p.cat < 7).sort((a, b) => b.p.frac - a.p.frac)[0];
  const need = (i: number, cat: number) => levelWatts(i, cat, weight, sex) - prof[i].watts;
  const delta = (w: number) => (wkg ? `${(w / weight).toFixed(1)} W/kg` : `${Math.round(w)} W`);
  const below = tap == null ? 0 : prof.filter((_, i) => need(i, tap) > 0).length;

  // Value and level text next to each point, pushed outwards from the centre
  const Dot = (props: { cx?: number; cy?: number; payload?: { cx: number; cy: number; payload: { i: number } } }) => {
    const { cx = 0, cy = 0, payload } = props;
    if (!payload) return <g />;
    const i = payload.payload.i, p = prof[i];
    const dx = cx - payload.cx, dy = cy - payload.cy, len = Math.hypot(dx, dy) || 1;
    const side = Math.abs(dx) > Math.abs(dy);
    const tx = cx + (dx / len) * (side ? 14 : 0), ty = cy + (dy / len) * (side ? 0 : 26) + (side ? 26 : dy < 0 ? -6 : 8);
    const anchor = side ? (dx > 0 ? 'start' : 'end') : 'middle';
    const sub = tap != null ? (need(i, tap) > 0 ? `+${delta(need(i, tap))} to ${CATEGORIES[tap]}` : `✓ above ${CATEGORIES[tap]}`) : `${CATEGORIES[p.cat]} · ${Math.round(p.frac * 100)}%`;
    return (
      <g>
        <circle cx={cx} cy={cy} r={7} fill="#0A1024" stroke="#fff" strokeWidth={3} style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.8))' }} />
        <text x={tx} y={ty} textAnchor={anchor} className="font-display" style={{ fontStyle: 'italic', fontWeight: 800 }}>
          <tspan fontSize={20} fill="#fff">{show(p.watts)}</tspan><tspan fontSize={11} fill={CYAN}> {unit}</tspan>
          <tspan x={tx} dy={13} fontSize={10.5} fill={tap != null && need(i, tap) <= 0 ? LIME : tap != null ? '#FFB27A' : '#A9B8E6'} style={{ textTransform: 'uppercase' }}>{sub}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-slate-300">{tap != null ? <>Showing where <b className="text-white">{CATEGORIES[tap]}</b> starts on each power, against your bests.</> : subtitle ?? 'Inner ring = start of your level. Outer ring = your next level.'}</p>
        <div className="flex shrink-0 rounded-full bg-[#1E2B57] p-1" role="group" aria-label="Units">
          {[false, true].map((k) => (
            <button key={String(k)} type="button" aria-pressed={wkg === k} onClick={() => setWkg(k)}
              className={cn('rounded-full px-3 py-1 font-display text-sm font-extrabold italic', wkg === k ? 'bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] text-white shadow-[0_0_12px_rgba(255,107,0,0.7)]' : 'text-slate-400')}>{k ? 'W/kg' : 'W'}</button>
          ))}
        </div>
      </div>
      <div className="relative h-[22rem]">
        {/* radar sweep */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full motion-reduce:hidden">
          <div className="h-full w-full animate-sweep rounded-full" style={{ background: 'conic-gradient(from 0deg, rgba(0,184,255,0.28), transparent 70deg, transparent 360deg)' }} />
        </div>
        <ResponsiveContainer>
          <RadarChart data={data} outerRadius="74%" startAngle={90} endAngle={-270}>
            <defs>
              <linearGradient id="neonFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#00B8FF" stopOpacity={0.55} /><stop offset="55%" stopColor="#A855F7" stopOpacity={0.45} /><stop offset="100%" stopColor={PINK} stopOpacity={0.6} /></linearGradient>
              <linearGradient id="neonStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#3B82F6" /><stop offset="50%" stopColor="#A855F7" /><stop offset="100%" stopColor="#EC4899" /></linearGradient>
              <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <PolarAngleAxis dataKey="axis" tick={false} tickLine={false} axisLine={false} />
            <PolarRadiusAxis domain={[0, domain]} tick={false} axisLine={false} />
            <Radar dataKey="inner" stroke="#3B4A7A" strokeWidth={1.5} fill="#0F1733" fillOpacity={0.6} isAnimationActive={false} />
            <Radar dataKey="next" stroke={ORANGE} strokeWidth={2.5} strokeDasharray="7 6" fill="none" className="motion-safe:animate-pulse" style={{ filter: 'url(#neonGlow)' }} isAnimationActive={false} />
            {tap != null && <Radar dataKey="lvl" stroke={LIME} strokeWidth={3} strokeDasharray="2 5" strokeLinecap="round" fill={LIME} fillOpacity={0.14} style={{ filter: 'url(#neonGlow)' }} dot={{ r: 5, fill: LIME, stroke: LIME }} animationDuration={500} />}
            <Radar dataKey="me" stroke="url(#neonStroke)" strokeWidth={3.5} fill="url(#neonFill)" fillOpacity={1} style={{ filter: 'url(#neonGlow)' }} dot={Dot as never} animationDuration={1000} />
          </RadarChart>
        </ResponsiveContainer>
        {/* corner names at the edges, clear of the values (5 s top, 1 min right, 5 min bottom, 20 min left) */}
        {(['left-1/2 top-0 -translate-x-1/2', 'right-0 top-1/2 -translate-y-[160%]', 'bottom-0 left-1/2 -translate-x-1/2', 'left-0 top-1/2 -translate-y-[160%]'] as const).map((pos, i) => (
          <span key={i} aria-hidden className={cn('pointer-events-none absolute font-display text-[17px] font-extrabold italic text-[#7FE7FF] [text-shadow:0_0_8px_rgba(0,216,255,0.6)]', pos)}>{RADAR_AXES[i].label}</span>
        ))}
        {next != null && tap == null && <span className="pointer-events-none absolute right-2 top-6 rotate-45 font-display text-xs font-extrabold uppercase italic text-[#FF8A3D]">Next level</span>}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {CATEGORIES.map((c, ci) => {
          const on = lit.has(ci), isNext = ci === next, picked = tap === ci;
          return (
            <button key={c} type="button" aria-pressed={picked} onClick={() => setTap(picked ? null : ci)}
              className={cn('-skew-x-[8deg] rounded-md border px-1 py-1.5 font-display text-[12px] font-extrabold uppercase italic leading-tight transition-all',
                picked ? 'border-transparent bg-gradient-to-r from-[#B6FF3B] to-[#00E5A8] text-[#0A1024] shadow-[0_0_16px_rgba(182,255,59,0.7)]'
                  : on ? 'border-[#00D8FF] bg-[#141E40] text-white shadow-[0_0_10px_rgba(0,216,255,0.55)]'
                  : isNext ? 'border-dashed border-[#FF6B00] bg-[#141E40] text-[#FFB27A] shadow-[0_0_10px_rgba(255,107,0,0.45)]'
                  : 'border-[#22305C] bg-[#111a38] text-slate-500')}>
              <span className="inline-block skew-x-[8deg]"><span className="text-base">{ci + 1}</span> {c}</span>
            </button>
          );
        })}
      </div>
      <p className="text-center font-display text-base font-extrabold uppercase italic text-[#B6FF3B]">
        {tap != null
          ? (below ? `${below} of 4 below ${CATEGORIES[tap]}` : `All 4 at or above ${CATEGORIES[tap]} 🎉`)
          : near ? `Closest to levelling up: ${near.p.label} · ${Math.round(near.p.frac * 100)}% there (+${delta(need(near.i, near.p.cat + 1))})` : 'World class on every power 🏆'}
      </p>
      <p className="text-center text-xs text-slate-400">Tap a level to see where it lines up on your profile</p>
    </div>
  );
}
