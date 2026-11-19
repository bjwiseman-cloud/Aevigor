// The 20 muscles of the body map (same set as Garmin's muscle map), the joints for joint pain, and their groups.
// Keys are saved in check-ins and Post Activity logs, so do not rename them.
export type MuscleKey =
  | 'neck' | 'traps' | 'lats' | 'lowerBack' | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'chest' | 'abs'
  | 'biceps' | 'triceps' | 'wristFlexors' | 'wristExtensors' | 'glutes' | 'hamstrings' | 'quads'
  | 'adductors' | 'abductors' | 'calves' | 'shins';

export const MUSCLES: { k: MuscleKey; label: string; group: string }[] = [
  { k: 'chest', label: 'Chest', group: 'Chest' },
  { k: 'lats', label: 'Lats', group: 'Back' }, { k: 'traps', label: 'Traps', group: 'Back' }, { k: 'lowerBack', label: 'Lower back', group: 'Back' },
  { k: 'frontDelts', label: 'Front delts', group: 'Shoulders' }, { k: 'sideDelts', label: 'Side delts', group: 'Shoulders' }, { k: 'rearDelts', label: 'Rear delts', group: 'Shoulders' },
  { k: 'biceps', label: 'Biceps', group: 'Arms' }, { k: 'triceps', label: 'Triceps', group: 'Arms' },
  { k: 'wristFlexors', label: 'Wrist flexors', group: 'Arms' }, { k: 'wristExtensors', label: 'Wrist extensors', group: 'Arms' },
  { k: 'abs', label: 'Abdominals', group: 'Core' },
  { k: 'quads', label: 'Quadriceps', group: 'Legs' }, { k: 'hamstrings', label: 'Hamstrings', group: 'Legs' }, { k: 'glutes', label: 'Glutes', group: 'Legs' },
  { k: 'adductors', label: 'Hip adductors', group: 'Legs' }, { k: 'abductors', label: 'Hip abductors', group: 'Legs' },
  { k: 'calves', label: 'Calves', group: 'Legs' }, { k: 'shins', label: 'Shins', group: 'Legs' },
  { k: 'neck', label: 'Neck', group: 'Neck' }
];
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Neck'];
export const muscleLabel = (k: string) => MUSCLES.find((m) => m.k === k)?.label ?? LEGACY_LABELS[k] ?? k;

export type JointKey = 'neck' | 'shoulders' | 'elbows' | 'wrists' | 'lowerBack' | 'hips' | 'knees' | 'ankles';
export const JOINTS: { k: JointKey; label: string }[] = [
  { k: 'neck', label: 'Neck' }, { k: 'shoulders', label: 'Shoulders' }, { k: 'elbows', label: 'Elbows' }, { k: 'wrists', label: 'Wrists' },
  { k: 'lowerBack', label: 'Lower back' }, { k: 'hips', label: 'Hips' }, { k: 'knees', label: 'Knees' }, { k: 'ankles', label: 'Ankles' }
];
export const jointLabel = (k: string) => JOINTS.find((j) => j.k === k)?.label ?? k;

// Parts used before the 20-muscle map; old check-ins still read with these names.
export const LEGACY_LABELS: Record<string, string> = { shoulders: 'Shoulders', arms: 'Arms', upperBack: 'Upper back/neck' };
export const LEGACY_TO_NEW: Record<string, MuscleKey> = { shoulders: 'sideDelts', arms: 'biceps', upperBack: 'traps' };

// Colour scales (lightest first). Soreness = yellow to dark red; injury = purple; pump = blue; joint pain = magenta.
export const SCALES = {
  sore: { levels: ['Low', 'Average', 'High', 'Extreme'], colors: ['#ffd84d', '#ff9f2e', '#ff4b2b', '#b8001f'], from: 1 },
  injury: { levels: ['Niggle', 'Poor', 'Injured'], colors: ['#c9b3f2', '#9566e0', '#5b2aa8'], from: 2 },
  joint: { levels: ['Mild', 'Moderate', 'Severe'], colors: ['#f6b3d8', '#e05aa6', '#a3166c'], from: 1 },
  pump: { levels: ['Light', 'Good', 'Great'], colors: ['#a9d6ff', '#4a9df0', '#1557b0'], from: 1 },
  volume: { levels: ['Maintenance (MV)', 'Growing (MEV)', 'In range (MAV)', 'At limit (MRV)'], colors: ['#b5ece4', '#5fd0bf', '#14a08d', '#0b5e53'], from: 1 }
} as const;
export type ScaleKey = keyof typeof SCALES;
export const colorFor = (s: ScaleKey, value: number) => SCALES[s].colors[value - SCALES[s].from] ?? SCALES[s].colors.at(-1)!;
export const levelName = (s: ScaleKey, value: number) => SCALES[s].levels[value - SCALES[s].from] ?? '';
