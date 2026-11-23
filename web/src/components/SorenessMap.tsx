// Soreness and injury body map for the Load tab (Ben 2026-11-23): the same figure as the morning check-in,
// showing the latest check-in's sore muscles and injuries. Swipe left or right to turn it. Read only.
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { addDays } from '@rules';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BodyFigure, MODE_ICON, MODE_TONE, ScaleLegend, figureSex, upgradeKeys } from '@/components/BodyMap';
import { FunTile, TONE } from '@/components/Fun';
import { shortDay } from '@/components/charts';
import { useProfile } from '@/hooks/data';
import { colorFor, levelName, muscleLabel } from '@/lib/muscles';
import { todayIn } from '@/lib/time';
import { cn } from '@/lib/utils';

type Body = Record<string, { sore?: number; injury?: number }>;

export function SorenessCard() {
  const p = useProfile().data!;
  const today = todayIn(p.time_zone);
  const q = useQuery({
    queryKey: ['checkin_body', p.user_id, today],
    queryFn: async () => {
      const { data, error } = await supabase.from('checkins').select('day, body').gte('day', addDays(today, -6)).order('day', { ascending: false }).limit(7);
      if (error) throw error;
      return (data ?? []) as { day: string; body: Body | null }[];
    }
  });
  const latest = (q.data ?? [])[0];
  const body = useMemo(() => upgradeKeys(latest?.body), [latest]);
  const [mode, setMode] = useState<'sore' | 'injury'>('sore');
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [cur, setCur] = useState<string | null>(null);
  const swipe = useRef<number | null>(null);
  const val = (k: string) => { const v = body[k]?.[mode]; return v && (mode === 'sore' || v >= 2) ? v : null; };
  const listed = Object.keys(body).filter((k) => val(k) != null);
  const turn = () => setSide(side === 'front' ? 'back' : 'front');
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle help="feel">Soreness and injury</CardTitle>
        <p className="text-xs text-muted-foreground">{latest ? `From your check-in on ${latest.day === today ? 'today' : shortDay(latest.day)}` : 'No check-in in the last 7 days'}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {(['sore', 'injury'] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setCur(null); }}
              className={cn('flex-1 rounded-md px-2 py-1.5 text-sm', mode === m ? cn('bg-gradient-to-br font-semibold shadow-sm', TONE[MODE_TONE[m]]) : 'text-muted-foreground')}>{MODE_ICON[m]} {m === 'sore' ? 'Sore' : 'Injured'}</button>
          ))}
        </div>
        <div className="mx-auto w-full max-w-[220px] touch-pan-y select-none"
          onPointerDown={(e) => { swipe.current = e.clientX; }}
          onPointerUp={(e) => { if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 40) { turn(); navigator.vibrate?.(8); } swipe.current = null; }}
          onPointerCancel={() => { swipe.current = null; }}>
          <div key={side} className="animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
            <BodyFigure sex={figureSex(p.sex)} side={side} selected={cur} fill={(k) => { const v = val(k); return v != null ? colorFor(mode, v) : undefined; }} onMuscle={(k) => setCur(cur === k ? null : k)} />
          </div>
          <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <span className={cn('h-1.5 w-1.5 rounded-full', side === 'front' ? 'bg-primary' : 'bg-muted-foreground/40')} />
            <button type="button" className="rounded px-1" aria-label="Turn the body" onClick={turn}>{side === 'front' ? 'Front' : 'Back'} · swipe to turn</button>
            <span className={cn('h-1.5 w-1.5 rounded-full', side === 'back' ? 'bg-primary' : 'bg-muted-foreground/40')} />
          </div>
        </div>
        <ScaleLegend scale={mode} />
        {latest && (() => {
          const sore = Object.keys(body).filter((k) => body[k]?.sore), inj = Object.keys(body).filter((k) => (body[k]?.injury ?? 0) >= 2);
          const top = Math.max(0, ...sore.map((k) => body[k].sore!));
          return (
            <div className="grid grid-cols-2 gap-2">
              <FunTile tone={sore.length ? 'orange' : 'emerald'} icon={sore.length ? '🔥' : '✨'} top="Sore muscles" big={sore.length} sub={sore.length ? `worst: ${levelName('sore', top)}` : 'all fresh'} />
              <FunTile i={1} tone={inj.length ? 'rose' : 'teal'} icon={inj.length ? '🩹' : '🛡️'} top="Injuries" big={inj.length} sub={inj.length ? inj.map(muscleLabel).slice(0, 2).join(', ') : 'none logged'} />
            </div>
          );
        })()}
        {listed.length ? (
          <div className="flex flex-wrap gap-1.5">
            {listed.map((k) => (
              <button key={k} type="button" onClick={() => setCur(k)} className={cn('flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium animate-pop motion-reduce:animate-none', cur === k && 'ring-2 ring-foreground/40')} style={{ borderColor: colorFor(mode, val(k)!), background: `${colorFor(mode, val(k)!)}26` }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(mode, val(k)!), boxShadow: `0 0 6px ${colorFor(mode, val(k)!)}` }} />{muscleLabel(k)} · {levelName(mode, val(k)!)}
              </button>
            ))}
          </div>
        ) : <p className="text-center text-sm text-muted-foreground">{latest ? (mode === 'sore' ? 'No sore muscles logged.' : 'No injuries logged.') : <>Log it in the <Link className="text-primary underline" to="/checkin">morning check-in</Link>.</>}</p>}
        <p className="text-[11px] text-muted-foreground">A log of how it felt, not medical advice.</p>
      </CardContent>
    </Card>
  );
}
