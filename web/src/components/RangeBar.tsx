// Colourful range bar for a Today signal: below / your normal / above in the theme's status colours,
// a marker for today's value and the value written above it.
import { cn } from '@/lib/utils';

export type Range = { min: number; max: number; lo: number; hi: number; value: number; label: string };

// Scale that fits the normal range with some room either side, and always includes today's value
export function scale(lo: number, hi: number, value: number, pad = 0.6, floor?: number, ceil?: number): Pick<Range, 'min' | 'max'> {
  const w = Math.max(hi - lo, Math.abs(hi) * 0.1, 1);
  let min = Math.min(lo - w * pad, value), max = Math.max(hi + w * pad, value);
  if (floor !== undefined) min = Math.max(min, floor);
  if (ceil !== undefined) max = Math.min(max, ceil);
  const m = (max - min) * 0.04;
  return { min: Math.min(min, value - m), max: Math.max(max, value + m) };
}

export function RangeBar({ r, className }: { r: Range; className?: string }) {
  const pct = (v: number) => Math.min(100, Math.max(0, ((v - r.min) / (r.max - r.min)) * 100));
  const a = pct(r.lo), b = pct(r.hi), x = pct(r.value);
  return (
    <div className={cn('relative mt-7', className)} aria-label={`${r.label}, normal ${r.lo} to ${r.hi}`}>
      <div className="flex h-3 overflow-hidden rounded-full">
        <div style={{ width: `${a}%` }} className="bg-gradient-to-r from-status-ok/60 to-status-ok" />
        <div style={{ width: `${b - a}%` }} className="bg-gradient-to-r from-status-go/70 to-status-go" />
        <div className="flex-1 bg-gradient-to-r from-status-caution to-status-warn" />
      </div>
      <div style={{ left: `${x}%` }} className="absolute -top-[5px] h-[22px] w-1 -translate-x-1/2 rounded-sm bg-foreground ring-2 ring-card" />
      <div style={{ left: `clamp(2.25rem, ${x}%, calc(100% - 2.25rem))` }}
        className="absolute -top-7 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-2 py-px text-xs font-bold text-background">{r.label}</div>
    </div>
  );
}

export function RangeKey() {
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-status-ok" />below</span>
      <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-status-go" />your normal</span>
      <span className="flex items-center gap-1"><span className="h-2 w-3 rounded-sm bg-status-caution" />above</span>
      <span>· marker = today</span>
    </p>
  );
}
