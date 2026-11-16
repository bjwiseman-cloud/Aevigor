// Sync one person: pull wellness, activities and planned workouts from intervals.icu, merge their check-ins,
// work out the daily status for the last 7 days and save it. The `store` is passed in so this runs in tests too.
import { evaluate, loadVsPlan, addDays, dailyLoadRows, plannedTests, HISTORY_DAYS, RULES_VERSION } from './rules.js';
import { fetchWellness, fetchActivities, fetchEvents } from './intervals.js';

export const RECENT_DAYS = 7;
export const WELLNESS_DAYS = 150;   // 12 weeks shown on Trends + 60 days for the normal band
export const LOAD_BACK_DAYS = 180;  // Fitness (42-day) needs a long run-in
export const PLAN_AHEAD_DAYS = 42;  // planned load and tests ahead, for the Form projection

export function todayIn(timeZone, now = new Date()) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
  catch { return now.toISOString().slice(0, 10); }
}

// Builds the per-day input for the rules from stored wellness rows and check-ins (the check-in wins where both exist).
export function mergeDays(wellnessRows, checkinRows) {
  const days = {};
  for (const w of wellnessRows) {
    days[w.day] = {
      hrv: w.hrv, restingHR: w.resting_hr, sleepSecs: w.sleep_secs,
      sleepQuality: w.sleep_quality, fatigue: w.fatigue, soreness: w.soreness, stress: w.stress, mood: w.mood
    };
  }
  for (const c of checkinRows) {
    const d = days[c.day] || (days[c.day] = {});
    for (const [k, col] of [['sleepQuality', 'sleep_quality'], ['fatigue', 'fatigue'], ['soreness', 'soreness'], ['stress', 'stress'], ['mood', 'mood']]) {
      if (c[col] !== null && c[col] !== undefined) d[k] = c[col];
    }
    if (c.sick) d.sick = c.sick;
  }
  return days;
}

/**
 * store: {
 *   checkins(userId, fromDay) -> rows,
 *   upsertWellness(rows), upsertStatus(rows), updateProfile(userId, patch)
 * }
 */
export async function syncUser({ userId, key, athleteId, timeZone, store, now = new Date() }) {
  const day = todayIn(timeZone || 'America/Edmonton', now);
  const oldest = addDays(day, -Math.max(WELLNESS_DAYS, HISTORY_DAYS + RECENT_DAYS + 2));
  const loadFrom = addDays(day, -LOAD_BACK_DAYS), planTo = addDays(day, PLAN_AHEAD_DAYS);
  try {
    const [wellness, acts, events] = await Promise.all([
      fetchWellness(key, athleteId, oldest, day),
      fetchActivities(key, athleteId, loadFrom, day).catch(() => null),
      fetchEvents(key, athleteId, loadFrom, planTo).catch(() => null)
    ]);
    if (wellness.length) await store.upsertWellness(wellness.map((w) => ({ ...w, user_id: userId, synced_at: new Date().toISOString() })));
    const checkins = await store.checkins(userId, oldest);
    const days = mergeDays(wellness, checkins);
    const rows = [];
    for (let i = RECENT_DAYS - 1; i >= 0; i--) {
      const d = addDays(day, -i);
      const load = i === 0 ? loadVsPlan(d, acts || [], events || []) : null;
      const info = evaluate(d, days, load);
      if (!info) continue;
      rows.push({
        user_id: userId, day: d, status: info.status, weekly: info.weekly, weekly_why: info.weeklyWhy || null,
        reasons: info.reasons, signals: info.signals, load: info.load, rules_version: RULES_VERSION,
        computed_at: new Date().toISOString()
      });
    }
    if (rows.length) await store.upsertStatus(rows);
    // Load page data: only replaced when both calls worked, so a hiccup never blanks the charts
    if (acts && events) {
      await store.replaceLoad(userId, loadFrom, planTo, dailyLoadRows(acts, events).filter((r) => r.day >= loadFrom && r.day <= planTo).map((r) => ({ ...r, user_id: userId })));
      await store.replaceTests(userId, plannedTests(events, addDays(day, -LOAD_BACK_DAYS)).map((t) => ({ ...t, user_id: userId })));
    }
    await store.updateProfile(userId, { last_sync: new Date().toISOString(), last_sync_error: null });
    const today = rows.find((r) => r.day === day) || null;
    return { ok: true, day, today, days: wellness.length, enoughHistory: rows.length > 0 };
  } catch (e) {
    await store.updateProfile(userId, { last_sync_error: String(e.message || e).slice(0, 300) });
    throw e;
  }
}
