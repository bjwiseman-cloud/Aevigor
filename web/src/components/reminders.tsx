// In-app reminders: a banner that pops up when something you set is due, and the 🔔 inbox.
// Phone lock-screen alerts (Web Push) use the same slots, sent by the api function's push-due job.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useProfile } from '@/hooks/data';
import { useMarkSlot, usePlanData } from '@/hooks/plan';
import { amountText, niceTime, nowHHMM, slotsForDay, type Slot } from '@/lib/plan';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useNotifyPrefs } from '@/components/ReminderSettings';

const SNOOZE_KEY = 'aev-snooze';
function snoozed(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SNOOZE_KEY) || '{}'); } catch { return {}; }
}

function useClock(ms = 30000) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), ms); return () => clearInterval(t); }, [ms]);
}

export function useTodaySlots() {
  const p = useProfile().data;
  const d = usePlanData(p);
  useClock();
  const slots = useMemo(
    () => (d.on && p ? slotsForDay(d.today, d.items.data ?? [], d.groups.data ?? [], d.doses.data ?? [], d.events.data ?? [], p.time_zone) : []),
    [d.on, p, d.today, d.items.data, d.groups.data, d.doses.data, d.events.data]
  );
  const now = p ? nowHHMM(p.time_zone) : '00:00';
  const due = slots.filter((s) => s.kind === 'log' && !s.done && s.time <= now);
  return { on: d.on, day: d.today, slots, due, now };
}

export function BellButton() {
  const { due } = useTodaySlots();
  return (
    <Button asChild variant="ghost" size="icon" aria-label={due.length ? `Reminders, ${due.length} due` : 'Reminders'} className="relative">
      <Link to="/inbox">
        <Bell />
        {due.length > 0 && (
          <span className="absolute right-1 top-1 min-w-[16px] rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-destructive-foreground">{due.length}</span>
        )}
      </Link>
    </Button>
  );
}

export function SlotActions({ s, day, compact }: { s: Slot; day: string; compact?: boolean }) {
  const mark = useMarkSlot();
  const ids = s.items.map((i) => i.id);
  if (s.done) return <span className="text-sm text-muted-foreground">✓ {s.taken ? 'Taken' : 'Skipped'}{s.skipped && s.taken ? ' (some skipped)' : ''}</span>;
  return (
    <div className={cn('flex gap-2', compact ? '' : 'mt-2')}>
      <Button size="sm" onClick={() => mark.mutate({ itemIds: ids, day, slot: s.time, status: 'taken' })} disabled={mark.isPending}>Taken</Button>
      <Button size="sm" variant="outline" onClick={() => mark.mutate({ itemIds: ids, day, slot: s.time, status: 'skipped' })} disabled={mark.isPending}>Skip</Button>
    </div>
  );
}

// Pops up at the top of every page when a reminder is due and not yet logged
export function ReminderBanner() {
  const { due, day } = useTodaySlots();
  const np = useNotifyPrefs().data;
  const [, force] = useState(0);
  if (np?.paused || np?.appt_push === false) return null;   // Settings › Reminders: pause all / appointments off
  const sn = snoozed();
  const s = due.find((x) => !(sn[`${day}:${x.key}`] > Date.now()));
  if (!s) return null;
  const snooze = () => {
    const all = snoozed(); all[`${day}:${s.key}`] = Date.now() + 15 * 60 * 1000;
    try { localStorage.setItem(SNOOZE_KEY, JSON.stringify(all)); } catch { /* private mode */ }
    force((x) => x + 1);
  };
  return (
    <div role="status" className="mb-4 rounded-lg border bg-card p-3 shadow-lg animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none">
      <div className="font-semibold">🔔 Reminder · {niceTime(s.time)}{s.items.length > 1 && <> · {s.title}</>}</div>
      <ul className="mt-1 text-sm">
        {s.items.map((i) => <li key={i.id}>{amountText(i)} <span className="text-muted-foreground">(you set this)</span></li>)}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <SlotActions s={s} day={day} />
        <Button size="sm" variant="ghost" className="mt-2" onClick={snooze}>Snooze 15 min</Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Not medical advice.</p>
    </div>
  );
}
