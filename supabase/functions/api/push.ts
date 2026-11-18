// Phone alerts: works out which reminders are due for each person (in their own time zone) and sends them by Web Push.
// Same rules as the in-app banner (web/src/lib/plan.ts): log slots at their set times, events at their "remind me" times.
import webpush from 'npm:web-push@3.6.7';
import rrule from 'npm:rrule@2.8.1';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
// rrule ships as CommonJS here, so its exports arrive on the default object
const { RRule } = rrule as unknown as { RRule: typeof import('npm:rrule@2.8.1').RRule };
const WINDOW_MIN = 20;   // a reminder still goes out if the 5-minute job runs up to 20 minutes late

type Item = { id: string; user_id: string; name: string; amount: number | null; unit: string | null; strength: string | null; rrule: string; times: string[]; start_date: string; end_date: string | null; reminder: boolean; group_id: string | null; active: boolean };
type Group = { id: string; user_id: string; name: string; rrule: string; times: string[]; reminder: boolean };
type Ev = { id: string; user_id: string; title: string; starts_at: string; prep_notes: string | null; remind_minutes: number[]; rrule: string | null };

const utc = (d: string) => new Date(d + 'T00:00:00Z');
const dayDiff = (a: string, b: string) => Math.round((utc(b).getTime() - utc(a).getTime()) / 864e5);

export function occursOn(rule: string, start: string, day: string, end?: string | null): boolean {
  if (day < start || (end && day > end) || rule === 'AS_NEEDED') return false;
  const cyc = /^CYCLE;ON=(\d+);OFF=(\d+);UNIT=(DAY|WEEK)(?:;COUNT=(\d+))?$/.exec(rule);
  if (cyc) {
    const unit = cyc[3] === 'DAY' ? 1 : 7, on = +cyc[1] * unit, off = +cyc[2] * unit, k = dayDiff(start, day);
    if (cyc[4] && Math.floor(k / (on + off)) * +cyc[1] + Math.min(k % (on + off), on) >= +cyc[4] * unit) return false;
    return k % (on + off) < on;
  }
  try {
    const r = new RRule({ ...RRule.parseString(rule), dtstart: utc(start) });
    return r.between(utc(day), new Date(utc(day).getTime() + 864e5 - 1), true).length > 0;
  } catch { return false; }
}

function local(tz: string, at = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at);
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, mins: (+g('hour') % 24) * 60 + +g('minute') };
}
const toMins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
const amount = (i: Item) => { const a = i.amount != null ? `${i.amount}${i.unit ? ' ' + i.unit : ''}` : i.strength ?? ''; return a ? `${i.name} ${a}` : i.name; };

async function keys(admin: SupabaseClient) {
  const { data } = await admin.from('app_secrets').select('name, value').in('name', ['vapid_public', 'vapid_private']);
  const m = Object.fromEntries((data ?? []).map((r) => [r.name, r.value]));
  if (m.vapid_public && m.vapid_private) return { publicKey: m.vapid_public as string, privateKey: m.vapid_private as string };
  const k = webpush.generateVAPIDKeys();
  // ignoreDuplicates: if two calls race, the first saved pair wins and is read back
  await admin.from('app_secrets').upsert([{ name: 'vapid_public', value: k.publicKey }, { name: 'vapid_private', value: k.privateKey }], { onConflict: 'name', ignoreDuplicates: true });
  return keys(admin);
}

export async function publicKey(admin: SupabaseClient) { return (await keys(admin)).publicKey; }

export async function sendTo(admin: SupabaseClient, userId: string, payload: { title: string; body: string; url: string; tag: string }) {
  const k = await keys(admin);
  webpush.setVapidDetails('https://aevigor.com', k.publicKey, k.privateKey);
  const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);   // phone unsubscribed
      else console.warn('push failed', code, String((e as Error).message ?? e).slice(0, 200));
    }
  }
  return sent;
}

export async function checkToken(admin: SupabaseClient, token: string | null) {
  if (!token) return false;
  const { data } = await admin.from('app_secrets').select('value').eq('name', 'push_cron_token').maybeSingle();
  return !!data && data.value === token;
}

export async function pushDue(admin: SupabaseClient) {
  const { data: subs } = await admin.from('push_subscriptions').select('user_id');
  const users = [...new Set((subs ?? []).map((s) => s.user_id as string))];
  if (!users.length) return { users: 0, sent: 0 };
  const [{ data: profs }, { data: items }, { data: groups }, { data: events }] = await Promise.all([
    admin.from('profiles').select('user_id, time_zone, health_consent_at').in('user_id', users),
    admin.from('log_items').select('*').in('user_id', users).eq('active', true).eq('reminder', true),
    admin.from('log_groups').select('*').in('user_id', users),
    admin.from('events').select('*').in('user_id', users).gte('starts_at', new Date(Date.now() - 864e5).toISOString()).lte('starts_at', new Date(Date.now() + 8 * 864e5).toISOString())
  ]);
  let sent = 0;
  for (const p of profs ?? []) {
    if (!p.health_consent_at) continue;
    const now = local(p.time_zone);
    const due: { key: string; title: string; body: string; url: string }[] = [];
    const mine = (items ?? []).filter((i: Item) => i.user_id === p.user_id && i.rrule !== 'AS_NEEDED');
    const gs = (groups ?? []).filter((g: Group) => g.user_id === p.user_id);
    const inWindow = (t: string) => { const d = now.mins - toMins(t); return d >= 0 && d < WINDOW_MIN; };
    for (const g of gs) {
      if (!g.reminder) continue;
      const its = mine.filter((i: Item) => i.group_id === g.id && now.day >= i.start_date && (!i.end_date || now.day <= i.end_date));
      if (!its.length || !occursOn(g.rrule, its.reduce((a: string, b: Item) => (a < b.start_date ? a : b.start_date), its[0].start_date), now.day)) continue;
      for (const t of g.times) if (inWindow(t)) due.push({ key: `g:${g.id}:${now.day}:${t}`, title: `🔔 ${g.name}`, body: its.map(amount).join(', '), url: '/beta/inbox' });
    }
    for (const i of mine.filter((x: Item) => !x.group_id || !gs.some((g: Group) => g.id === x.group_id))) {
      if (!occursOn(i.rrule, i.start_date, now.day, i.end_date)) continue;
      for (const t of i.times) if (inWindow(t)) due.push({ key: `i:${i.id}:${now.day}:${t}`, title: '🔔 Reminder', body: amount(i), url: '/beta/inbox' });
    }
    for (const e of (events ?? []).filter((x: Ev) => x.user_id === p.user_id)) {
      const start = new Date(e.starts_at).getTime();
      for (const m of e.remind_minutes ?? []) {
        const d = (Date.now() - (start - m * 60000)) / 60000;
        if (d >= 0 && d < WINDOW_MIN) due.push({ key: `e:${e.id}:${m}`, title: `📅 ${e.title}`, body: e.prep_notes ? `Prep: ${e.prep_notes}` : new Date(e.starts_at).toLocaleString('en-CA', { timeZone: p.time_zone, dateStyle: 'medium', timeStyle: 'short' }), url: '/beta/plan/schedule' });
      }
    }
    for (const d of due) {
      // Claim the reminder first, so a late or doubled job never sends it twice
      const { error } = await admin.from('push_sent').insert({ user_id: p.user_id, key: d.key });
      if (error) continue;
      sent += await sendTo(admin, p.user_id, { title: d.title, body: d.body, url: d.url, tag: d.key });
    }
  }
  await admin.from('push_sent').delete().lt('sent_at', new Date(Date.now() - 3 * 864e5).toISOString());
  return { users: users.length, sent };
}
