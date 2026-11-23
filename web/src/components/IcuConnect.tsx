// intervals.icu connect pop-up (Ben 2026-11-23): a big colourful button that starts the intervals.icu sign-in straight
// away, so nobody has to go to Settings first. Shown only when someone taps something that needs intervals.icu, never
// at login (Ben's rule). intervals.icu publishes no logo or brand rules (API terms, 23 Oct 2025), so the button names
// intervals.icu in text with a neutral sync icon of our own; swap in the real logo only once intervals.icu says yes.
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useProfile } from '@/hooks/data';
import { startIcuConnect } from '@/lib/icu-oauth';
import { browserTimeZone } from '@/lib/time';
import { cn } from '@/lib/utils';

/** Neutral "link up" icon (two arrows in a circle), not the intervals.icu logo. */
function SyncIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M20 12a8 8 0 0 1-13.7 5.6" /><path d="M4 12a8 8 0 0 1 13.7-5.6" /><path d="M17 3v4h-4" /><path d="M7 21v-4h4" />
    </svg>
  );
}

/** The colourful "Connect with intervals.icu" button: tapping it opens the intervals.icu sign-in page right away. */
export function IcuConnectButton({ className, label = 'Connect with intervals.icu' }: { className?: string; label?: string }) {
  const p = useProfile().data;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await startIcuConnect(p?.time_zone || browserTimeZone()); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="space-y-1">
      <button type="button" onClick={go} disabled={busy}
        className={cn('group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 px-4 py-4 font-display text-lg font-extrabold italic text-white shadow-lg shadow-orange-500/30 transition active:scale-[0.98] disabled:opacity-70', className)}>
        <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shine motion-reduce:hidden" />
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 text-orange-600 shadow"><SyncIcon className={cn('h-5 w-5', busy && 'animate-spin')} /></span>
        <span>{busy ? 'Opening intervals.icu…' : label}</span>
      </button>
      {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
    </div>
  );
}

/** The pop-up itself. */
export function IcuConnectSheet({ open, onOpenChange, why }: { open: boolean; onOpenChange: (o: boolean) => void; why?: string }) {
  const nav = useNavigate();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[90vh] max-w-lg overflow-y-auto md:bottom-[5vh] md:rounded-xl">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl font-extrabold italic">🔗 Connect intervals.icu</SheetTitle>
          <SheetDescription>{why ?? 'This needs your watch data from intervals.icu.'} Connecting brings in your HRV, resting heart rate, sleep and workouts.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <IcuConnectButton />
          <p className="text-sm text-muted-foreground">You'll sign in on intervals.icu and tap <b>Allow</b>. Aevigor never sees your password.</p>
          <div className="rounded-xl border bg-muted/40 p-3 text-sm">
            ⚙️ To add or remove intervals.icu later, go to <button type="button" className="font-semibold text-primary underline" onClick={() => { onOpenChange(false); nav('/settings'); }}>Settings › intervals.icu</button>. Disconnecting there also removes Aevigor's access on intervals.icu.
          </div>
          <button type="button" className="w-full text-center text-xs text-muted-foreground underline" onClick={() => { onOpenChange(false); nav('/connect'); }}>Use an API key instead</button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** For anything that needs intervals.icu: `need(fn)` runs fn when connected, else opens the pop-up. Render `sheet` once. */
export function useNeedIcu(why?: string): { connected: boolean; need: (fn?: () => void) => void; open: () => void; sheet: ReactNode } {
  const p = useProfile().data;
  const [open, setOpen] = useState(false);
  const connected = !!p?.intervals_connected_at;
  return {
    connected,
    need: (fn) => { if (connected) fn?.(); else setOpen(true); },
    open: () => setOpen(true),
    sheet: <IcuConnectSheet open={open} onOpenChange={setOpen} why={why} />
  };
}
