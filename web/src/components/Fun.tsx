// Shared playful look (Ben 2026-11-23): the Achievements gradient tiles, reused on check-ins, logs, the power
// curve, body maps and Load so the whole app feels the same.
import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { HelpQ } from '@/components/HelpQ';
import { TONE } from '@/components/Achievements';
import { cn } from '@/lib/utils';

export type Tone = keyof typeof TONE;
export { TONE };
export const TONES = Object.keys(TONE) as Tone[];

// Best → worst colour runs for answer scales (green is best, rose is worst).
export const SCALE: Record<number, Tone[]> = {
  3: ['emerald', 'amber', 'rose'],
  4: ['emerald', 'lime', 'amber', 'rose'],
  5: ['emerald', 'lime', 'amber', 'orange', 'rose']
};

const shine = 'pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,rgba(255,255,255,0.35)_50%,transparent_70%)] bg-[length:200%_100%] animate-shine motion-reduce:hidden';

/** Gradient tile, the same look as the Achievements tiles. */
export function FunTile({ tone, icon, top, big, sub, i = 0, dot, className, onClick, children }: { tone: Tone; icon?: ReactNode; top: ReactNode; big?: ReactNode; sub?: ReactNode; i?: number; dot?: string; className?: string; onClick?: () => void; children?: ReactNode }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} style={{ animationDelay: `${i * 70}ms` }}
      className={cn('relative block w-full overflow-hidden rounded-xl bg-gradient-to-br p-3 text-left shadow-md animate-pop motion-reduce:animate-none', TONE[tone], className)}>
      <span aria-hidden className={shine} />
      {dot && <span className="absolute right-2 top-2 h-3 w-3 rounded-full ring-2 ring-white" style={{ background: dot }} />}
      {icon && <div className="relative text-2xl leading-none animate-float motion-reduce:animate-none" style={{ animationDelay: `${i * 230}ms` }}>{icon}</div>}
      <div className={cn('relative text-[11px] font-semibold uppercase tracking-wide opacity-90', icon && 'mt-1.5')}>{top}</div>
      {big != null && <div className="relative font-display text-2xl font-extrabold italic leading-tight">{big}</div>}
      {sub && <div className="relative text-[11px] opacity-90">{sub}</div>}
      {children && <div className="relative">{children}</div>}
    </Tag>
  );
}

/** Round gradient badge for a card or question title. */
export function FunIcon({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return <span aria-hidden className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-base shadow-sm', TONE[tone], className)}>{children}</span>;
}

/** Question card with a coloured icon badge, used by the morning and post-activity check-ins. */
export function FunQ({ icon, tone = 'sky', title, help, extra, children }: { icon?: ReactNode; tone?: Tone; title: ReactNode; help?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card className="overflow-hidden"><CardContent className="relative space-y-2 py-3">
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1 bg-gradient-to-b', TONE[tone])} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">{icon && <FunIcon tone={tone}>{icon}</FunIcon>}<b className="font-display text-lg italic leading-tight">{title}</b></div>
        {help && <HelpQ text={help} />}
      </div>
      {extra}{children}
    </CardContent></Card>
  );
}

/** Answer buttons that light up in their own colour (green best → rose worst), with an optional emoji each. */
export function FunOpts({ opts, value, onPick, cols, tones, icons }: { opts: string[]; value: number | null | undefined; onPick: (i: number) => void; cols: number; tones?: Tone[]; icons?: string[] }) {
  const t = tones ?? SCALE[opts.length] ?? opts.map((_, i) => TONES[i % TONES.length]);
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {opts.map((o, i) => {
        const on = value === i;
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onPick(i)}
            className={cn('relative overflow-hidden rounded-lg border px-1 py-2 text-xs leading-tight transition-transform active:scale-95',
              on ? cn('border-transparent bg-gradient-to-br font-bold shadow-md animate-pop motion-reduce:animate-none', TONE[t[i]]) : 'bg-card hover:bg-muted')}>
            {on && <span aria-hidden className={shine} />}
            {icons?.[i] && <span className={cn('relative block text-lg leading-none', on ? 'animate-float motion-reduce:animate-none' : 'opacity-70 grayscale-[40%]')}>{icons[i]}</span>}
            <span className={cn('relative block', icons?.[i] && 'mt-1')}>{o}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Tone for a 1-10 effort number: calm green at the easy end, hot rose at max. */
export function rpeTone(rpe: number): Tone {
  return rpe <= 2 ? 'emerald' : rpe <= 4 ? 'lime' : rpe <= 6 ? 'amber' : rpe <= 8 ? 'orange' : 'rose';
}

/** Big gradient number badge, e.g. the session RPE. */
export function FunNumber({ tone, value, label }: { tone: Tone; value: ReactNode; label?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span key={String(value)} className={cn('inline-flex h-12 min-w-12 items-center justify-center rounded-xl bg-gradient-to-br px-2 font-display text-3xl font-extrabold italic shadow-md animate-pop motion-reduce:animate-none', TONE[tone])}>{value}</span>
      {label && <span className="text-sm font-semibold">{label}</span>}
    </div>
  );
}
