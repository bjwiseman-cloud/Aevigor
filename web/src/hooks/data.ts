import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import type { Checkin, DailyStatus, Profile } from '@/lib/types';
import { todayIn } from '@/lib/time';

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
