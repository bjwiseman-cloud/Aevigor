// Celebration (Ben 2026-11-23): the first time you open the app after setting a new best or unlocking a first,
// a big animated screen shows it off, whatever tab the app opens on. Each one is shown once (saved to your
// account, so it is not repeated on another device). Respects reduced motion.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useAchievements, useFirsts, useStreaks, TONE } from '@/components/Achievements';
import { useFun } from '@/hooks/fun';
import { shortDay } from '@/components/charts';
import { usePref } from '@/hooks/data';
import { addDays } from '@rules';
import { cn } from '@/lib/utils';

const SEEN_KEY = 'celebrated';
const RECENT_DAYS = 7;
const CONFETTI = ['#f43f5e', '#f97316', '#facc15', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];

type Item = { key: string; icon: string; label: string; value: string; sub?: string; tone: keyof typeof TONE };

export function Celebrate() {
  const { list, today, loading } = useAchievements();
  const firsts = useFirsts();
  const fun = useFun(), streak = useStreaks();
  const seen = usePref<string[]>(SEEN_KEY, []);
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [items, setItems] = useState<Item[]>([]);

  const fresh = useMemo(() => {
    const from = addDays(today, -(RECENT_DAYS - 1)), done = new Set(seen.value ?? []);
    const a: Item[] = list.filter((x) => x.day && x.day >= from).map((x) => ({ key: `a:${x.id}:${x.day}:${x.value}`, icon: x.icon, label: x.label, value: x.value, sub: x.prev ?? [x.sub, `set ${shortDay(x.day!)}`].filter(Boolean).join(' · '), tone: x.tone }));
    // A new best weekly streak (Ben 2026-11-24: beating your previous best is the achievement)
    const s: Item[] = fun.streaks ? streak.filter((x) => x.now >= 3 && x.now >= x.best).map((x) => ({ key: `s:${x.id}:${x.now}`, icon: '🔥', label: 'New best streak', value: `${x.now} weeks`, sub: 'Your longest run of training weeks ever. Keep it going!', tone: 'orange' as const })) : [];
    const f: Item[] = (firsts.data ?? []).filter((x) => x.day && x.day >= from).map((x) => ({ key: `f:${x.id}`, icon: x.icon, label: 'Unlocked', value: x.label.replace(/^First /, 'First '), tone: 'violet' }));
    return [...a, ...s, ...f].filter((x) => !done.has(x.key));
  }, [list, firsts.data, seen.value, today, streak, fun.streaks]);

  // Once per app open, after the data has loaded
  useEffect(() => {
    if (loading || !seen.loaded || !fun.loaded || !fun.celebrations || firsts.isLoading || open || items.length) return;
    let shown = false;
    try { shown = sessionStorage.getItem('aev_celebrated') === '1'; } catch { /* private mode */ }
    if (shown || !fresh.length) return;
    try { sessionStorage.setItem('aev_celebrated', '1'); } catch { /* ignore */ }
    setItems(fresh.slice(0, 6)); setI(0); setOpen(true);
    navigator.vibrate?.([20, 40, 20]);
  }, [loading, seen.loaded, firsts.isLoading, fresh, open, items.length, fun.loaded, fun.celebrations]);

  const close = async () => {
    setOpen(false);
    try { await seen.save([...(seen.value ?? []), ...items.map((x) => x.key)].slice(-300)); } catch { /* shown again next time */ }
  };
  const it = items[i];
  if (!it) return null;
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <AlertDialogContent className={cn('h-[100dvh] max-h-[100dvh] w-full max-w-none place-items-center overflow-hidden rounded-none border-0 bg-gradient-to-br p-6 sm:max-w-md sm:rounded-2xl sm:h-[85vh]', TONE[it.tone])}>
        {/* Rotating sun rays and floating confetti */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-[38%] h-[160vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-30 motion-reduce:hidden"
          style={{ background: 'repeating-conic-gradient(rgba(255,255,255,0.55) 0 8deg, transparent 8deg 22deg)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden motion-reduce:hidden">
          {Array.from({ length: 36 }, (_, k) => (
            <span key={k} className="absolute top-[-10%] block animate-confetti rounded-sm"
              style={{ left: `${(k * 37) % 100}%`, width: 6 + (k % 3) * 3, height: 10 + (k % 4) * 3, background: CONFETTI[k % CONFETTI.length], animationDelay: `${(k % 12) * 0.25}s`, animationDuration: `${2.6 + (k % 5) * 0.5}s` }} />
          ))}
        </div>
        <div key={it.key} className="relative flex flex-col items-center gap-3 text-center animate-burst motion-reduce:animate-none">
          <div className="text-sm font-bold uppercase tracking-[0.3em] opacity-90">{it.key.startsWith('f:') ? 'New badge' : 'New best!'}</div>
          <div className="text-[7rem] leading-none drop-shadow-xl animate-float motion-reduce:animate-none">{it.icon}</div>
          <AlertDialogTitle className="font-display text-3xl font-extrabold uppercase italic tracking-wide">{it.label}</AlertDialogTitle>
          <div className="font-display text-6xl font-extrabold italic drop-shadow-lg">{it.value}</div>
          <AlertDialogDescription className="text-base font-medium text-current opacity-90">{it.sub ?? 'You did it. Keep going! 🎉'}</AlertDialogDescription>
          {items.length > 1 && <div className="mt-1 flex gap-1.5">{items.map((_, k) => <span key={k} className={cn('h-2 w-2 rounded-full bg-current', k === i ? 'opacity-100' : 'opacity-30')} />)}</div>}
          <div className="mt-4 flex w-full max-w-xs flex-col gap-2">
            {i < items.length - 1
              ? <Button size="lg" className="bg-white/90 font-display text-lg font-extrabold italic text-slate-900 hover:bg-white" onClick={() => setI(i + 1)}>Next 🎉 ({i + 2} of {items.length})</Button>
              : <Button size="lg" className="bg-white/90 font-display text-lg font-extrabold italic text-slate-900 hover:bg-white" onClick={close}>Awesome! 🙌</Button>}
            <Button variant="ghost" className="text-current hover:bg-white/20" onClick={async () => { await close(); nav('/performance'); }}>See all achievements</Button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
