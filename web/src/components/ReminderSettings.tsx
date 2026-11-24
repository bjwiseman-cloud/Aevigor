// Settings > Reminders: morning check-in and Post Activity reminders, by email (from no-reply@aevigor.com) and/or
// phone alert. All off until the person turns them on. Saved in notify_prefs; the server's 5-minute job sends them.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { PhoneAlerts } from '@/components/PhoneAlerts';

type Prefs = { morning_email: boolean; morning_push: boolean; morning_time: string; post_email: boolean; post_push: boolean; post_since?: string; paused: boolean; training_push: boolean; appt_push: boolean };
const OFF: Prefs = { morning_email: false, morning_push: false, morning_time: '07:00', post_email: false, post_push: false, paused: false, training_push: true, appt_push: true };

export function useNotifyPrefs() {
  return useQuery({
    queryKey: ['notify_prefs'],
    queryFn: async (): Promise<Prefs> => {
      const { data, error } = await supabase.from('notify_prefs').select('morning_email, morning_push, morning_time, post_email, post_push, paused, training_push, appt_push').maybeSingle();
      if (error) throw error;
      return { ...OFF, ...(data ?? {}) };
    }
  });
}

function Row({ label, sub, checked, onChange }: { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span>{label}{sub && <span className="block text-xs text-muted-foreground">{sub}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function useSaveNotify() {
  const q = useNotifyPrefs();
  const qc = useQueryClient();
  const p = q.data ?? OFF;
  return { p, loaded: !q.isLoading, save: async (patch: Partial<Prefs>) => {
    const next = { ...p, ...patch };
    // Post Activity reminders only cover activities that start after they are switched on
    const postWasOff = !p.post_email && !p.post_push, postNowOn = next.post_email || next.post_push;
    const row: Prefs & { updated_at: string } = { ...next, updated_at: new Date().toISOString() };
    if (postWasOff && postNowOn) row.post_since = new Date().toISOString();
    qc.setQueryData(['notify_prefs'], next);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('notify_prefs').upsert({ user_id: u.user?.id, ...row }, { onConflict: 'user_id' });
    if (error) { toast.error(error.message); qc.invalidateQueries({ queryKey: ['notify_prefs'] }); }
  } };
}

// On the morning check-in page (Ben 2026-11-24): pick the reminder time right there.
export function CheckinReminderRow() {
  const { p, loaded, save } = useSaveNotify();
  if (!loaded) return null;
  const on = p.morning_push || p.morning_email;
  return (
    <div className="space-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
    <div className="flex items-center gap-2">
      <span className="text-lg">⏰</span>
      <span className="flex-1">Remind me each morning{p.paused && <span className="block text-xs text-muted-foreground">Reminders are paused in Settings</span>}</span>
      {on && <Input type="time" aria-label="Reminder time" className="h-8 w-28" value={p.morning_time} onChange={(e) => /^\d\d:\d\d$/.test(e.target.value) && save({ morning_time: e.target.value })} />}
      <Switch checked={on} aria-label="Remind me each morning" onCheckedChange={(v) => save(v ? { morning_push: true } : { morning_push: false, morning_email: false })} />
    </div>
    {p.morning_push && <PhoneAlerts />}
    </div>
  );
}

export function Reminders({ email }: { email: string | null }) {
  const { p, save } = useSaveNotify();
  const anyPush = p.morning_push || p.post_push;
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground">Emails come from no-reply@aevigor.com{email ? ` to ${email}` : ''}. Phone alerts need alerts turned on for this device below.</p>
      <Row label="Pause all reminders" sub="Holiday or a break: no emails or phone alerts until you turn this off" checked={p.paused} onChange={(v) => save({ paused: v })} />
      <div className={p.paused ? 'pointer-events-none space-y-3 opacity-50' : 'space-y-3'} aria-disabled={p.paused}>
      <b className="block">Morning check-in</b>
      <Row label="Email me" checked={p.morning_email} onChange={(v) => save({ morning_email: v })} />
      <Row label="Phone alert" checked={p.morning_push} onChange={(v) => save({ morning_push: v })} />
      <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
        <span>Time<span className="block text-xs text-muted-foreground">Skipped if you have already checked in that day</span></span>
        <Input type="time" className="w-32" value={p.morning_time} onChange={(e) => /^\d\d:\d\d$/.test(e.target.value) && save({ morning_time: e.target.value })} />
      </label>
      <b className="block pt-1">Post Activity</b>
      <p className="text-xs text-muted-foreground">About 5 to 20 minutes after a workout of 15 minutes or more reaches intervals.icu, if you have not filled in Post Activity for it yet. Needs intervals.icu connected.</p>
      <Row label="Email me" checked={p.post_email} onChange={(v) => save({ post_email: v })} />
      <Row label="Phone alert" checked={p.post_push} onChange={(v) => save({ post_push: v })} />
      <b className="block pt-1">Calendar reminders</b>
      <p className="text-xs text-muted-foreground">Phone alerts before things on your Calendar. Training and appointments are separate, so you can keep one and turn off the other.</p>
      <Row label="Training, tests and races" checked={p.training_push} onChange={(v) => save({ training_push: v })} />
      <Row label="Appointments and other events" sub="Includes My log reminders (needs the health log turned on)" checked={p.appt_push} onChange={(v) => save({ appt_push: v })} />
      </div>
      {(p.morning_email || p.post_email) && <Button variant="outline" size="sm" onClick={() => callApi<{ to: string }>('notify-test').then((r) => toast.success(`Test email sent to ${r.to}`)).catch((e) => toast.error(e.message))}>Send me a test email</Button>}
      {anyPush && <PhoneAlerts />}
    </div>
  );
}
