// Plan tab helpers: repeat rules, plain-English summaries and today's reminders.
// Repeats are stored as iCal RRULE strings (RFC 5545) so the same rule can drive reminders and calendar sync.
// Two extras that RRULE cannot express are stored in our own small format:
//   'AS_NEEDED'                       no schedule, no reminder
//   'CYCLE;ON=5;OFF=2;UNIT=DAY'       5 days on, 2 off, repeating (UNIT=WEEK for weeks)
import { RRule, Weekday } from 'rrule';

export type Category = 'supplement' | 'hormone' | 'peptide' | 'medication' | 'meal';
export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'supplement', label: 'Supplements', icon: '💊' },
  { id: 'hormone', label: 'Hormones', icon: '⚗️' },
  { id: 'peptide', label: 'Peptides', icon: '💉' },
  { id: 'medication', label: 'Medications', icon: '℞' },
  { id: 'meal', label: 'Meal timing', icon: '🍽' }
];

export type LogItem = {
  id: string; category: Category; name: string; strength: string | null; form: string | null;
  amount: number | null; unit: string | null; rrule: string; times: string[]; start_date: string; end_date: string | null;
  notes: string | null; reminder: boolean; group_id: string | null; active: boolean;
};
export type LogGroup = { id: string; name: string; rrule: string; times: string[]; reminder: boolean };
export type LogDose = { id: string; item_id: string; day: string; slot: string; status: 'taken' | 'skipped' };
export type EventKind = 'medical' | 'lab' | 'fitness_test' | 'race' | 'physio' | 'other' | 'training' | 'social'
  | 'dental' | 'finance' | 'work' | 'car' | 'home' | 'personal' | 'family' | 'pet' | 'legal' | 'errand';
/** Appointment kinds kept with the private health log (need the health opt-in). */
export const HEALTH_KINDS: EventKind[] = ['medical', 'dental', 'lab', 'physio', 'other'];
export type PlanEvent = {
  id: string; kind: EventKind; title: string; starts_at: string; location: string | null; description: string | null;
  prep_notes: string | null; remind_minutes: number[]; rrule: string | null; on_external_calendars: boolean; sport?: string | null;
};
export const EVENT_KINDS: { id: EventKind; label: string; icon: string }[] = [
  { id: 'medical', label: 'Doctor / medical', icon: '🩺' },
  { id: 'lab', label: 'Lab or blood test', icon: '🩸' },
  { id: 'fitness_test', label: 'Fitness test', icon: '⏱' },
  { id: 'race', label: 'Race or event', icon: '🏁' },
  { id: 'physio', label: 'Physio / massage', icon: '🤲' },
  { id: 'other', label: 'Other health', icon: '📌' },
  { id: 'dental', label: 'Dentist', icon: '🦷' },
  { id: 'finance', label: 'Bank / financial', icon: '🏦' },
  { id: 'work', label: 'Work / meeting', icon: '💼' },
  { id: 'car', label: 'Car service', icon: '🚗' },
  { id: 'home', label: 'Home / repairs', icon: '🏠' },
  { id: 'personal', label: 'Haircut / personal care', icon: '💇' },
  { id: 'family', label: 'School / kids / family', icon: '👨‍👩‍👧' },
  { id: 'pet', label: 'Vet / pet', icon: '🐾' },
  { id: 'legal', label: 'Legal / government', icon: '⚖️' },
  { id: 'errand', label: 'Other', icon: '🗓️' },
  { id: 'training', label: 'Training', icon: '🚴' },
  { id: 'social', label: 'Social', icon: '🎉' }
];

// ---------- Repeat model used by the chips ----------
export type Repeat =
  | { kind: 'daily' }
  | { kind: 'days'; days: number[] }                    // 0 = Monday … 6 = Sunday
  | { kind: 'every'; n: number; unit: 'day' | 'week' }
  | { kind: 'cycle'; on: number; off: number; unit: 'day' | 'week' }
  | { kind: 'monthly'; mode: 'date' | 'nth' }           // same date each month, or e.g. 1st Monday (from the start date)
  | { kind: 'asneeded' };
export type Ends = { kind: 'never' } | { kind: 'date'; date: string } | { kind: 'count'; n: number };

const WD: Weekday[] = [RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU];
export const DAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAME = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function utcDate(day: string) { return new Date(day + 'T00:00:00Z'); }
function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
export function addDaysIso(day: string, n: number) { const d = utcDate(day); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }
function dayDiff(a: string, b: string) { return Math.round((utcDate(b).getTime() - utcDate(a).getTime()) / 864e5); }
function weekdayIdx(day: string) { return (utcDate(day).getUTCDay() + 6) % 7; }

export function buildRule(r: Repeat, ends: Ends, start: string): string {
  if (r.kind === 'asneeded') return 'AS_NEEDED';
  if (r.kind === 'cycle') return `CYCLE;ON=${r.on};OFF=${r.off};UNIT=${r.unit.toUpperCase()}` + (ends.kind === 'count' ? `;COUNT=${ends.n}` : '');
  const opt: Partial<ConstructorParameters<typeof RRule>[0]> = {};
  if (r.kind === 'daily') opt.freq = RRule.DAILY;
  if (r.kind === 'days') { opt.freq = RRule.WEEKLY; opt.byweekday = r.days.map((d) => WD[d]); }
  if (r.kind === 'every') { opt.freq = r.unit === 'day' ? RRule.DAILY : RRule.WEEKLY; opt.interval = r.n; }
  if (r.kind === 'monthly') {
    opt.freq = RRule.MONTHLY;
    const d = utcDate(start);
    if (r.mode === 'date') opt.bymonthday = d.getUTCDate();
    else opt.byweekday = [WD[weekdayIdx(start)].nth(Math.ceil(d.getUTCDate() / 7))];
  }
  if (ends.kind === 'count') opt.count = ends.n;
  if (ends.kind === 'date') opt.until = new Date(ends.date + 'T23:59:59Z');
  return RRule.optionsToString(opt).replace(/^RRULE:/, '');
}

export function parseRule(rule: string, start: string): { repeat: Repeat; ends: Ends } {
  if (rule === 'AS_NEEDED') return { repeat: { kind: 'asneeded' }, ends: { kind: 'never' } };
  const cyc = /^CYCLE;ON=(\d+);OFF=(\d+);UNIT=(DAY|WEEK)(?:;COUNT=(\d+))?$/.exec(rule);
  if (cyc) return { repeat: { kind: 'cycle', on: +cyc[1], off: +cyc[2], unit: cyc[3] === 'DAY' ? 'day' : 'week' }, ends: cyc[4] ? { kind: 'count', n: +cyc[4] } : { kind: 'never' } };
  try {
    const o = RRule.parseString(rule);
    const ends: Ends = o.count ? { kind: 'count', n: o.count } : o.until ? { kind: 'date', date: isoDay(o.until) } : { kind: 'never' };
    const byday = (o.byweekday ? (Array.isArray(o.byweekday) ? o.byweekday : [o.byweekday]) : []) as (Weekday | number)[];
    const idx = byday.map((w) => (typeof w === 'number' ? w : w.weekday));
    if (o.freq === RRule.MONTHLY) return { repeat: { kind: 'monthly', mode: o.bymonthday ? 'date' : 'nth' }, ends };
    if (o.freq === RRule.WEEKLY && idx.length) return { repeat: { kind: 'days', days: idx }, ends };
    if ((o.interval ?? 1) > 1) return { repeat: { kind: 'every', n: o.interval!, unit: o.freq === RRule.WEEKLY ? 'week' : 'day' }, ends };
    if (o.freq === RRule.WEEKLY) return { repeat: { kind: 'days', days: [weekdayIdx(start)] }, ends };
    return { repeat: { kind: 'daily' }, ends };
  } catch {
    return { repeat: { kind: 'daily' }, ends: { kind: 'never' } };
  }
}

// Does a rule fall on this day? (dates are plain calendar days in the person's time zone)
export function occursOn(rule: string, start: string, day: string, end?: string | null): boolean {
  if (day < start || (end && day > end) || rule === 'AS_NEEDED') return false;
  const cyc = /^CYCLE;ON=(\d+);OFF=(\d+);UNIT=(DAY|WEEK)(?:;COUNT=(\d+))?$/.exec(rule);
  if (cyc) {
    const unit = cyc[3] === 'DAY' ? 1 : 7, on = +cyc[1] * unit, off = +cyc[2] * unit, k = dayDiff(start, day);
    if (cyc[4] && Math.floor(k / (on + off)) * +cyc[1] + Math.min(k % (on + off), on) >= +cyc[4] * unit) return false;
    return k % (on + off) < on;
  }
  try {
    const r = new RRule({ ...RRule.parseString(rule), dtstart: utcDate(start) });
    return r.between(utcDate(day), new Date(utcDate(day).getTime() + 864e5 - 1), true).length > 0;
  } catch { return false; }
}

const ord = (n: number) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
export function niceTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h, m)).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}
export function shortDate(day: string) {
  return utcDate(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: day.slice(0, 4) === String(new Date().getFullYear()) ? undefined : 'numeric', timeZone: 'UTC' });
}

// One plain line, e.g. "Every Mon and Thu at 8:00 AM, until Mar 1"
export function describe(r: Repeat, ends: Ends, times: string[], start: string): string {
  const at = times.length ? ' at ' + times.map(niceTime).join(' and ') : '';
  let s = '';
  if (r.kind === 'asneeded') return 'As needed, no reminder';
  if (r.kind === 'daily') s = 'Every day';
  if (r.kind === 'days') s = r.days.length === 7 ? 'Every day' : r.days.length ? 'Every ' + [...r.days].sort().map((d) => DAY_NAME[d]).join(', ').replace(/, ([^,]*)$/, ' and $1') : 'Pick at least one day';
  if (r.kind === 'every') s = `Every ${r.n} ${r.unit}${r.n === 1 ? '' : 's'}`;
  if (r.kind === 'cycle') s = `${r.on} ${r.unit}${r.on === 1 ? '' : 's'} on, ${r.off} off, repeating`;
  if (r.kind === 'monthly') {
    const d = utcDate(start);
    s = r.mode === 'date' ? `Every month on the ${ord(d.getUTCDate())}` : `Every month on the ${ord(Math.ceil(d.getUTCDate() / 7))} ${DAY_NAME[weekdayIdx(start)]}`;
  }
  const e = ends.kind === 'date' ? `, until ${shortDate(ends.date)}` : ends.kind === 'count' ? `, ${ends.n} times` : '';
  return s + at + e;
}

// ---------- Today's reminders ----------
export type Slot = {
  key: string; time: string; title: string; kind: 'log' | 'event';
  items: LogItem[]; event?: PlanEvent; done: boolean; taken: number; skipped: number;
};

export function amountText(i: LogItem) {
  const a = i.amount != null ? `${i.amount}${i.unit ? ' ' + i.unit : ''}` : i.strength ?? '';
  return a ? `${i.name} · ${a}` : i.name;
}

export function slotsForDay(day: string, items: LogItem[], groups: LogGroup[], doses: LogDose[], events: PlanEvent[], timeZone: string): Slot[] {
  const out: Slot[] = [];
  const mark = (its: LogItem[], time: string) => {
    let taken = 0, skipped = 0;
    for (const it of its) {
      const d = doses.find((x) => x.item_id === it.id && x.day === day && x.slot === time);
      if (d?.status === 'taken') taken++; else if (d?.status === 'skipped') skipped++;
    }
    return { taken, skipped, done: its.length > 0 && taken + skipped === its.length };
  };
  const live = items.filter((i) => i.active && i.rrule !== 'AS_NEEDED');
  for (const g of groups) {
    const its = live.filter((i) => i.group_id === g.id && (!i.end_date || day <= i.end_date) && day >= i.start_date);
    if (!its.length || !occursOn(g.rrule, its.reduce((a, b) => (a < b.start_date ? a : b.start_date), its[0].start_date), day)) continue;
    for (const t of g.times) out.push({ key: `g:${g.id}:${t}`, time: t, title: g.name, kind: 'log', items: its, ...mark(its, t) });
  }
  for (const i of live.filter((x) => !x.group_id || !groups.some((g) => g.id === x.group_id))) {
    if (!occursOn(i.rrule, i.start_date, day, i.end_date)) continue;
    for (const t of i.times) out.push({ key: `i:${i.id}:${t}`, time: t, title: i.name, kind: 'log', items: [i], ...mark([i], t) });
  }
  for (const e of events) {
    const local = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(e.starts_at));
    const get = (t: string) => local.find((p) => p.type === t)?.value ?? '';
    const eday = `${get('year')}-${get('month')}-${get('day')}`, etime = `${get('hour').replace('24', '00')}:${get('minute')}`;
    if (eday === day) out.push({ key: `e:${e.id}`, time: etime, title: e.title, kind: 'event', items: [], event: e, done: false, taken: 0, skipped: 0 });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function nowHHMM(timeZone: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace('24:', '00:');
}
