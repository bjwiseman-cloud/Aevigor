// Test cards (Ben 2026-11-23): latest result next to your best, with a drop-down for all time, last 3 months or
// this month, in the playful tile look. Tap a tile to open that ride or run.
import { useState } from 'react';
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FunIcon, FunTile, type Tone } from '@/components/Fun';
import { axis, shortDay, tooltipStyle } from '@/components/charts';
import { SPANS, bestOf, inSpan, type Better, type Pt, type Span } from '@/lib/testcards';

const GRAD: Record<Tone, [string, string]> = {
  violet: ['#8b5cf6', '#6366f1'], rose: ['#f43f5e', '#ec4899'], amber: ['#f59e0b', '#f97316'], sky: ['#0ea5e9', '#06b6d4'], emerald: ['#10b981', '#14b8a6'],
  orange: ['#f97316', '#ef4444'], fuchsia: ['#d946ef', '#a855f7'], teal: ['#14b8a6', '#06b6d4'], lime: ['#84cc16', '#10b981']
};

export type TestCardProps = {
  id: string; title: string; icon: string; tone: Tone; help: string; pts: Pt[]; better: Better; today: string;
  fmt: (v: number) => string; what: string; target?: { value: number; label: string }; empty: string; onOpen: (id: string) => void;
};

export function TestCard({ id, title, icon, tone, help, pts, better, today, fmt, what, target, empty, onOpen }: TestCardProps) {
  const [span, setSpan] = useState<Span>('all');
  const latest = pts.at(-1) ?? null;
  const shown = inSpan(pts, span, today), best = bestOf(shown, better);
  const isBest = !!(latest && best && latest.id === best.id && latest.day === best.day);
  const gap = latest && best && !isBest ? latest.value - best.value : null;
  const worse = gap != null && (better === 'high' ? gap < 0 : gap > 0);
  const [c1, c2] = GRAD[tone];
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help={help}><span className="flex items-center gap-2"><FunIcon tone={tone}>{icon}</FunIcon>{title}</span></CardTitle>
        <p className="text-xs text-muted-foreground">{what}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!latest ? <p className="text-sm text-muted-foreground">{empty}</p> : <>
          <select className="h-8 w-full rounded-full border bg-card px-3 text-sm" aria-label="Compare with" value={span} onChange={(e) => setSpan(e.target.value as Span)}>
            {SPANS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <FunTile tone={isBest ? 'amber' : tone} icon={isBest ? '🏆' : '🆕'} top={`Latest · ${shortDay(latest.day)}`} big={fmt(latest.value)} sub={isBest ? 'New best!' : latest.note} onClick={latest.id ? () => onOpen(latest.id!) : undefined} className="p-2" />
            <FunTile i={1} tone="emerald" icon="🏅" top={best ? `Best · ${shortDay(best.day)}` : 'Best'} big={best ? fmt(best.value) : '–'} sub={best ? SPANS.find((s) => s.id === span)!.label.replace('Best of ', '') : 'none in this range'} onClick={best?.id ? () => onOpen(best.id!) : undefined} className="p-2" />
            <FunTile i={2} tone={gap == null ? 'sky' : worse ? 'orange' : 'lime'} icon={gap == null ? (isBest ? '🎉' : '➖') : worse ? '🎯' : '📈'} top={gap == null ? 'Gap' : worse ? 'To beat best' : 'Ahead of best'}
              big={gap == null ? (isBest ? '0' : '–') : `${gap > 0 ? '+' : ''}${fmt(Math.round(gap * 100) / 100)}`} sub={target ? target.label : `${shown.length} in range`} className="p-2" />
          </div>
          {shown.length > 1 && (
            <div className="h-24">
              <ResponsiveContainer>
                <AreaChart data={shown} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id={`tc-s-${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} /></linearGradient>
                    <linearGradient id={`tc-f-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c1} stopOpacity={0.35} /><stop offset="100%" stopColor={c2} stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
                  <YAxis domain={['auto', 'auto']} {...axis} />
                  <Tooltip {...tooltipStyle} labelFormatter={(l) => shortDay(String(l))} formatter={(v) => [fmt(Number(v)), title]} />
                  {target && <ReferenceLine y={target.value} stroke="#10b981" strokeDasharray="4 3" />}
                  <Area type="monotone" dataKey="value" stroke={`url(#tc-s-${id})`} strokeWidth={3} fill={`url(#tc-f-${id})`} dot={{ r: 3, fill: c1 }} animationDuration={700} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>}
      </CardContent>
    </Card>
  );
}
