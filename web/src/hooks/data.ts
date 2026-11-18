import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { Checkin, DailyStatus, Profile } from '@/lib/types';
import { todayIn } from '@/lib/time';
import { addDays } from '@rules';
import type { CheckinRow, LoadRow, TestRow, WellnessRow } from '@/lib/metrics';

// Every query only ever returns the signed-in person's rows (Row Level Security).
export function useProfile() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['profile', session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('user_id', session!.user.id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    }
  });
}

export function useLatestStatus(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['status', profile?.user_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('daily_status').select('*').lte('day', todayIn(profile!.time_zone))
        .order('day', { ascending: false }).limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as DailyStatus | null;
    }
  });
}

export function useTodayCheckin(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['checkin', profile?.user_id],
    enabled: !!profile,
    queryFn: async () => {
      const { data, error } = await supabase.from('checkins').select('*').eq('day', todayIn(profile!.time_zone)).maybeSingle();
      if (error) throw error;
      return (data ?? null) as Checkin | null;
    }
  });
}

// ---------- Load and Trends ----------

async function rows<T>(table: string, cols: string, from: string, to?: string): Promise<T[]> {
  let q = supabase.from(table).select(cols).gte('day', from).order('day').limit(5000);
  if (to) q = q.lte('day', to);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as T[];
}

<<<<<<< HEAD
export const LOAD_BACK = 365, PLAN_AHEAD = 180, TRENDS_BACK = 84 + 136;
=======
export const LOAD_BACK = 365, PLAN_AHEAD = 180, TRENDS_BACK = 120 + 80;
>>>>>>> origin/main

export function useDailyLoad(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['daily_load', profile?.user_id],
    enabled: !!profile,
    queryFn: () => {
      const today = todayIn(profile!.time_zone);
      return rows<LoadRow>('daily_load', 'day, sport, actual, planned, rpe, sessions', addDays(today, -LOAD_BACK), addDays(today, PLAN_AHEAD));
    }
  });
}

export function usePlannedTests(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['planned_tests', profile?.user_id],
    enabled: !!profile,
    queryFn: () => rows<TestRow>('planned_tests', 'day, kind, name', addDays(todayIn(profile!.time_zone), -LOAD_BACK))
  });
}

export function useCalendar(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['calendar_items', profile?.user_id],
    enabled: !!profile,
    queryFn: () => rows<{ id: string; day: string; kind: string; name: string | null }>('calendar_items', 'id, day, kind, name', addDays(todayIn(profile!.time_zone), -LOAD_BACK))
  });
}

export function usePref<T>(key: string, fallback: T) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['user_prefs', key],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_prefs').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      return (data?.value as T | undefined) ?? null;
    }
  });
  const save = async (value: T) => {
    const { error } = await supabase.from('user_prefs').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ['user_prefs', key] });
  };
  return { value: q.data ?? fallback, loaded: !q.isLoading, save };
}

export function useWellness(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['wellness', profile?.user_id],
    enabled: !!profile,
    queryFn: () => rows<WellnessRow>('wellness', 'day, hrv, resting_hr, sleep_secs, sleep_quality, fatigue, soreness, stress, mood, extra',
      addDays(todayIn(profile!.time_zone), -TRENDS_BACK))
  });
}

export function useCheckins(profile: Profile | null | undefined) {
  return useQuery({
    queryKey: ['checkins', profile?.user_id],
    enabled: !!profile,
    queryFn: () => rows<CheckinRow>('checkins', 'day, sleep_quality, fatigue, soreness, stress, mood, sick, clarity, libido, caffeine, alcohol, body_temp',
      addDays(todayIn(profile!.time_zone), -TRENDS_BACK))
  });
}
