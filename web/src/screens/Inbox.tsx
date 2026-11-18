import { Link } from 'react-router-dom';
import { useProfile } from '@/hooks/data';
import { usePlanData } from '@/hooks/plan';
import { amountText, EVENT_KINDS, niceTime, shortDate } from '@/lib/plan';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SlotActions, useTodaySlots } from '@/components/reminders';
import { HealthConsent, NOT_MEDICAL } from '@/components/health';

export function Inbox() {
  const profile = useProfile().data!;
  const { on, slots, day, now } = useTodaySlots();
  const d = usePlanData(profile);
  if (!on) return <HealthConsent profile={profile} />;
  const nowIso = new Date().toISOString();
  const upcoming = (d.events.data ?? []).filter((e) => e.starts_at >= nowIso).slice(0, 10);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">🔔 Reminders</h1>
      <Card>
        <CardHeader className="pb-2"><CardTitle>Today</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {slots.length ? slots.map((s) => (
            <div key={s.key} className="py-2 text-sm">
              <div className="flex justify-between"><b>{niceTime(s.time)} · {s.title}</b>{s.kind === 'log' && !s.done && s.time <= now && <span className="text-xs text-muted-foreground">due</span>}</div>
              {s.kind === 'log' ? <><ul className="text-muted-foreground">{s.items.map((i) => <li key={i.id}>{amountText(i)}</li>)}</ul><SlotActions s={s} day={day} /></>
                : s.event?.prep_notes && <p className="text-muted-foreground">Prep: {s.event.prep_notes}</p>}
            </div>
          )) : <p className="text-sm text-muted-foreground">Nothing set for today. Add items in <Link className="underline" to="/plan/log">My log</Link>.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2"><CardTitle>Coming up</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {upcoming.length ? upcoming.map((e) => (
            <div key={e.id} className="py-2 text-sm">
              <b>{EVENT_KINDS.find((k) => k.id === e.kind)?.icon} {e.title}</b>
              <span className="block text-muted-foreground">{shortDate(new Intl.DateTimeFormat('en-CA', { timeZone: profile.time_zone }).format(new Date(e.starts_at)))}{e.location ? ' · ' + e.location : ''}</span>
              {e.prep_notes && <span className="block text-xs text-muted-foreground">Prep: {e.prep_notes}</span>}
            </div>
          )) : <p className="text-sm text-muted-foreground">No appointments coming up. Add them in <Link className="underline" to="/plan/schedule">Schedule</Link>.</p>}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">Turn on phone alerts in Settings to get these on your lock screen. {NOT_MEDICAL}</p>
    </div>
  );
}
