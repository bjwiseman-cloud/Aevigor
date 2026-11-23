import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Celebrate } from '@/components/Celebrate';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Award, CalendarDays, ClipboardCheck, Home, LineChart, Menu as MenuIcon, Settings as Cog, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BellButton, ReminderBanner } from '@/components/reminders';
import { ThemeButton } from '@/components/ThemeButton';
import { useTheme } from '@/lib/theme';
import { usePref, useProfile } from '@/hooks/data';
import { callApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src="/app/icon.svg" alt="" className="h-6 w-6 rounded-sm" />
      <span className="font-serif text-lg font-bold tracking-[0.22em]">AEVIGOR</span>
      <span className="rounded-sm border border-primary px-1 text-[10px] tracking-widest text-primary">BETA</span>
    </div>
  );
}

// Bottom tabs (Ben, 2026-11-23): Check-in · Training · Today (centre) · Performance · Calendar. Analysis (Trends,
// physiology and load charts, made for a computer screen) joins as an extra tab once switched on in
// Settings › Advanced; it is off by default for everyone.
const TABS = [
  { to: '/checkin', label: 'Check-in', icon: ClipboardCheck, match: ['/checkin'] },
  { to: '/training/load', label: 'Training', icon: TrendingUp, match: ['/training'] },
  { to: '/today', label: 'Today', icon: Home, match: ['/today'], centre: true },
  { to: '/performance', label: 'Performance', icon: Award, match: ['/performance'] },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, match: ['/calendar'] }
];
const ANALYSIS_TAB = { to: '/analysis', label: 'Analysis', icon: LineChart, match: ['/analysis'] };
export const ANALYSIS_KEY = 'analysis_on';
export function useAnalysisOn() { return usePref<boolean>(ANALYSIS_KEY, false); }

// Sub-tabs at the top of Training and Trends
export function SubTabs({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  // Up to 4 tabs share the width; more scroll sideways so every label stays whole.
  const many = tabs.length > 4;
  return (
    <div className={cn('mb-4 overflow-hidden rounded-md border', many ? 'flex overflow-x-auto' : 'grid')} style={many ? undefined : { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end}
          className={({ isActive }) => cn('py-2 text-center text-sm', many && 'flex-1 shrink-0 whitespace-nowrap px-3', isActive ? 'bg-primary font-semibold text-primary-foreground' : 'bg-card text-muted-foreground')}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
export const TRAINING_TABS = [{ to: '/training/load', label: 'Load' }, { to: '/training/sessions', label: 'Activities' }];
export const PERF_TABS = [
  { to: '/performance', label: 'Achievements', end: true }, { to: '/performance/profile', label: 'Profile' }, { to: '/performance/curves', label: 'Curves' },
  { to: '/performance/zones', label: 'Zones' }, { to: '/performance/tests', label: 'Tests' }
];
export const ANALYSIS_TABS = [{ to: '/analysis', label: 'Trends', end: true }, { to: '/analysis/physiology', label: 'Physiology' }, { to: '/analysis/load', label: 'Load charts' }];

function lastSyncText(iso: string | null | undefined) {
  return iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never';
}

// Pull down from the top of any page to sync (replaces the Sync button)
function usePullToRefresh(onRefresh: () => void, busy: boolean) {
  const [pull, setPull] = useState(0);
  const start = useRef<number | null>(null);
  useEffect(() => {
    const down = (e: TouchEvent) => { start.current = window.scrollY <= 0 ? e.touches[0].clientY : null; };
    const move = (e: TouchEvent) => { if (start.current != null) setPull(Math.max(0, Math.min(90, e.touches[0].clientY - start.current))); };
    const up = () => { if (start.current != null && pull > 70 && !busy) onRefresh(); start.current = null; setPull(0); };
    window.addEventListener('touchstart', down, { passive: true });
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    return () => { window.removeEventListener('touchstart', down); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up); };
  }, [onRefresh, busy, pull]);
  return pull;
}

export function Layout() {
  const qc = useQueryClient();
  const profile = useProfile().data;
  const loc = useLocation();
  const analysis = useAnalysisOn().value;
  const tabs: typeof TABS = analysis ? [...TABS, ANALYSIS_TAB] : TABS;
  const sync = useMutation({
    mutationFn: (_auto: boolean = false) => (profile?.intervals_connected_at ? callApi('sync') : Promise.resolve(null)),
    onSuccess: (_r, auto) => { qc.invalidateQueries(); if (!auto) toast.success('Synced'); },
    onError: (e: Error, auto) => { if (!auto) toast.error(e.message); }
  });
  // Sync on its own when the app opens or comes back to the screen, if the last sync is over 5 minutes old,
  // so a session that just reached intervals.icu shows up without pulling down (Ben 2026-11-19).
  const lastSync = profile?.last_sync, linked = !!profile?.intervals_connected_at;
  useEffect(() => {
    const maybe = () => {
      if (!linked || document.visibilityState !== 'visible' || sync.isPending) return;
      if (!lastSync || Date.now() - Date.parse(lastSync) > 5 * 60_000) sync.mutate(true);
    };
    maybe();
    document.addEventListener('visibilitychange', maybe);
    return () => document.removeEventListener('visibilitychange', maybe);
  }, [linked, lastSync]); // eslint-disable-line react-hooks/exhaustive-deps
  const pull = usePullToRefresh(() => sync.mutate(false), sync.isPending);
  const { theme } = useTheme();   // charts read their colours on render, so the page re-renders on a theme change

  return (
    <div className="min-h-screen pb-[calc(84px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-3 pb-1 pt-2 backdrop-blur">
        <div className="flex items-center justify-between">
          <Button asChild variant="ghost" size="icon" aria-label="Menu"><Link to="/menu"><MenuIcon /></Link></Button>
          <Brand />
          <div className="flex items-center">
            <ThemeButton />
            <BellButton />
            <Button asChild variant="ghost" size="icon" aria-label="Settings"><Link to="/settings"><Cog /></Link></Button>
          </div>
        </div>
        <button type="button" onClick={() => sync.mutate(false)} disabled={sync.isPending}
          className="block w-full text-center text-[11px] text-muted-foreground">
          {sync.isPending ? 'Syncing with intervals.icu…' : linked ? `Last sync ${lastSyncText(profile?.last_sync)} · tap or pull down to sync` : 'Not connected to intervals.icu'}
        </button>
      </header>
      {pull > 0 && (
        <div className="flex justify-center text-xs text-muted-foreground" style={{ height: pull / 2 }}>
          {pull > 70 ? 'Release to sync' : 'Pull to sync'}
        </div>
      )}
      <main className={cn('mx-auto p-4', loc.pathname.startsWith('/analysis') ? 'max-w-5xl' : 'max-w-lg')}>
        <ReminderBanner />
        <div key={theme}><Outlet /></div>
        <Celebrate />
      </main>
      <nav style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} className="fixed inset-x-0 bottom-0 z-10 grid border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {tabs.map(({ to, label, icon: Icon, match, centre }) => {
          const on = match.some((m) => loc.pathname.startsWith(m));
          return (
            <Link key={to} to={to} aria-current={on ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-1 py-2.5', tabs.length > 5 ? 'text-[10px]' : 'text-[11px] tracking-wide', on ? 'text-primary' : 'text-muted-foreground')}>
              {centre
                ? <span className={cn('-mt-6 grid h-12 w-12 place-items-center rounded-full shadow-lg', on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground')}><Icon className="h-6 w-6" /></span>
                : <Icon className="h-5 w-5" />}
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
