// Cycle tracking (opt-in, log only). Phases are ESTIMATES from the person's own logged period days:
// day 1 = first period day; Menstrual = logged period days (or 5); Ovulatory (estimated) = 2 days around
// cycle length minus 14; Follicular before it; Luteal after. No fertility, ovulation or pregnancy predictions are shown.
import { addDays } from '@rules';

export type CycleDay = { day: string; period: boolean; flow: string | null; symptoms: string[]; note: string | null };
export type CycleSettings = { tracking: boolean; life_stage: string; contraception: string | null; hormonal: boolean | null };
export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal';

export const PHASES: Record<Phase, { label: string; color: string }> = {
  menstrual: { label: 'Menstrual', color: '#f4a6b8' },
  follicular: { label: 'Follicular', color: '#9ad0f5' },
  ovulatory: { label: 'Ovulatory (estimated)', color: '#c9b3f2' },
  luteal: { label: 'Luteal', color: '#f8c99b' }
};
export const LIFE_STAGES: [string, string][] = [['regular', 'Regular cycles'], ['irregular', 'Irregular cycles'], ['pregnant', 'Pregnant'], ['postpartum', 'Postpartum'], ['perimenopause', 'Perimenopause'], ['menopause', 'Menopause']];
export const FLOWS = ['spotting', 'light', 'medium', 'heavy'] as const;
export const SYMPTOMS = ['Cramps', 'Headache', 'Bloating', 'Breast tenderness', 'Low energy', 'Mood changes', 'Back pain', 'Acne', 'Cravings', 'Poor sleep'];
export const MENO_SYMPTOMS = ['Hot flashes', 'Night sweats', 'Sleep disruption'];
// Phases only make sense while cycling
export const showsPhases = (s: CycleSettings | null | undefined) => !!s?.tracking && (s.life_stage === 'regular' || s.life_stage === 'irregular' || s.life_stage === 'perimenopause');

const diff = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);

// First day of each period: a period day with no period day in the 7 days before it
export function cycleStarts(days: CycleDay[]) {
  const per = days.filter((d) => d.period).map((d) => d.day).sort();
  return per.filter((d, i) => i === 0 || diff(per[i - 1], d) > 7);
}
// Average of the last 6 cycle lengths (21-45 days only), else 28
export function cycleLength(starts: string[]) {
  const ls = starts.slice(1).map((s, i) => diff(starts[i], s)).filter((n) => n >= 21 && n <= 45).slice(-6);
  return ls.length ? Math.round(ls.reduce((a, b) => a + b, 0) / ls.length) : 28;
}
export function phaseOn(day: string, days: CycleDay[]): { phase: Phase; cycleDay: number } | null {
  const starts = cycleStarts(days);
  const start = [...starts].reverse().find((s) => s <= day);
  if (!start) return null;
  const len = cycleLength(starts);
  const cd = diff(start, day) + 1;
  if (cd > len + 14) return null; // too long since the last logged period to estimate
  const logged = days.filter((d) => d.period && d.day >= start && diff(start, d.day) < 10).length;
  const periodLen = logged >= 3 ? logged : 5;
  const ov = len - 14;
  const phase: Phase = cd <= periodLen ? 'menstrual' : cd < ov ? 'follicular' : cd <= ov + 1 ? 'ovulatory' : 'luteal';
  return { phase, cycleDay: cd };
}
// Runs of the same phase between two days, for shading behind charts
export function phaseRuns(from: string, to: string, days: CycleDay[]) {
  const out: { x1: string; x2: string; phase: Phase }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const p = phaseOn(d, days)?.phase;
    const last = out.at(-1);
    if (p && last && last.phase === p && addDays(last.x2, 1) === d) last.x2 = d;
    else if (p) out.push({ x1: d, x2: d, phase: p });
  }
  return out;
}
