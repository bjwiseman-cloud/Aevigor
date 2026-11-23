// Lifting log: sets, estimated 1-rep max, weekly volume, and CSV import from other lifting apps.
export type LiftSet = {
  id: string; day: string; exercise: string; set_no: number; reps: number; weight: number;
  rir: number | null; warmup: boolean; note: string | null; source: string; activity_id?: string | null;
};
export type NewSet = Omit<LiftSet, 'id'>;

export const LB = 0.45359237;
export type Unit = 'kg' | 'lb';
export const toKg = (w: number, u: Unit) => (u === 'lb' ? w * LB : w);
export const fromKg = (kg: number, u: Unit) => (u === 'lb' ? kg / LB : kg);
export const showW = (kg: number, u: Unit) => { const v = fromKg(kg, u); return `${Math.round(v * 10) / 10}`; };

// Epley: weight × (1 + reps ÷ 30). Only sets of 1-12 reps count; a single is the weight itself.
export function e1rm(weight: number, reps: number) {
  if (!weight || reps < 1 || reps > 12) return null;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export const work = (s: LiftSet) => !s.warmup && s.reps > 0;

// Best e1RM per day for one exercise, oldest first.
export function e1rmSeries(sets: LiftSet[], exercise: string) {
  const byDay = new Map<string, { day: string; e1rm: number; reps: number; weight: number }>();
  for (const s of sets) {
    if (s.exercise !== exercise || !work(s)) continue;
    const v = e1rm(s.weight, s.reps); if (v == null) continue;
    const cur = byDay.get(s.day);
    if (!cur || v > cur.e1rm) byDay.set(s.day, { day: s.day, e1rm: v, reps: s.reps, weight: s.weight });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Monday of the week, YYYY-MM-DD
export function weekOf(day: string) {
  const d = new Date(day + 'T12:00:00Z'); const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow); return d.toISOString().slice(0, 10);
}

// Volume load (sets × reps × kg) and hard sets per week; exercise null = all exercises.
export function weeklyVolume(sets: LiftSet[], exercise: string | null) {
  const m = new Map<string, { week: string; volume: number; sets: number }>();
  for (const s of sets) {
    if (exercise && s.exercise !== exercise) continue;
    if (!work(s)) continue;
    const w = weekOf(s.day), cur = m.get(w) ?? { week: w, volume: 0, sets: 0 };
    cur.volume += s.reps * s.weight; cur.sets += 1; m.set(w, cur);
  }
  return [...m.values()].sort((a, b) => a.week.localeCompare(b.week)).map((r) => ({ ...r, volume: Math.round(r.volume) }));
}

// Exercises by how often they were trained (most first).
export function exercises(sets: LiftSet[]) {
  const c = new Map<string, number>();
  for (const s of sets) c.set(s.exercise, (c.get(s.exercise) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e);
}

export const setKey = (s: Pick<LiftSet, 'day' | 'exercise' | 'set_no' | 'reps' | 'weight'>) =>
  `${s.day}|${s.exercise.toLowerCase()}|${s.set_no}|${s.reps}|${Math.round(s.weight * 10)}`;

// ---------- CSV import ----------
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  const delim = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = ''; if (row.some((c) => c.trim())) rows.push(row); row = [];
    } else cell += ch;
  }
  row.push(cell); if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function toDay(v: string): string | null {
  const t = v.trim();
  const iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const num = (v: string | undefined) => { if (v == null) return null; const x = parseFloat(v.replace(',', '.')); return Number.isFinite(x) ? x : null; };

export type ImportResult = { sets: NewSet[]; skipped: number; app: string; unitFound: boolean; error?: string };

// Finds the columns by their names, so exports from FitNotes, Strong, Hevy, Liftosaur and similar apps all work.
export function importCsv(text: string, fallbackUnit: Unit): ImportResult {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length < 2) return { sets: [], skipped: 0, app: '', unitFound: false, error: 'The file has no rows.' };
  const h = rows[0].map((x) => x.trim().toLowerCase());
  const find = (...tests: RegExp[]) => { for (const t of tests) { const i = h.findIndex((x) => t.test(x)); if (i >= 0) return i; } return -1; };
  const cDate = find(/^date$/, /start_time/, /workout date/, /date/, /time/);
  const cEx = find(/^exercise$/, /exercise name/, /exercise_title/, /exercise/);
  const cReps = find(/completed reps/, /^reps$/, /reps/);
  const cW = find(/^weight \(kg/, /^weight_kg$/, /^weight \(lb/, /^weight_lbs$/, /weight value/, /^weight$/, /weight/);
  const cUnit = find(/weight unit/, /^unit$/);
  const cRpe = find(/completed rpe/, /^rpe$/, /rpe/);
  const cRir = find(/^rir$/, /reps in reserve/);
  const cWarm = find(/warm/, /set_type/, /set type/);
  const cSet = find(/set order/, /set_index/, /^set$/);
  const cNote = find(/^notes?$/, /comment/);
  if (cDate < 0 || cEx < 0 || cReps < 0) return { sets: [], skipped: rows.length - 1, app: '', unitFound: false, error: 'Could not find the date, exercise and reps columns in this file.' };
  const headUnit: Unit | null = cW >= 0 ? (/lb/.test(h[cW]) ? 'lb' : /kg/.test(h[cW]) ? 'kg' : null) : null;
  const app = h.includes('category') ? 'FitNotes' : h.includes('workout name') ? 'Strong' : h.includes('exercise_title') ? 'Hevy' : h.some((x) => /is warmup/.test(x)) ? 'Liftosaur' : 'CSV';
  const out: NewSet[] = []; let skipped = 0; const counter = new Map<string, number>();
  for (const r of rows.slice(1)) {
    const day = toDay(r[cDate] ?? ''), exercise = (r[cEx] ?? '').trim().slice(0, 80), reps = num(r[cReps]);
    if (!day || !exercise || reps == null) { skipped++; continue; }
    const rowUnit: Unit = cUnit >= 0 && /lb/i.test(r[cUnit] ?? '') ? 'lb' : cUnit >= 0 && /kg/i.test(r[cUnit] ?? '') ? 'kg' : headUnit ?? fallbackUnit;
    const w = cW >= 0 ? num(r[cW]) ?? 0 : 0;
    const k = `${day}|${exercise}`, sv = cSet >= 0 ? num(r[cSet]) : null;
    const n = sv != null ? Math.max(1, Math.round(sv) + (h[cSet] === 'set_index' ? 1 : 0)) : (counter.get(k) ?? 0) + 1;
    counter.set(k, Math.max(counter.get(k) ?? 0, n));
    const rpe = cRpe >= 0 ? num(r[cRpe]) : null, rir = cRir >= 0 ? num(r[cRir]) : null;
    const warmTxt = cWarm >= 0 ? (r[cWarm] ?? '').trim().toLowerCase() : '';
    out.push({
      day, exercise, set_no: Math.min(100, n), reps: Math.max(0, Math.min(1000, Math.round(reps))),
      weight: Math.max(0, Math.round(toKg(w, rowUnit) * 100) / 100),
      rir: rir != null ? Math.min(10, Math.max(0, rir)) : rpe != null && rpe >= 1 && rpe <= 10 ? Math.min(10, Math.max(0, 10 - rpe)) : null,
      warmup: warmTxt === 'true' || warmTxt === 'yes' || warmTxt === '1' || warmTxt === 'warmup' || warmTxt === 'w',
      note: cNote >= 0 ? (r[cNote] ?? '').trim().slice(0, 200) || null : null,
      source: app.toLowerCase().slice(0, 20)
    });
  }
  return { sets: out, skipped, app, unitFound: headUnit != null || cUnit >= 0 };
}

// ---------- Main lifts and heaviest actual lifts (Ben 2026-11-23) ----------
// Squat, Bench and Deadlift found by name in the person's own log. Variations (front squat, incline bench,
// Romanian deadlift…) are not counted as the main lift; they still show as their own exercises.
export const MAIN_LIFTS = [
  { key: 'squat', label: 'Squat', re: /squat/i, avoid: /front|goblet|split|hack|bulgarian|jump|overhead|pistol|smith|box|zercher|belt|sissy|leg press/i },
  { key: 'bench', label: 'Bench', re: /bench/i, avoid: /incline|decline|dumbbell|\bdb\b|close|machine|smith|floor|board|pin|spoto|dip|step|jump/i },
  { key: 'deadlift', label: 'Deadlift', re: /deadlift|^dl$/i, avoid: /romanian|rdl|stiff|single|one.?leg|trap|hex|deficit|rack|block|snatch|dumbbell|\bdb\b|kettlebell|kb/i }
] as const;
export type MainKey = (typeof MAIN_LIFTS)[number]['key'];

/** The exercise name used for each main lift (most often logged match), or null if none logged. */
export function mainLiftNames(sets: LiftSet[]): Record<MainKey, string | null> {
  const list = exercises(sets.filter(work));
  const out = {} as Record<MainKey, string | null>;
  for (const m of MAIN_LIFTS) out[m.key] = list.find((e) => m.re.test(e) && !m.avoid.test(e)) ?? null;
  return out;
}

/** Heaviest weight actually lifted (any working set of 1 rep or more), per exercise. */
export function heaviest(sets: LiftSet[]) {
  const m = new Map<string, { exercise: string; weight: number; reps: number; day: string }>();
  for (const s of sets) {
    if (!work(s) || !s.weight) continue;
    const cur = m.get(s.exercise);
    // Heavier wins; at the same weight, more reps, then the earliest day (when the best was first set)
    if (!cur || s.weight > cur.weight || (s.weight === cur.weight && (s.reps > cur.reps || (s.reps === cur.reps && s.day < cur.day))))
      m.set(s.exercise, { exercise: s.exercise, weight: s.weight, reps: s.reps, day: s.day });
  }
  return m;
}
