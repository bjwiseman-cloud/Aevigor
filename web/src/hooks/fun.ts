// Engagement switches (Ben 2026-11-24): streaks and celebrations can be switched off in Settings. Saved to the account.
import { usePref } from '@/hooks/data';

export type FunPrefs = { streaks: boolean; celebrations: boolean };
export const FUN_KEY = 'fun';
const DEF: FunPrefs = { streaks: true, celebrations: true };
export function useFun() {
  const p = usePref<Partial<FunPrefs>>(FUN_KEY, DEF);
  return { ...DEF, ...(p.value ?? {}), loaded: p.loaded, save: (v: Partial<FunPrefs>) => p.save({ ...DEF, ...(p.value ?? {}), ...v }) };
}
