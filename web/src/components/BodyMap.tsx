// Soreness & injury body map, ported from the live app: tap a part, choose Sore or Injured, set the level 1-4.
// Same figure, parts and levels, so the comment written to intervals.icu reads the same in both apps.
import { useRef, useState, type ReactNode } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export type BodyMap = Record<string, { sore?: number; injury?: number }>;
export const BODY_PARTS: [string, string][] = [
  ['chest', 'Chest'], ['shoulders', 'Shoulders'], ['arms', 'Arms'], ['abs', 'Abs'], ['upperBack', 'Upper back/neck'],
  ['lowerBack', 'Lower back'], ['glutes', 'Glutes'], ['quads', 'Quads'], ['hamstrings', 'Hamstrings'], ['calves', 'Calves']
];
export const SORE_LEVELS = ['Low', 'Average', 'High', 'Extreme'];
export const INJURY_LEVELS = ['None', 'Niggle', 'Poor', 'Injured'];
const LEVEL_COLORS = ['#00b8c4', '#e0b000', '#ff6a00', '#ff2d2d'];
const label = (k: string) => BODY_PARTS.find(([x]) => x === k)?.[1] ?? k;
const levelOf = (v: { sore?: number; injury?: number } | undefined) => v?.injury ?? v?.sore ?? 0;

// Highest sore or injury level, saved as Soreness (part of Feel), as in the live app
export const maxLevel = (b: BodyMap) => Math.max(0, ...Object.values(b).map(levelOf));

type Shape = { k: string; el: ReactNode };
const E = (k: string, cx: number, cy: number, rx: number, ry: number, rot = 0): Shape => ({ k, el: <ellipse cx={cx} cy={cy} rx={rx} ry={ry} transform={rot ? `rotate(${rot} ${cx} ${cy})` : undefined} /> });
const Pth = (k: string, d: string): Shape => ({ k, el: <path d={d} /> });
const FRONT: Shape[] = [
  Pth('chest', 'M210 178 V288 Q160 300 112 276 Q98 236 118 196 Q164 172 210 178 Z'), Pth('chest', 'M216 178 V288 Q266 300 314 276 Q328 236 308 196 Q262 172 216 178 Z'),
  { k: 'abs', el: <rect x={160} y={294} width={106} height={110} rx={22} /> },
  E('shoulders', 66, 214, 44, 50), E('shoulders', 360, 214, 44, 50), E('arms', 58, 298, 36, 58, 10), E('arms', 368, 298, 36, 58, -10),
  E('arms', 46, 404, 30, 54, 6), E('arms', 380, 404, 30, 54, -6), E('quads', 168, 552, 56, 104, 6), E('quads', 288, 552, 56, 104, -6),
  E('calves', 150, 770, 38, 82), E('calves', 287, 770, 38, 82)
];
const BACK: Shape[] = [
  Pth('upperBack', 'M190 106 H262 L336 160 L372 222 L352 326 L226 356 L100 326 L80 222 L116 160 Z'),
  Pth('lowerBack', 'M106 332 L226 362 L346 332 L336 414 H116 Z'), E('glutes', 180, 470, 56, 56), E('glutes', 274, 470, 56, 56),
  E('hamstrings', 168, 606, 52, 80, 3), E('hamstrings', 286, 606, 52, 80, -3), E('calves', 168, 762, 46, 78), E('calves', 290, 762, 46, 78),
  E('shoulders', 76, 232, 44, 48), E('shoulders', 378, 232, 40, 48), E('arms', 52, 318, 34, 58, 8), E('arms', 396, 318, 28, 58, -6),
  E('arms', 46, 432, 30, 54, 4), E('arms', 400, 432, 24, 52, -4)
];

export function BodyMapEditor({ value, onChange }: { value: BodyMap; onChange: (v: BodyMap) => void }) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [cur, setCur] = useState<string | null>(null);
  const touch = useRef<number | null>(null);
  const part = cur ? value[cur] : undefined;
  const type: 'sore' | 'injury' = part?.injury ? 'injury' : 'sore';
  const set = (k: string, t: 'sore' | 'injury', l: number) => onChange({ ...value, [k]: { [t]: l } });
  const clear = (k: string) => { const v = { ...value }; delete v[k]; onChange(v); };
  const shapes = side === 'front' ? FRONT : BACK;

  return (
    <div className="space-y-3">
      <div className="relative mx-auto w-full max-w-[220px] select-none"
        onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => { if (touch.current !== null && Math.abs(e.changedTouches[0].clientX - touch.current) > 40) setSide(side === 'front' ? 'back' : 'front'); touch.current = null; }}>
        <div className="absolute left-0 top-0 rounded bg-muted px-1.5 text-[10px] font-semibold tracking-wide">{side.toUpperCase()}</div>
        <svg viewBox="0 0 426 958" className="w-full" role="group" aria-label={`Body, ${side}`}>
          <image href={`${import.meta.env.BASE_URL}body-${side}.webp`} x={0} y={0} width={426} height={958} style={{ pointerEvents: 'none' }} />
          {shapes.map((s, i) => {
            const l = levelOf(value[s.k]);
            return (
              <g key={i} role="button" aria-label={label(s.k)} tabIndex={0} onClick={() => { setCur(s.k); if (!value[s.k]) set(s.k, 'sore', 1); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { setCur(s.k); if (!value[s.k]) set(s.k, 'sore', 1); } }}
                className="cursor-pointer" fill={l ? LEVEL_COLORS[l - 1] : '#ffffff'} fillOpacity={l ? 0.55 : 0.04}
                stroke={cur === s.k ? 'currentColor' : l ? LEVEL_COLORS[l - 1] : 'transparent'} strokeWidth={cur === s.k ? 5 : 3}>
                {s.el}
              </g>
            );
          })}
        </svg>
        <button type="button" className="mt-1 w-full text-center text-xs text-muted-foreground" onClick={() => setSide(side === 'front' ? 'back' : 'front')}>⟵ swipe or tap to turn ⟶</button>
      </div>

      <div className="rounded-lg border p-3">
        {!cur ? <p className="text-sm text-muted-foreground">Tap a body part</p> : (
          <div className="space-y-3">
            <div className="font-semibold">{label(cur)}</div>
            <div className="grid grid-cols-2 gap-1.5">
              {(['sore', 'injury'] as const).map((t) => (
                <button key={t} type="button" onClick={() => set(cur, t, levelOf(part) || 1)}
                  className={cn('rounded-md border px-2 py-1.5 text-sm', type === t && part ? 'border-primary bg-primary text-primary-foreground' : 'bg-card')}>
                  {t === 'sore' ? '💪 Sore' : '🩹 Injured'}
                </button>
              ))}
            </div>
            <Slider min={1} max={4} step={1} value={[levelOf(part) || 1]} onValueChange={([l]) => set(cur, type, l)} aria-label="Level" />
            <div className="flex justify-between text-[11px] text-muted-foreground">{(type === 'sore' ? SORE_LEVELS : INJURY_LEVELS).map((x) => <span key={x}>{x}</span>)}</div>
            <button type="button" className="text-sm text-muted-foreground underline" onClick={() => { clear(cur); setCur(null); }}>✕ Clear this part</button>
          </div>
        )}
      </div>

      {Object.keys(value).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {BODY_PARTS.filter(([k]) => value[k]).map(([k, l]) => {
            const v = value[k], lv = levelOf(v);
            return (
              <button key={k} type="button" onClick={() => setCur(k)} className="rounded-full border px-2.5 py-0.5 text-xs" style={{ borderColor: LEVEL_COLORS[lv - 1] }}>
                {v.injury ? '🩹' : '💪'} {l} · {v.injury ? INJURY_LEVELS[lv - 1] : SORE_LEVELS[lv - 1]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
