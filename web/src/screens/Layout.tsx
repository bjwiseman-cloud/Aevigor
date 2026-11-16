import { NavLink, Outlet } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, ClipboardCheck, Gauge, RefreshCw, Settings as Cog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { callApi } from '@/lib/api';
import { cn } from '@/lib/utils';

export function Brand() {
  return (
    <div className="font-mono text-lg font-bold tracking-[0.3em] text-cyan-100 [text-shadow:0_0_8px_hsl(var(--primary))]">
      AEVIGOR<span className="ml-2 text-[11px] tracking-normal text-status-caution [text-shadow:none]">BETA</span>
    </div>
  );
}

const TABS = [
  { to: '/today', label: 'Today', icon: Gauge },
  { to: '/checkin', label: 'Check-in', icon: ClipboardCheck },
  { to: '/guide', label: 'Guide', icon: BookOpen },
  { to: '/settings', label: 'Settings', icon: Cog }
];

export function Layout() {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => callApi('sync'),
    onSuccess: () => { qc.invalidateQueries(); toast.success('Synced'); },
    onError: (e: Error) => toast.error(e.message)
  });

  return (
    <div className="min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-2.5 backdrop-blur">
        <Brand />
        <Button variant="outline" size="sm" className="border-primary font-mono text-primary" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={cn(sync.isPending && 'animate-spin')} />
          {sync.isPending ? 'Syncing…' : 'Sync'}
        </Button>
      </header>
      <main className="mx-auto max-w-lg p-4">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('flex flex-col items-center gap-1 py-2.5 font-mono text-[11px] uppercase tracking-wide',
                isActive ? 'text-primary [text-shadow:0_0_6px_hsl(var(--primary))]' : 'text-muted-foreground')
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
