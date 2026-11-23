import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
import { Profile } from './screens/Profile';
import { Message } from '@/screens/Message';
import { Schedule } from '@/screens/plan/Schedule';
import { MyLog } from '@/screens/plan/MyLog';
import { Records } from '@/screens/plan/Records';
import { Inbox } from '@/screens/Inbox';
import { Menu } from '@/screens/Menu';
import { Performance } from '@/screens/training/Performance';
import { Sessions } from '@/screens/training/Sessions';

import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';

// Redirect that keeps the ?query (e.g. ?sport=lift)
function Moved({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={to + search} replace />;
}

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

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/today" element={<Today />} />
        <Route path="/checkin" element={<CheckinPage />} />
        <Route path="/checkin/session" element={<SessionCheckin />} />
        <Route path="/training/load" element={<Load />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/performance/profile" element={<Performance part="profile" />} />
        <Route path="/performance/curves" element={<Performance part="curves" />} />
        <Route path="/performance/zones" element={<Performance part="zones" />} />
        <Route path="/performance/tests" element={<Performance part="tests" />} />
        <Route path="/analysis" element={<Trends />} />
        <Route path="/analysis/physiology" element={<Performance part="physiology" />} />
        <Route path="/analysis/load" element={<Load charts />} />
        <Route path="/trends/performance" element={<Moved to="/performance" />} />
        <Route path="/training/performance" element={<Moved to="/performance" />} />
        <Route path="/training/sessions" element={<Sessions />} />
        <Route path="/training/lifting" element={<Navigate to="/performance/profile?sport=lift" replace />} />
        <Route path="/training" element={<Navigate to="/training/load" replace />} />
        <Route path="/load" element={<Navigate to="/training/load" replace />} />
        <Route path="/calendar" element={<Schedule />} />
        <Route path="/checkin/log" element={<MyLog />} />
        <Route path="/checkin/records" element={<Records />} />
        {/* Old Plan tab links (reminders, emails, bookmarks) */}
        <Route path="/plan/schedule" element={<Navigate to="/calendar" replace />} />
        <Route path="/plan/log" element={<Navigate to="/checkin/log" replace />} />
        <Route path="/plan/records" element={<Navigate to="/checkin/records" replace />} />
        <Route path="/plan" element={<Navigate to="/calendar" replace />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/trends" element={<Navigate to="/analysis" replace />} />
        <Route path="/guide" element={<Guide />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="/connect" element={<Connect />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
