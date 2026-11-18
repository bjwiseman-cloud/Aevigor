// Aevigor beta API (one Supabase edge function). Routes, all POST:
//   /api/connect         save and test the person's intervals.icu API key, then sync
//   /api/disconnect      forget the key
//   /api/sync            the Sync button
//   /api/checkin         save the daily check-in, copy it to intervals.icu, recompute today
//   /api/session         after-a-session log (RPE to intervals.icu, ride conditions, lifting extras)
//   /api/libido          turn the optional libido log on/off, or delete every entry
//   /api/streams         one activity's second-by-second data (Sessions, W′ battery)
//   /api/push-key, /api/push-test   phone alerts set-up; /api/push-due runs every 5 minutes (database job)
//   /api/delete-account  delete the account and every row of the person's data
//   /api/cron            nightly sync of everyone (needs the x-cron-secret header)
//   /api/invites, /api/invite, /api/uninvite   admins only: list, add and remove testers
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { syncUser, todayIn } from '../_shared/sync.js';
import { icu, athletePath, putWellness, IntervalsError } from '../_shared/intervals.js';
import { encrypt, decrypt } from '../_shared/crypto.js';
import { addDays } from '../_shared/rules.js';
import { fetchStreams } from '../_shared/performance.js';
import { checkToken, publicKey, pushDue, sendTo } from './push.ts';

// The encryption key and the cron password default to values derived from the project's own service-role key,
// which Supabase gives every function automatically, so no hand-made secrets are needed. Setting
// BETA_ENCRYPTION_KEY / BETA_CRON_SECRET still overrides them. (Rotating the service-role key means testers reconnect intervals.icu.)
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ENC = Deno.env.get('BETA_ENCRYPTION_KEY') || (SERVICE_KEY ? 'aevigor-intervals-v1:' + SERVICE_KEY : '');
const CRON_SECRET = Deno.env.get('BETA_CRON_SECRET') ?? '';
const ORIGINS = (Deno.env.get('BETA_ALLOWED_ORIGINS') ?? 'https://aevigor.com,https://www.aevigor.com').split(',').map((s) => s.trim());
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

function cors(req: Request) {
  const o = req.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.includes(o) || /^http:\/\/localhost(:\d+)?$/.test(o) ? o : ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  };
}

const store = {
  async checkins(userId: string, from: string) {
    const { data, error } = await admin.from('checkins').select('*').eq('user_id', userId).gte('day', from);
    if (error) throw error; return data ?? [];
  },
  async upsertWellness(rows: unknown[]) { const { error } = await admin.from('wellness').upsert(rows); if (error) throw error; },
  async upsertStatus(rows: unknown[]) { const { error } = await admin.from('daily_status').upsert(rows); if (error) throw error; },
  async replaceLoad(userId: string, from: string, to: string, rows: unknown[]) {
    const del = await admin.from('daily_load').delete().eq('user_id', userId).gte('day', from).lte('day', to);
    if (del.error) throw del.error;
    if (rows.length) { const { error } = await admin.from('daily_load').insert(rows); if (error) throw error; }
  },
  async replaceTests(userId: string, rows: unknown[]) {
    const del = await admin.from('planned_tests').delete().eq('user_id', userId);
    if (del.error) throw del.error;
    if (rows.length) { const { error } = await admin.from('planned_tests').insert(rows); if (error) throw error; }
  },
  async replaceCalendar(userId: string, rows: unknown[]) {
    const del = await admin.from('calendar_items').delete().eq('user_id', userId);
    if (del.error) throw del.error;
    if (rows.length) { const { error } = await admin.from('calendar_items').insert(rows); if (error) throw error; }
  },
  async updateProfile(userId: string, patch: Record<string, unknown>) { await admin.from('profiles').update(patch).eq('user_id', userId); },
  async knownBests(userId: string, ids: string[]) {
    const { data, error } = await admin.from('activities').select('id').eq('user_id', userId).in('id', ids.length ? ids : ['-']).not('best', 'is', null);
    if (error) throw error; return new Set((data ?? []).map((r) => r.id as string));
  },
  async upsertActivities(rows: Record<string, unknown>[]) {
    // Rows without new bests must not wipe the stored ones, so they are upserted without that column
    const withBest = rows.filter((r) => r.best), rest = rows.filter((r) => !r.best);
    for (const part of [withBest, rest]) {
      for (let i = 0; i < part.length; i += 200) { const { error } = await admin.from('activities').upsert(part.slice(i, i + 200)); if (error) throw error; }
    }
  },
  async pruneActivities(userId: string, from: string, to: string, keep: string[]) {
    // Activities deleted in intervals.icu disappear here too (only inside the window just fetched)
    const { data } = await admin.from('activities').select('id').eq('user_id', userId).gte('day', from).lte('day', to);
    const gone = (data ?? []).map((r) => r.id as string).filter((id) => !keep.includes(id));
    if (gone.length) await admin.from('activities').delete().eq('user_id', userId).in('id', gone);
  },
  async replaceCurves(userId: string, rows: unknown[]) {
    await admin.from('power_curves').delete().eq('user_id', userId);
    const { error } = await admin.from('power_curves').insert(rows); if (error) throw error;
  },
  async replacePaceCurves(userId: string, rows: unknown[]) {
    await admin.from('pace_curves').delete().eq('user_id', userId);
    const { error } = await admin.from('pace_curves').insert(rows); if (error) throw error;
  }
};

async function currentUser(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
  if (!token) throw new HttpError(401, 'Please sign in again.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Please sign in again.');
  const { data: profile } = await admin.from('profiles').select('*').eq('user_id', data.user.id).single();
  if (!profile) throw new HttpError(403, 'No profile found for this account.');
  return { user: data.user, profile };
}

function needConsent(profile: { consent_at: string | null }) {
  if (!profile.consent_at) throw new HttpError(403, 'Please review and accept the beta privacy notice first.');
}

async function keyFor(userId: string) {
  const { data } = await admin.from('intervals_secrets').select('key_cipher').eq('user_id', userId).maybeSingle();
  if (!data) throw new HttpError(409, 'Connect your intervals.icu account first (Settings).');
  return await decrypt(data.key_cipher, ENC);
}

async function runSync(userId: string, profile: { intervals_athlete_id: string | null; time_zone: string }, key?: string) {
  return await syncUser({
    userId, key: key ?? await keyFor(userId), athleteId: profile.intervals_athlete_id ?? '0',
    timeZone: profile.time_zone, store
  });
}

function validTz(tz: unknown) {
  if (typeof tz !== 'string' || tz.length > 64) return null;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return tz; } catch { return null; }
}

function needAdmin(profile: { is_admin?: boolean }) {
  if (!profile.is_admin) throw new HttpError(403, 'Only the beta admin can manage invites.');
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_TESTERS = 50;

const ANSWERS = ['sleep_quality', 'fatigue', 'soreness', 'stress', 'mood', 'motivation'] as const;

// Body map from the check-in: each part sore and/or injured, level 1 (light) to 4 (severe).
type BodyMap = Record<string, { sore?: number; injury?: number }>;
// Same parts, levels and comment wording as the live app, so either app can read the other's comments.
const BODY_LABELS: Record<string, string> = { chest: 'Chest', shoulders: 'Shoulders', arms: 'Arms', abs: 'Abs', upperBack: 'Upper back/neck', lowerBack: 'Lower back', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves' };
const SORE_LEVELS = ['Low', 'Average', 'High', 'Extreme'], INJURY_LEVELS = ['None', 'Niggle', 'Poor', 'Injured'];
function cleanBody(v: unknown): BodyMap | null {
  if (!v || typeof v !== 'object') return null;
  const out: BodyMap = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) {
    if (!BODY_LABELS[k] || !x || typeof x !== 'object') continue;
    const o: { sore?: number; injury?: number } = {};
    for (const f of ['sore', 'injury'] as const) { const n = Number((x as Record<string, unknown>)[f]); if (Number.isInteger(n) && n >= 1 && n <= 4) o[f] = n; }
    if (o.sore || o.injury) out[k] = o;
  }
  return Object.keys(out).length ? out : null;
}
function bodySummary(b: BodyMap | null) {
  if (!b) return '';
  const keys = Object.keys(BODY_LABELS).filter((k) => b[k]);
  const sore = keys.filter((k) => b[k].sore).map((k) => `${BODY_LABELS[k]} (${SORE_LEVELS[b[k].sore! - 1]})`);
  const inj = keys.filter((k) => b[k].injury).map((k) => `${BODY_LABELS[k]} (${INJURY_LEVELS[b[k].injury! - 1]})`);
  return [sore.length ? 'Sore: ' + sore.join(', ') : '', inj.length ? 'Injured: ' + inj.join(', ') : ''].filter(Boolean).join(' · ');
}

const COND_KEYS = ['type', 'len', 'time', 'fan', 'strap', 'fuel', 'heat', 'hyd', 'ill', 'sleep', 'hard', 'caf', 'warm', 'zero', 'meal'];
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Glutes', 'Quads', 'Hamstrings', 'Calves'];
const JOINTS = ['Shoulder', 'Elbow', 'Wrist', 'Low back', 'Hip', 'Knee', 'Ankle', 'Other'];

const routes: Record<string, (req: Request, body: any) => Promise<unknown>> = {
  async connect(req, body) {
    const { user, profile } = await currentUser(req); needConsent(profile);
    const key = String(body.api_key ?? '').trim();
    if (!/^[A-Za-z0-9]{10,100}$/.test(key)) throw new HttpError(400, 'That API key does not look right. Copy it again from intervals.icu.');
    const wanted = String(body.athlete_id ?? '').trim() || '0';
    const athlete = await icu(key, athletePath(wanted));          // proves the key works
    const athleteId = String(athlete?.id ?? wanted);
    await admin.from('intervals_secrets').upsert({ user_id: user.id, key_cipher: await encrypt(key, ENC), updated_at: new Date().toISOString() });
    const tz = validTz(body.time_zone) ?? profile.time_zone;
    const patch = { intervals_athlete_id: athleteId, intervals_connected_at: new Date().toISOString(), time_zone: tz };
    await admin.from('profiles').update(patch).eq('user_id', user.id);
    const sync = await runSync(user.id, { ...profile, ...patch }, key);
    return { ok: true, athlete: { id: athleteId, name: athlete?.name ?? null }, sync };
  },

  async disconnect(req) {
    const { user } = await currentUser(req);
    await admin.from('intervals_secrets').delete().eq('user_id', user.id);
    await admin.from('profiles').update({ intervals_athlete_id: null, intervals_connected_at: null }).eq('user_id', user.id);
    return { ok: true };
  },

  async sync(req) {
    const { user, profile } = await currentUser(req); needConsent(profile);
    return await runSync(user.id, profile);
  },

  async checkin(req, body) {
    const { user, profile } = await currentUser(req); needConsent(profile);
    const today = todayIn(profile.time_zone);
    const day = String(body.day ?? today);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today || day < addDays(today, -2)) throw new HttpError(400, 'Check-ins can be saved for today or the two days before.');
    const row: Record<string, unknown> = { user_id: user.id, day, updated_at: new Date().toISOString() };
    for (const k of ANSWERS) {
      const v = Number(body[k]);
      row[k] = Number.isInteger(v) && v >= 1 && v <= 4 ? v : null;
    }
    row.sick = ['No', 'Mild', 'Yes'].includes(body.sick) ? body.sick : null;
    row.notes = typeof body.notes === 'string' ? body.notes.slice(0, 2000) : null;
    const numIn = (v: unknown, lo: number, hi: number, int = false) => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) return null;
      return int ? Math.round(n) : Math.round(n * 10) / 10;
    };
    row.clarity = numIn(body.clarity, 1, 5, true);
    row.libido = profile.libido_log ? numIn(body.libido, 0, 7, true) : null;
    row.caffeine = numIn(body.caffeine, 0, 1500);
    row.alcohol = numIn(body.alcohol, 0, 30);
    row.body_temp = numIn(body.body_temp, 34, 42);
    row.body = cleanBody(body.body);
    // As in the live app: the body map replaces the soreness question (highest sore level, 1 when nothing is sore)
    let injury: number | null = null;
    if (body.body !== undefined) {
      const b = (row.body ?? {}) as BodyMap;
      row.soreness = Math.max(1, ...Object.values(b).map((x) => x.sore ?? 0));
      injury = Math.max(1, ...Object.values(b).map((x) => x.injury ?? 0));
    }
    const { error } = await admin.from('checkins').upsert(row);
    if (error) throw error;

    // Copy to intervals.icu (not fatal if it fails: the check-in is already saved here)
    let copied = false, sync = null;
    try {
      const key = await keyFor(user.id);
      const icuBody: Record<string, unknown> = {};
      const map = { sleep_quality: 'sleepQuality', fatigue: 'fatigue', soreness: 'soreness', stress: 'stress', mood: 'mood', motivation: 'motivation' } as const;
      for (const k of ANSWERS) if (row[k] !== null) icuBody[map[k]] = row[k];
      icuBody.Sickness = row.sick === 'Yes' ? 2 : row.sick === 'Mild' ? 1 : 0;
      if (injury !== null) icuBody.injury = injury;
      for (const [col, f] of [['clarity', 'MentalClarity'], ['libido', 'Libido'], ['caffeine', 'Caffeine'], ['alcohol', 'Alcohol'], ['body_temp', 'BodyTemp']] as const) {
        if (row[col] !== null) icuBody[f] = row[col];
      }
      const bodyNote = bodySummary(row.body as BodyMap | null);
      // Body parts first, then notes, as the live app writes them (Sickness has its own field)
      const comments = [bodyNote, row.notes].filter(Boolean).join(' | ');
      if (comments) icuBody.comments = comments;
      await putWellness(key, profile.intervals_athlete_id ?? '0', day, icuBody);
      copied = true;
      sync = await runSync(user.id, profile, key);
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 409)) console.warn('checkin follow-up failed', e);
    }
    return { ok: true, copied, sync };
  },

  // "After a session": session RPE (copied onto the intervals.icu activity), ride conditions or lifting extras.
  async session(req, body) {
    const { user, profile } = await currentUser(req); needConsent(profile);
    const id = String(body.id ?? '');
    const { data: act } = await admin.from('activities').select('id, day').eq('user_id', user.id).eq('id', id).maybeSingle();
    if (!act) throw new HttpError(404, 'That session was not found. Try syncing first.');
    const kind = ['ride', 'lift', 'other'].includes(body.kind) ? body.kind : 'other';
    const rpe = Number.isInteger(Number(body.rpe)) && Number(body.rpe) >= 1 && Number(body.rpe) <= 10 ? Number(body.rpe) : null;
    const int = (v: unknown, lo: number, hi: number) => { const n = Math.round(Number(v)); return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
    const pick = <T,>(v: unknown, list: readonly T[]) => (list.includes(v as T) ? (v as T) : null);
    const d = (body.data ?? {}) as Record<string, any>;
    const data: Record<string, unknown> = { perf: int(d.perf, 1, 5) };
    if (kind === 'ride') {
      const c: Record<string, boolean> = {};
      for (const k of COND_KEYS) if (typeof d.c?.[k] === 'boolean') c[k] = d.c[k];
      Object.assign(data, { mode: d.mode === 'test' ? 'test' : 'z2', c, temp: int(d.temp, -30, 50), carbs: int(d.carbs, 0, 200) });
    } else if (kind === 'lift') {
      const sore: Record<string, number> = {};
      for (const m of MUSCLES) { const v = int(d.sore?.[m], 1, 3); if (v) sore[m] = v; }
      const joint = int(d.joint, 0, 10) ?? 0;
      Object.assign(data, { sore, joint, jointWhere: joint ? pick(d.jointWhere, JOINTS) : null, pump: int(d.pump, 0, 3) });
    }
    const row = { user_id: user.id, activity_id: id, day: act.day, kind, rpe, note: typeof body.note === 'string' ? body.note.slice(0, 300) : null, data, updated_at: new Date().toISOString() };
    const { error } = await admin.from('session_logs').upsert(row);
    if (error) throw error;
    let copied = false;
    if (rpe) {
      try { await icu(await keyFor(user.id), '/activity/' + encodeURIComponent(id), 'PUT', { icu_rpe: rpe }); copied = true; }
      catch (e) { console.warn('session RPE copy failed', e); }
    }
    return { ok: true, copied };
  },

  // Libido log: optional, off by default. Turning it off keeps past entries; deleteAll removes every entry here and in intervals.icu.
  async libido(req, body) {
    const { user, profile } = await currentUser(req); needConsent(profile);
    if (typeof body.on === 'boolean') await admin.from('profiles').update({ libido_log: body.on }).eq('user_id', user.id);
    let deleted = 0;
    if (body.deleteAll === true) {
      const { data: rows } = await admin.from('checkins').select('day').eq('user_id', user.id).not('libido', 'is', null);
      const { data: wrows } = await admin.from('wellness').select('day, extra').eq('user_id', user.id).not('extra->Libido', 'is', null);
      const days = new Set([...(rows ?? []).map((r) => String(r.day)), ...(wrows ?? []).map((r) => String(r.day))]);
      await admin.from('checkins').update({ libido: null }).eq('user_id', user.id).not('libido', 'is', null);
      for (const w of wrows ?? []) {
        const extra = { ...(w.extra as Record<string, unknown>) }; delete extra.Libido;
        await admin.from('wellness').update({ extra }).eq('user_id', user.id).eq('day', w.day);
      }
      try {
        const key = await keyFor(user.id);
        for (const d of days) await putWellness(key, profile.intervals_athlete_id ?? '0', d, { Libido: null });
      } catch (e) { console.warn('libido delete in intervals.icu failed', e); }
      deleted = days.size;
    }
    return { ok: true, deleted };
  },

  // Second-by-second data for one activity (Sessions detail, W′ battery). Only the person's own activities.
  async streams(req, body) {
    const { user, profile } = await currentUser(req); needConsent(profile);
    const id = String(body.id ?? '');
    const { data } = await admin.from('activities').select('id').eq('user_id', user.id).eq('id', id).maybeSingle();
    if (!data) throw new HttpError(404, 'That activity was not found. Try syncing first.');
    return { streams: await fetchStreams(await keyFor(user.id), id) };
  },

  // Phone alerts
  async 'push-key'(req) { await currentUser(req); return { publicKey: await publicKey(admin) }; },
  async 'push-test'(req) {
    const { user } = await currentUser(req);
    const sent = await sendTo(admin, user.id, { title: '🔔 Aevigor', body: 'Phone alerts are on. Reminders you set will show here.', url: '/beta/#/inbox', tag: 'test' });
    if (!sent) throw new HttpError(409, 'No phone is set up for alerts yet. Turn alerts on first.');
    return { ok: true, sent };
  },
  async 'push-due'(req) {
    if (!(await checkToken(admin, req.headers.get('x-push-token')))) throw new HttpError(401, 'Not allowed');
    return await pushDue(admin);
  },

  async 'delete-account'(req, body) {
    const { user } = await currentUser(req);
    if (body.confirm !== 'DELETE') throw new HttpError(400, 'Type DELETE to confirm.');
    // Every table references auth.users with ON DELETE CASCADE, so this removes all of the person's rows.
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return { ok: true };
  },

  async invites(req) {
    const { profile } = await currentUser(req); needAdmin(profile);
    const [{ data: inv, error }, { data: people }] = await Promise.all([
      admin.from('invites').select('email, note, invited_at, is_admin').order('invited_at', { ascending: false }),
      admin.from('profiles').select('email, created_at, intervals_connected_at, last_sync')
    ]);
    if (error) throw error;
    const byEmail = new Map((people ?? []).map((p) => [p.email, p]));
    return {
      invites: (inv ?? []).map((i) => {
        const p = byEmail.get(i.email);
        return { ...i, joined_at: p?.created_at ?? null, connected: !!p?.intervals_connected_at, last_sync: p?.last_sync ?? null };
      })
    };
  },

  async invite(req, body) {
    const { user, profile } = await currentUser(req); needAdmin(profile);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, 'That email address does not look right.');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) || null : null;
    const { count } = await admin.from('invites').select('email', { count: 'exact', head: true });
    if ((count ?? 0) >= MAX_TESTERS) throw new HttpError(400, `The beta is limited to ${MAX_TESTERS} people.`);
    const { error } = await admin.from('invites').insert({ email, note, invited_by: user.id });
    if (error?.code === '23505') throw new HttpError(409, 'That person is already invited.');
    if (error) throw error;
    return { ok: true, email };
  },

  async uninvite(req, body) {
    const { profile } = await currentUser(req); needAdmin(profile);
    const email = String(body.email ?? '').trim().toLowerCase();
    if (email === profile.email) throw new HttpError(400, 'You cannot remove your own invite.');
    const { data: joined } = await admin.from('profiles').select('user_id').eq('email', email).maybeSingle();
    if (joined) throw new HttpError(409, 'This person has already signed up. They can delete their account in Settings, or you can remove them in Supabase > Authentication > Users.');
    const { error } = await admin.from('invites').delete().eq('email', email);
    if (error) throw error;
    return { ok: true };
  },

  async cron(req) {
    const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer /i, '');
    const okSecret = !!CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET;
    const okService = !!SERVICE_KEY && bearer === SERVICE_KEY;
    if (!okSecret && !okService) throw new HttpError(401, 'Not allowed');
    const { data: people } = await admin.from('profiles').select('*').not('intervals_connected_at', 'is', null).not('consent_at', 'is', null);
    const results: Record<string, string> = {};
    const queue = [...(people ?? [])];
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        try { const r = await runSync(p.user_id, p); results[p.user_id] = r.today?.status ?? 'no status yet'; }
        catch (e) { results[p.user_id] = 'error: ' + String((e as Error).message).slice(0, 80); }
      }
    }));
    return { ok: true, synced: Object.keys(results).length, results };
  }
};

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  const name = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const route = routes[name];
  if (req.method !== 'POST' || !route) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  try {
    const body = await req.json().catch(() => ({}));
    return new Response(JSON.stringify(await route(req, body)), { headers });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : e instanceof IntervalsError ? (e.status === 401 || e.status === 403 ? 400 : 502) : 500;
    if (status === 500) console.error(e);
    const msg = status === 500 ? 'Something went wrong on our side. Please try again.' : (e as Error).message;
    return new Response(JSON.stringify({ error: msg }), { status, headers });
  }
});
