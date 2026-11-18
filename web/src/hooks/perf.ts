import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';
import type { Activity, Curve } from '@/lib/perf';
import type { Profile } from '@/lib/types';

export function useActivities(p: Profile | null | undefined) {
  return useQuery({
    queryKey: ['activities', p?.user_id], enabled: !!p,
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*').order('day', { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Activity[];
    }
  });
}

export function useCurves(p: Profile | null | undefined) {
  return useQuery({
    queryKey: ['power_curves', p?.user_id], enabled: !!p,
    queryFn: async () => {
      const { data, error } = await supabase.from('power_curves').select('*');
      if (error) throw error;
      return (data ?? []) as Curve[];
    }
  });
}

export function useStreams(id: string | null) {
  return useQuery({
    queryKey: ['streams', id], enabled: !!id, staleTime: Infinity,
    queryFn: async () => (await callApi<{ streams: Record<string, (number | null)[]> }>('streams', { id })).streams
  });
}
