import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const configured = Boolean(url && anonKey);

// The anon key is public by design: the database's Row Level Security decides what each person can read.
export const supabase = createClient(url || 'https://not-configured.invalid', anonKey || 'not-configured', {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' }
});

export const supabaseUrl = url || '';
export const supabaseAnonKey = anonKey || '';
