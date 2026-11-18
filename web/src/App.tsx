import { Navigate, Route, Routes } from 'react-router-dom';
import { configured } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useProfile } from '@/hooks/data';
import { CONSENT_VERSION } from '@/lib/types';
import { Layout } from '@/screens/Layout';
import { SignIn } from '@/screens/SignIn';
import { ResetPassword } from '@/screens/ResetPassword';
import { Consent } from '@/screens/Consent';
import { Connect } from '@/screens/Connect';
import { Today } from '@/screens/Today';
import { SessionCheckin } from '@/screens/SessionCheckin';
import { CheckinPage } from '@/screens/Checkin';
import { Guide } from '@/screens/Guide';
import { Load } from '@/screens/Load';
import { Trends } from '@/screens/Trends';
import { Settings } from '@/screens/Settings';
import { Message } from '@/screens/Message';
import { Schedule } from '@/screens/plan/Schedule';
import { MyLog } from '@/screens/plan/MyLog';
import { Records } from '@/screens/plan/Records';
import { Inbox } from '@/screens/Inbox';
import { Menu } from '@/screens/Menu';
import { Performance } from '@/screens/training/Performance';
import { Sessions } from '@/screens/training/Sessions';
import { Lifting } from '@/screens/training/Lifting';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

export default function App() {
  const { session, loading, recovering } = useAuth();
  const profile = useProfile();

  if (!configured) return <Message title="Not set up yet">The beta server details have not been added yet.</Message>;
  if (loading || (session && profile.isLoading)) return <Message title="Loading…" />;
  if (recovering) return <ResetPassword />;
  if (!session) return <SignIn />;
  if (profile.error || !profile.data) {
    return (
      <Message title="Could not load your account">
        <p>{profile.error ? String((profile.error as Error).message) : 'Please sign out and back in.'}</p>
        <Button variant="outline" className="mt-4 w-full" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </Message>
    );
  }
  const p = profile.data;
  if (!p.consent_at || p.consent_version !== CONSENT_VERSION) return <Consent />;

  const connected = !!p.intervals_connected_at;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/today" element={connected ? <Today /> : <Navigate to="/connect" replace />} />
        <Route path="/checkin" element={connected ? <CheckinPage /> : <Navigate to="/connect" replace />} />
        <Route path="/checkin/session" element={connected ? <SessionCheckin /> : <Navigate to="/connect" replace />} />
        <Route path="/training/load" element={connected ? <Load /> : <Navigate to="/connect" replace />} />
        <Route path="/training/performance" element={connected ? <Performance /> : <Navigate to="/connect" replace />} />
        <Route path="/training/sessions" element={connected ? <Sessions /> : <Navigate to="/connect" replace />} />
        <Route path="/training/lifting" element={<Lifting />} />
        <Route path="/training" element={<Navigate to="/training/load" replace />} />
        <Route path="/load" element={<Navigate to="/training/load" replace />} />
        <Route path="/plan/schedule" element={<Schedule />} />
        <Route path="/plan/log" element={<MyLog />} />
        <Route path="/plan/records" element={<Records />} />
        <Route path="/plan" element={<Navigate to="/plan/schedule" replace />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/trends" element={connected ? <Trends /> : <Navigate to="/connect" replace />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="/connect" element={<Connect />} />
      <Route path="*" element={<Navigate to={connected ? '/today' : '/connect'} replace />} />
    </Routes>
  );
}
