import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useHealthOn } from '@/hooks/plan';
import type { Profile } from '@/lib/types';
import type { CycleDay, CycleSettings } from '@/lib/cycle';

// Cycle data is health data: it needs the health-log opt-in and the person's own "Turn on cycle tracking".
export function useCycle(p: Profile | null | undefined) {
  const qc = useQueryClient();
  const health = useHealthOn(p);
  const settings = useQuery({
    queryKey: ['cycle_settings', p?.user_id], enabled: !!p && health,
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_settings').select('tracking, life_stage, contraception, hormonal').maybeSingle();
      if (error) throw error; return (data as CycleSettings | null) ?? null;
    }
  });
  const on = health && !!settings.data?.tracking;
  const days = useQuery({
    queryKey: ['cycle_days', p?.user_id], enabled: on,
    queryFn: async () => {
      const { data, error } = await supabase.from('cycle_days').select('day, period, flow, symptoms, note').order('day').limit(2000);
      if (error) throw error; return (data ?? []) as CycleDay[];
    }
  });
  const saveSettings = async (v: Partial<CycleSettings>) => {
    const { error } = await supabase.from('cycle_settings').upsert({ ...(settings.data ?? {}), ...v, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['cycle_settings'] });
  };
  const saveDay = async (d: CycleDay) => {
    const empty = !d.period && !d.flow && !d.symptoms.length && !d.note;
    const { error } = empty
      ? await supabase.from('cycle_days').delete().eq('day', d.day)
      : await supabase.from('cycle_days').upsert(d, { onConflict: 'user_id,day' });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['cycle_days'] });
  };
  return { health, settings: settings.data ?? null, loaded: !settings.isLoading, on, days: days.data ?? [], saveSettings, saveDay };
}
