// "Photo of my log": turns the text read from a photo of a workout log (app screenshot, notebook, whiteboard)
// into exercises and sets for the person to check before saving. Pure functions, no imports, so tests can run it.
//
// Understands lines such as:
//   Back squat               (an exercise name on its own line; the sets follow)
//   100 x 5, 105 x 5         (weight x reps, several sets on one line)
//   100kg x 5 x 3            (weight x reps x sets)
//   3x5 @ 100  /  3x5 100kg  (sets x reps at weight)
//   Bench 80 x 8 RIR 2       (name and sets on one line, reps in reserve)
//   5 reps 100 kg            (reps then weight)
//   WEIGHT  REPS             (a column header, as in Liftosaur, Strong or Hevy screenshots;
//   100     10                the rows under it are weight then reps, in that column order)

export type ReadSet = { kg: string; reps: string; rir: string };
export type ReadLift = { name: string; sets: ReadSet[]; matched: boolean };

const NUM = '(\\d{1,3}(?:[.,]\\d{1,2})?)';
const UNIT = '\\s*(kg|kgs|lb|lbs)?';
const X = '\\s*[x×*]\\s*';

function clean(line: string) {
  return line.replace(/[×✕]/g, 'x').replace(/(\d)\s*[xX]\s*(?=\d)/g, '$1 x ').replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim();
}
const n = (s: string) => Number(s.replace(',', '.'));
const fmt = (v: number) => String(Math.round(v * 100) / 100);

// Sets found in one line of text, weights converted to the person's unit when the line names the other one
export function readSets(line: string, unit: 'kg' | 'lb' = 'kg'): ReadSet[] {
  const t = clean(line).toLowerCase();
  const rirM = t.match(/rir\s*(\d)/) ?? t.match(/(\d)\s*rir/);
  const rir = rirM ? rirM[1] : '';
  const body = rirM ? t.replace(rirM[0], ' ').replace(/@\s*$/, ' ') : t;
  const conv = (w: number, u?: string) => {
    if (!u) return w;
    const lb = u.startsWith('lb');
    if (lb && unit === 'kg') return w / 2.20462;
    if (!lb && unit === 'lb') return w * 2.20462;
    return w;
  };
  const out: ReadSet[] = [];
  const push = (w: number | null, reps: number, count = 1) => {
    if (!(reps >= 1 && reps <= 50) || count < 1 || count > 12) return;
    for (let i = 0; i < count; i++) out.push({ kg: w === null ? '' : fmt(w), reps: String(reps), rir });
  };
  let m: RegExpExecArray | null;
  // sets x reps @ weight, or sets x reps weight + unit
  const sxr = new RegExp(`\\b(\\d{1,2})${X}(\\d{1,2})\\s*(?:@|at)\\s*${NUM}${UNIT}|\\b(\\d{1,2})${X}(\\d{1,2})\\s+${NUM}${UNIT.replace('?', '')}`, 'g');
  let rest = body;
  while ((m = sxr.exec(body))) {
    if (m[1]) push(conv(n(m[3]), m[4]), Number(m[2]), Number(m[1]));
    else push(conv(n(m[7]), m[8]), Number(m[6]), Number(m[5]));
    rest = rest.replace(m[0], ' ');
  }
  const afterSxr = rest;
  // weight x reps (x sets)
  const wxr = new RegExp(`${NUM}${UNIT}${X}(\\d{1,2})(?:${X}(\\d{1,2}))?`, 'g');
  while ((m = wxr.exec(afterSxr))) {
    const a = n(m[1]), u = m[2], b = Number(m[3]), c = m[4] ? Number(m[4]) : 0;
    // "3 x 5" with no unit and small numbers is sets x reps with no weight written
    if (!u && !c && a <= 10 && Number.isInteger(a) && b <= 20) push(null, b, a);
    else push(conv(a, u), b, c || 1);
    rest = rest.replace(m[0], ' ');
  }
  const afterWxr = rest;
  // "5 reps 100 kg" or "100 kg 5 reps"
  const rw = new RegExp(`(\\d{1,2})\\s*reps?\\s*${NUM}${UNIT}|${NUM}${UNIT}\\s*(?:for\\s*)?(\\d{1,2})\\s*reps?`, 'g');
  while ((m = rw.exec(afterWxr))) {
    if (m[1]) push(conv(n(m[2]), m[3]), Number(m[1]));
    else push(conv(n(m[4]), m[5]), Number(m[6]));
  }
  return out;
}

// The words before the first number, if they look like an exercise name. Icons read as short junk at the end of
// the line ("Machine Flye BD", "Press mE") are dropped.
const SKIP = /^(sets?|reps?|rir|rpe|kg|lbs?|weight|warm ?up|notes?|total|volume|rest|date|time|workout|week|day|log)$/i;
const MUSCLE_TAG = /^(chest|back|shoulders?|biceps|triceps|forearms?|hamstrings|quads?|glutes|calves|abs|core|legs|arms|lats|traps|upper|lower|full|body|cardio)$/i;
const EQUIPMENT = /^(machine|cable|barbell|dumbbells?|kettlebell|bodyweight|band|smith( machine)?|ez bar|plate loaded|trap bar|other)$/i;
function nameOf(line: string) {
  const c = clean(line).replace(/^\s*(?:\d{1,2}[.)]|[-•*])\s+/, '');
  let head = c.split(/\d/)[0].replace(/[:\-–@]+\s*$/, '').trim();
  const toks = head.split(/\s+/);
  while (toks.length > 1 && /^(?:[^A-Za-z]+|[A-Za-z]{1,2}|[A-Z]{2,3}[^a-z\s]*|\W.*)$/.test(toks[toks.length - 1]) && !/^\(.+\)$/.test(toks[toks.length - 1])) toks.pop();
  head = toks.join(' ').replace(/[^A-Za-z)]+$/, '').trim();
  const letters = head.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 3) return '';
  const words = head.replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).filter((w) => w.length > 1);
  if (SKIP.test(head) || words.every((w) => SKIP.test(w) || /^(log|info)$/i.test(w))) return '';
  if (words.length && words.every((w) => MUSCLE_TAG.test(w))) return '';
  if (EQUIPMENT.test(head)) return '';
  return head.replace(/\s+/g, ' ');
}

// A column header such as "WEIGHT REPS LOG" or "Set  Reps  kg": which column comes first
function header(line: string): 'wr' | 'rw' | null {
  const t = line.toLowerCase();
  const w = t.search(/\b(weight|kg|lbs?)\b/), r = t.search(/\breps?\b/);
  if (w < 0 || r < 0 || /\d{2,}/.test(t)) return null;
  return w < r ? 'wr' : 'rw';
}
// A table row under that header: the first two numbers on a line with almost no words (icons read as 1-3 letters)
function columnRow(line: string, order: 'wr' | 'rw'): { w: number; r: number } | null {
  const m = clean(line).match(/^[^A-Za-z0-9]*(\d{1,4}(?:[.,]\d{1,2})?)\s+(\d{1,4}(?:[.,]\d{1,2})?)(?:\s|$)/);
  if (!m) return null;
  const rest = clean(line).slice(m[0].length);
  if (/[A-Za-z]{4,}/.test(rest)) return null;
  const a = n(m[1]), b = n(m[2]);
  const [w, r] = order === 'wr' ? [a, b] : [b, a];
  return Number.isInteger(r) && r >= 1 && r <= 50 ? { w, r } : null;
}

const ALIAS: Record<string, string> = {
  squat: 'barbell squat', 'back squat': 'barbell squat', bench: 'barbell bench press', 'bench press': 'barbell bench press',
  deadlift: 'barbell deadlift', ohp: 'standing military press', 'overhead press': 'standing military press', rdl: 'romanian deadlift',
  'pull up': 'pullups', 'pull ups': 'pullups', 'chin up': 'chin-up', 'chin ups': 'chin-up', row: 'bent over barbell row', 'barbell row': 'bent over barbell row'
};
const WORD: Record<string, string> = { db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ez', curls: 'curl', ohp: 'press' };
const words = (s: string) => [...new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1).map((w) => WORD[w] ?? w.replace(/s$/, '')))];

// Best match in the exercise list (word overlap), or null when nothing is close enough
export function matchExercise(text: string, names: string[]): string | null {
  const key = text.toLowerCase().trim();
  const target = ALIAS[key] ?? key;
  const tw = words(target);
  if (!tw.length) return null;
  let best: string | null = null, score = 0;
  for (const nm of names) {
    const nw = words(nm);
    const hit = tw.filter((w) => nw.includes(w)).length;
    // Every word read is in the name (a shorter way of writing it) counts extra
    const s = hit / Math.max(tw.length, nw.length) + (hit === tw.length ? 0.1 : 0) + (nm.toLowerCase() === target ? 1 : 0);
    if (hit && s > score) { score = s; best = nm; }
  }
  // Close enough only when most words agree; otherwise the name as read is kept for the person to check
  return score >= 0.7 ? best : null;
}

export function parseLog(text: string, names: string[], unit: 'kg' | 'lb' = 'kg'): ReadLift[] {
  const lifts: ReadLift[] = [];
  let cur: ReadLift | null = null;
  let cols: 'wr' | 'rw' | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h = header(line);
    if (h) { cols = h; continue; }
    const row = cols ? columnRow(line, cols) : null;
    if (row) {
      if (!cur) { cur = { name: 'Exercise', sets: [], matched: false }; lifts.push(cur); }
      cur.sets.push({ kg: fmt(row.w), reps: String(row.r), rir: '' });
      continue;
    }
    const sets = readSets(line, unit);
    const nm = nameOf(line);
    // "(Standing)" on the line under "Barbell Shoulder Press" belongs to that name
    if (nm && cur && !cur.sets.length && /^\(/.test(nm)) {
      const full = `${cur.name} ${nm}`;
      const m = matchExercise(full, names);
      cur.name = m ?? full; cur.matched = !!m || cur.matched;
      continue;
    }
    if (nm && (sets.length || !/\d/.test(line) || nm.length >= 4)) {
      const m = matchExercise(nm, names);
      cur = { name: m ?? nm.replace(/\b\w/g, (c) => c.toUpperCase()), sets: [], matched: !!m };
      lifts.push(cur);
      cols = null;
    }
    if (sets.length) {
      if (!cur) { cur = { name: 'Exercise', sets: [], matched: false }; lifts.push(cur); }
      cur.sets.push(...sets);
    }
  }
  // The reader often drops one "1" from "11" ("115" read as "15"). Within one exercise, a weight that is another
  // set's weight minus its leading 1 is taken to be that weight.
  for (const l of lifts) {
    const count = (kg: string) => l.sets.filter((y) => y.kg === kg).length;
    for (const x of l.sets) if (x.kg && count('1' + x.kg) >= count(x.kg)) x.kg = '1' + x.kg;
  }
  return lifts.filter((l) => l.sets.length);
}
