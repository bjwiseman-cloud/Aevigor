import { supabase, supabaseAnonKey, supabaseUrl } from './supabase';

// Calls the beta's edge function (supabase/functions/api) as the signed-in person.
export async function callApi<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${supabaseUrl}/functions/v1/api/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${data.session?.access_token ?? ''}`
    },
    body: JSON.stringify(body)
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Something went wrong (${res.status}).`);
  return out as T;
}
