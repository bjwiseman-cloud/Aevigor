// Morning check-in and Post Activity reminders (opt-in per person in Settings > Reminders), by email from
// no-reply@aevigor.com (Resend) and/or phone alert. Runs inside the 5-minute push job.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { local, sendTo } from './push.ts';
import { fetchActivities } from '../_shared/intervals.js';
import { addDays } from '../_shared/rules.js';
import { dueActivities, reminderEmail } from '../_shared/notify.js';

const APP = 'https://aevigor.com/beta/';
const WINDOW_MIN = 20;
const POST_EVERY_MIN = 15;   // look for new activities every 15 minutes (5-minute job, one run in three)

type Prefs = { user_id: string; morning_email: boolean; morning_push: boolean; morning_time: string; post_email: boolean; post_push: boolean; post_since: string };
type Prof = { user_id: string; email: string | null; display_name: string | null; time_zone: string; intervals_athlete_id: string | null; intervals_connected_at: string | null; consent_at: string | null };
type Msg = { heading: string; lines: string[]; button: string; path: string; push: string };

export async function sendEmail(to: string, subject: string, m: { html: string; text: string }) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.warn('RESEND_API_KEY is not set: email skipped'); return false; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'Aevigor <no-reply@aevigor.com>', to: [to], subject, html: m.html, text: m.text })
  });
  if (!r.ok) console.warn('email failed', r.status, (await r.text()).slice(0, 200));
  return r.ok;
}

async function deliver(admin: SupabaseClient, p: Prof, email: boolean, push: boolean, key: string, m: Msg) {
  // Claim first, so a late or doubled job never sends it twice
  const { error } = await admin.from('push_sent').insert({ user_id: p.user_id, key });
  if (error) return 0;
  let n = 0;
  if (email && p.email && await sendEmail(p.email, m.heading, reminderEmail({ heading: m.heading, lines: m.lines, button: m.button, url: APP + '#' + m.path }))) n++;
  if (push) n += await sendTo(admin, p.user_id, { title: m.heading, body: m.push, url: '/beta/#' + m.path, tag: key });
  return n;
}

export function morningMsg(status: string | null, name: string | null): Msg {
  const hi = name ? `Good morning, ${name.split(' ')[0]}.` : 'Good morning.';
  const lines = status ? [hi, `Today's status so far: ${status}. Your check-in can change it.`] : [hi, 'Check in to see how ready you are to train today.'];
  return { heading: '☀️ Morning check-in', lines: [...lines, 'It takes about a minute.'], button: 'Check in now', path: '/checkin', push: status ? `Status so far: ${status}. Tap to check in.` : 'Tap to check in.' };
}

export function postMsg(a: { id: string; name: string }): Msg {
  return {
    heading: '🏁 Post Activity: how did it go?',
    lines: [`"${a.name}" just synced.`, 'Add how hard it felt (RPE), how you felt, and any sore muscles while it is fresh.'],
    button: 'Fill in Post Activity', path: `/checkin/session?a=${encodeURIComponent(a.id)}`, push: `${a.name}: tap to add RPE and how you felt.`
  };
}

export async function notifyDue(admin: SupabaseClient, keyFor: (userId: string) => Promise<string>) {
  const { data: prefs } = await admin.from('notify_prefs').select('*').or('morning_email.eq.true,morning_push.eq.true,post_email.eq.true,post_push.eq.true');
  if (!prefs?.length) return { users: 0, sent: 0 };
  const { data: profs } = await admin.from('profiles').select('user_id, email, display_name, time_zone, intervals_athlete_id, intervals_connected_at, consent_at').in('user_id', prefs.map((p) => p.user_id));
  let sent = 0;
  for (const pr of prefs as Prefs[]) {
    const p = (profs ?? []).find((x: Prof) => x.user_id === pr.user_id) as Prof | undefined;
    if (!p?.consent_at || (pr as Prefs & { paused?: boolean }).paused) continue;   // Settings › Reminders › Pause all
    const now = local(p.time_zone);
    try {
      if (pr.morning_email || pr.morning_push) {
        const t = +pr.morning_time.slice(0, 2) * 60 + +pr.morning_time.slice(3, 5);
        if (now.mins - t >= 0 && now.mins - t < WINDOW_MIN) {
          const { data: done } = await admin.from('checkins').select('day').eq('user_id', p.user_id).eq('day', now.day).maybeSingle();
          if (!done) {
            const { data: st } = await admin.from('daily_status').select('status').eq('user_id', p.user_id).eq('day', now.day).maybeSingle();
            sent += await deliver(admin, p, pr.morning_email, pr.morning_push, `m:${now.day}`, morningMsg(st?.status ?? null, p.display_name));
          }
        }
      }
      if ((pr.post_email || pr.post_push) && p.intervals_connected_at && now.mins % POST_EVERY_MIN < 5) {
        const acts = await fetchActivities(await keyFor(p.user_id), p.intervals_athlete_id ?? '0', addDays(now.day, -1), now.day);
        const { data: logs } = await admin.from('session_logs').select('activity_id').eq('user_id', p.user_id).gte('day', addDays(now.day, -2));
        const due = dueActivities(acts, { nowMs: Date.now(), sinceMs: Date.parse(pr.post_since), logged: new Set((logs ?? []).map((l) => l.activity_id as string)) });
        for (const a of due) sent += await deliver(admin, p, pr.post_email, pr.post_push, `p:${a.id}`, postMsg(a));
      }
    } catch (e) { console.warn('reminder failed for a user', String((e as Error).message).slice(0, 160)); }
  }
  return { users: prefs.length, sent };
}
