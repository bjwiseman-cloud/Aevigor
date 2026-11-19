import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

type AuthState = { session: Session | null; loading: boolean; recovering: boolean; doneRecovering: () => void };
const AuthContext = createContext<AuthState>({ session: null, loading: true, recovering: false, doneRecovering: () => {} });

// Supabase Auth keeps the session; this just shares it with the screens.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    // Invite email link: ?token_hash=...&type=invite. Sign them in, then ask for a password (the same screen as a reset).
    const q = new URLSearchParams(window.location.search);
    const th = q.get('token_hash'), type = q.get('type');
    if (th && (type === 'invite' || type === 'recovery')) {
      window.history.replaceState(null, '', window.location.pathname);
      supabase.auth.verifyOtp({ token_hash: th, type }).then(({ data, error }) => {
        if (error) toast.error('That link has expired or was already used. Sign in, or ask for a new invite.');
        else { setSession(data.session); setRecovering(true); }
        setLoading(false);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSession(data.session);
        setLoading(false);
      });
    }
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      if (event === 'SIGNED_OUT') qc.clear();
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  return (
    <AuthContext.Provider value={{ session, loading, recovering, doneRecovering: () => setRecovering(false) }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
