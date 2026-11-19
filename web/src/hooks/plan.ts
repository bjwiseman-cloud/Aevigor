import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { todayIn } from '@/lib/time';
import { addDaysIso, type LogDose, type LogGroup, type LogItem, type PlanEvent } from '@/lib/plan';
import type { Profile } from '@/lib/types';

// Health tables are written straight from the app: Row Level Security only lets people touch their own rows,
// and only after the separate health-data opt-in (see migration 20261119000000_plan.sql).

export type RecordKind = 'blood' | 'urine' | 'dexa' | 'ecg' | 'imaging' | 'mammogram' | 'pap' | 'other';
export type HealthRecord = { id: string; kind: RecordKind; day: string; title: string | null; source: string | null; notes: string | null; files: string[] };
export type LabValue = { id: string; record_id: string; marker: string; value_num: number | null; value_text: string | null; unit: string | null; range_text: string | null; flag: 'Below' | 'Normal' | 'High' | null };
export type BpReading = { id: string; taken_at: string; systolic: number; diastolic: number; pulse: number | null; source: string };

async function all<T>(table: string, build?: (q: any) => any): Promise<T[]> {
  let q: any = supabase.from(table).select('*');
  if (build) q = build(q);
  const { data, error } = await q.limit(5000);
  if (error) throw error;
  return (data ?? []) as T[];
}

export function useHealthOn(p: Profile | null | undefined) {
  return !!(p as (Profile & { health_consent_at?: string | null }) | undefined)?.health_consent_at;
}

export function usePlanData(p: Profile | null | undefined) {
  const on = useHealthOn(p);
  const today = p ? todayIn(p.time_zone) : '';
  const items = useQuery({ queryKey: ['log_items', p?.user_id], enabled: on, queryFn: () => all<LogItem>('log_items', (q) => q.order('created_at')) });
  const groups = useQuery({ queryKey: ['log_groups', p?.user_id], enabled: on, queryFn: () => all<LogGroup>('log_groups', (q) => q.order('created_at')) });
  const doses = useQuery({
    queryKey: ['log_doses', p?.user_id], enabled: on,
    queryFn: () => all<LogDose>('log_doses', (q) => q.gte('day', addDaysIso(today, -62)))
  });
  const events = useQuery({
    queryKey: ['events', p?.user_id], enabled: on,
    queryFn: () => all<PlanEvent>('events', (q) => q.gte('starts_at', addDaysIso(today, -400)).order('starts_at'))
  });
  return { on, today, items, groups, doses, events };
}

export function useRecords(p: Profile | null | undefined) {
  const on = useHealthOn(p);
  const records = useQuery({ queryKey: ['records', p?.user_id], enabled: on, queryFn: () => all<HealthRecord>('records', (q) => q.order('day', { ascending: false })) });
  const labs = useQuery({ queryKey: ['lab_values', p?.user_id], enabled: on, queryFn: () => all<LabValue>('lab_values') });
  const bp = useQuery({ queryKey: ['bp_readings', p?.user_id], enabled: on, queryFn: () => all<BpReading>('bp_readings', (q) => q.order('taken_at')) });
  return { on, records, labs, bp };
}

// Generic insert / update / delete with a toast and cache refresh
export function useSave(table: string, keys: string[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { op: 'insert' | 'update' | 'delete' | 'upsert'; row?: Record<string, unknown>; id?: string; onConflict?: string }) => {
      let r;
      if (a.op === 'insert') r = await supabase.from(table).insert(a.row!).select().single();
      else if (a.op === 'upsert') r = await supabase.from(table).upsert(a.row!, { onConflict: a.onConflict }).select().single();
      else if (a.op === 'update') r = await supabase.from(table).update(a.row!).eq('id', a.id!).select().single();
      else r = await supabase.from(table).delete().eq('id', a.id!);
      if (r.error) throw r.error;
      return r.data as Record<string, unknown> | null;
    },
    onSuccess: () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
    onError: (e: Error) => toast.error(e.message)
  });
}

// Taken / Skip for every item in a reminder slot at once
export function useMarkSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: { itemIds: string[]; day: string; slot: string; status: 'taken' | 'skipped' }) => {
      const rows = a.itemIds.map((item_id) => ({ item_id, day: a.day, slot: a.slot, status: a.status }));
      const { error } = await supabase.from('log_doses').upsert(rows, { onConflict: 'item_id,day,slot' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['log_doses'] }),
    onError: (e: Error) => toast.error(e.message)
  });
}
