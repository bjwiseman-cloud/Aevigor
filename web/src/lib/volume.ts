// Weekly hard sets per muscle against volume landmarks (concept from Renaissance Periodization, Israetel et al.):
// MV maintenance, MEV minimum effective, MAV adaptive range, MRV maximum recoverable. Defaults are RP's published
// typical numbers (sets per week); muscles without published numbers stay blank until the person sets them.
// Neutral wording only: this shows where the logged sets fall, it does not advise.
import { addDays } from '@rules';
import type { LiftSet } from '@/lib/lifting';
import type { MuscleKey } from '@/lib/muscles';

export type Landmark = { mv: number; mev: number; mavLo: number; mavHi: number; mrv: number };
export const DEFAULT_LANDMARKS: Partial<Record<MuscleKey, Landmark>> = {
  chest: { mv: 8, mev: 10, mavLo: 12, mavHi: 20, mrv: 22 },
  lats: { mv: 8, mev: 10, mavLo: 14, mavHi: 22, mrv: 25 },
  traps: { mv: 0, mev: 0, mavLo: 12, mavHi: 20, mrv: 26 },
  frontDelts: { mv: 0, mev: 0, mavLo: 6, mavHi: 8, mrv: 12 },
  sideDelts: { mv: 0, mev: 8, mavLo: 16, mavHi: 22, mrv: 26 },
  rearDelts: { mv: 0, mev: 8, mavLo: 16, mavHi: 22, mrv: 26 },
  biceps: { mv: 5, mev: 8, mavLo: 14, mavHi: 20, mrv: 26 },
  triceps: { mv: 4, mev: 6, mavLo: 10, mavHi: 14, mrv: 18 },
  wristFlexors: { mv: 0, mev: 2, mavLo: 10, mavHi: 12, mrv: 25 },
  wristExtensors: { mv: 0, mev: 2, mavLo: 10, mavHi: 12, mrv: 25 },
  abs: { mv: 0, mev: 0, mavLo: 16, mavHi: 20, mrv: 25 },
  quads: { mv: 6, mev: 8, mavLo: 12, mavHi: 18, mrv: 20 },
  hamstrings: { mv: 4, mev: 6, mavLo: 10, mavHi: 16, mrv: 20 },
  glutes: { mv: 0, mev: 0, mavLo: 4, mavHi: 12, mrv: 16 },
  calves: { mv: 6, mev: 8, mavLo: 12, mavHi: 16, mrv: 20 }
};
export const LANDMARK_KEY = 'volume_landmarks';

// A hard set: not a warm-up and 0-4 reps in reserve (no RIR logged counts as hard). Primary muscle 1, secondary 0.5.
export function hardSets(sets: LiftSet[], muscles: (name: string) => { m: MuscleKey[]; s: MuscleKey[] } | null, from: string, to: string) {
  const out: Partial<Record<MuscleKey, number>> = {};
  for (const x of sets) {
    if (x.warmup || x.day < from || x.day > to || (x.rir != null && x.rir > 4)) continue;
    const mm = muscles(x.exercise);
    if (!mm) continue;
    for (const k of mm.m) out[k] = (out[k] ?? 0) + 1;
    for (const k of mm.s) out[k] = (out[k] ?? 0) + 0.5;
  }
  return out;
}
// 0 = no colour (below MV or nothing), 1 MV-MEV, 2 MEV-MAV, 3 within MAV up to MRV, 4 at or over MRV
export function volumeLevel(n: number | undefined, l: Landmark | undefined) {
  if (!n || !l) return 0;
  if (n >= l.mrv) return 4;
  if (n >= l.mavLo) return 3;
  if (n >= l.mev) return 2;
  if (n >= l.mv) return 1;
  return 0;
}
export const weekStart = (day: string) => { const d = new Date(day + 'T12:00:00Z'); return addDays(day, -((d.getUTCDay() + 6) % 7)); };
