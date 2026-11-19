import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LiftSet, Unit } from '@/lib/lifting';

export const UNIT_KEY = 'aev-lift-unit';
export function useUnit(): [Unit, (u: Unit) => void] {
  const [u, setU] = useState<Unit>(() => { try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg'; } catch { return 'kg'; } });
  return [u, (v) => { setU(v); try { localStorage.setItem(UNIT_KEY, v); } catch { /* private window */ } }];
}

export function useSets() {
  return useQuery({
    queryKey: ['lift_sets'],
    queryFn: async () => {
      const all: LiftSet[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from('lift_sets').select('*').order('day', { ascending: false }).order('exercise').order('set_no').range(from, from + 999);
        if (error) throw error;
        all.push(...((data ?? []) as LiftSet[]).map((s) => ({ ...s, weight: Number(s.weight), rir: s.rir == null ? null : Number(s.rir) })));
        if ((data ?? []).length < 1000 || all.length >= 20000) break;
      }
      return all;
    }
  });
}
