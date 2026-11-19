// Body heat map: male or female figure, front and back, 20 muscles that each fill their real shape, plus joint points.
// Shapes come from react-muscle-highlighter (MIT, see src/assets/BODYMAP-LICENSE.txt), split into our 20 muscles.
import { useEffect, useRef, useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { HelpQ } from '@/components/HelpQ';
import { JOINTS, LEGACY_TO_NEW, MUSCLES, SCALES, colorFor, jointLabel, levelName, muscleLabel, type ScaleKey } from '@/lib/muscles';

type Fig = { viewBox: string; outline: string; shapes: ([string, string] | [string, string, number[]])[]; joints: Record<string, number[][]> };
type Figures = Record<string, Fig>;
let cache: Figures | null = null;
function useFigures() {
  const [f, setF] = useState<Figures | null>(cache);
  useEffect(() => { if (!cache) void import('@/assets/bodymap.json').then((m) => { cache = m.default as unknown as Figures; setF(cache); }); }, []);
  return f;
}
export type Sex = 'male' | 'female';
export const figureSex = (s: string | null | undefined): Sex => (s === 'female' ? 'female' : 'male');

// Old check-ins used 10 broad parts; show them on the matching new muscle.
export function upgradeKeys<T>(v: Record<string, T> | null | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, x] of Object.entries(v ?? {})) out[LEGACY_TO_NEW[k] ?? k] = x;
  return out;
}

export function BodyFigure({ sex, side, fill, selected, onMuscle, joints, className }: {
  sex: Sex; side: 'front' | 'back'; fill: (k: string) => string | undefined; selected?: string | null;
  onMuscle?: (k: string) => void; joints?: { fill: (k: string) => string | undefined; onTap: (k: string) => void; selected?: string | null };
  className?: string;
}) {
  const figs = useFigures();
  const fig = figs?.[`${sex}-${side}`];
  if (!fig) return <div className={cn('aspect-[1/2] w-full animate-pulse rounded-lg bg-muted', className)} />;
  const id = `${sex}${side}`;
  return (
    <svg viewBox={fig.viewBox} className={cn('w-full', className)} role="group" aria-label={`Body, ${side}`}>
      <defs>{fig.shapes.map((s, i) => (s[2] ? <clipPath key={i} id={`${id}c${i}`}><rect x={s[2][0]} y={s[2][1]} width={s[2][2]} height={s[2][3]} /></clipPath> : null))}</defs>
      <path d={fig.outline} fill="hsl(var(--card))" stroke="hsl(var(--border))" strokeWidth={3} />
      {fig.shapes.map(([k, d, clip], i) => {
        const c = k ? fill(k) : undefined;
        const tappable = !!k && !!onMuscle;
        return (
          <path key={i} d={d} clipPath={clip ? `url(#${id}c${i})` : undefined}
            fill={c ?? (k ? 'hsl(var(--muted-foreground) / 0.28)' : 'hsl(var(--muted-foreground) / 0.12)')}
            stroke={selected && k === selected ? 'hsl(var(--foreground))' : 'hsl(var(--card))'} strokeWidth={selected && k === selected ? 4 : 1.5}
            className={tappable ? 'cursor-pointer' : undefined} onClick={tappable ? () => onMuscle!(k) : undefined}>
            {k && <title>{muscleLabel(k)}</title>}
          </path>
        );
      })}
      {joints && Object.entries(fig.joints).map(([k, pts]) => pts.map(([x, y], i) => {
        const c = joints.fill(k);
        return (
          <circle key={k + i} cx={x} cy={y} r={20} className="cursor-pointer" fill={c ?? 'hsl(var(--card))'} fillOpacity={c ? 0.95 : 0.9}
            stroke={joints.selected === k ? 'hsl(var(--foreground))' : c ?? 'hsl(var(--muted-foreground))'} strokeWidth={joints.selected === k ? 6 : 4}
            onClick={() => joints.onTap(k)}><title>{jointLabel(k)}</title></circle>
        );
      }))}
    </svg>
  );
}

export type MapMode = { id: string; label: string; scale: ScaleKey; target: 'muscle' | 'joint' };
export type MapValue = Record<string, Record<string, number>>;

// Tap a muscle (or joint) for the chosen mode, then set its level. Each mode keeps its own values.
export function BodyMapEditor({ sex, modes, value, onChange, help }: {
  sex: Sex; modes: MapMode[]; value: MapValue; onChange: (v: MapValue) => void; help?: string;
}) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [modeId, setModeId] = useState(modes[0].id);
  const [cur, setCur] = useState<string | null>(null);
  const touch = useRef<number | null>(null);
  const mode = modes.find((m) => m.id === modeId) ?? modes[0];
  const sc = SCALES[mode.scale];
  const vals = value[mode.id] ?? {};
  const setLevel = (k: string, l: number) => onChange({ ...value, [mode.id]: { ...vals, [k]: l } });
  const clear = (k: string) => { const v = { ...vals }; delete v[k]; onChange({ ...value, [mode.id]: v }); };
  const tap = (k: string) => { setCur(k); if (vals[k] == null) setLevel(k, sc.from); };
  const turn = () => setSide(side === 'front' ? 'back' : 'front');
  const name = (k: string) => (mode.target === 'joint' ? jointLabel(k) : muscleLabel(k));
  const curLevel = cur ? vals[cur] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {modes.length > 1 && (
          <div className="flex flex-1 gap-1 rounded-lg border bg-card p-1">
            {modes.map((m) => (
              <button key={m.id} type="button" onClick={() => { setModeId(m.id); setCur(null); }}
                className={cn('flex-1 rounded-md px-2 py-1.5 text-sm', m.id === mode.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}>{m.label}</button>
            ))}
          </div>
        )}
        {help && <HelpQ text={help} />}
      </div>
      <div className="relative mx-auto w-full max-w-[240px] select-none"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (touch.current !== null && Math.abs(e.changedTouches[0].clientX - touch.current) > 40) turn(); touch.current = null; }}>
        <BodyFigure sex={sex} side={side} selected={mode.target === 'muscle' ? cur : null}
          fill={(k) => (mode.target === 'muscle' && vals[k] != null ? colorFor(mode.scale, vals[k]) : undefined)}
          onMuscle={mode.target === 'muscle' ? tap : undefined}
          joints={mode.target === 'joint' ? { fill: (k) => (vals[k] != null ? colorFor(mode.scale, vals[k]) : undefined), onTap: tap, selected: cur } : undefined} />
        <div className="mt-1 flex justify-center gap-1">
          {(['front', 'back'] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSide(s)} className={cn('rounded-full border px-3 py-0.5 text-xs', side === s ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{s === 'front' ? 'Front' : 'Back'}</button>
          ))}
        </div>
      </div>

      {cur && curLevel != null && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex items-center justify-between"><b>{name(cur)}</b><span className="text-sm">{levelName(mode.scale, curLevel)}</span></div>
          {sc.levels.length > 1 && <>
            <Slider min={sc.from} max={sc.from + sc.levels.length - 1} step={1} value={[curLevel]} onValueChange={([l]) => setLevel(cur, l)} aria-label="Level" />
            <div className="flex justify-between text-[11px] text-muted-foreground">{sc.levels.map((x) => <span key={x}>{x}</span>)}</div>
          </>}
          <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { clear(cur); setCur(null); }}>Clear</button>
        </div>
      )}

      {modes.some((m) => Object.keys(value[m.id] ?? {}).length) && (
        <div className="space-y-1.5">
          {modes.map((m) => {
            const v = value[m.id] ?? {};
            const keys = (m.target === 'joint' ? JOINTS.map((j) => j.k as string) : MUSCLES.map((x) => x.k as string)).filter((k) => v[k] != null);
            if (!keys.length) return null;
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{m.label}:</span>
                {keys.map((k) => (
                  <button key={k} type="button" onClick={() => { setModeId(m.id); setCur(k); }} className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(m.scale, v[k]) }} />
                    {m.target === 'joint' ? jointLabel(k) : muscleLabel(k)} · {levelName(m.scale, v[k])}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Colour key under a heat map
export function ScaleLegend({ scale }: { scale: ScaleKey }) {
  const sc = SCALES[scale];
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {sc.levels.map((l, i) => <span key={l} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: sc.colors[i] }} />{l}</span>)}
    </div>
  );
}
