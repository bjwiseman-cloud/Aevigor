import { Link } from 'react-router-dom';
import { BookOpen, GraduationCap, LogOut, Settings as Gear } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useProfile } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InviteTesters } from './InviteTesters';

export function Menu() {
  const { session } = useAuth();
  const p = useProfile().data!;
  const item = 'flex items-center gap-3 rounded-md px-3 py-3 hover:bg-muted';
  return (
    <div className="space-y-4">
      <Link to="/profile" className="block"><Card><CardContent className="flex items-center gap-3 pt-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{(p.display_name || session?.user.email || '?')[0].toUpperCase()}</div>
        <div><b>{p.display_name || 'Your profile'}</b><div className="text-sm text-muted-foreground">Profile, thresholds and zones</div></div>
      </CardContent></Card></Link>
      <Card><CardContent className="p-2">
        <Link className={item} to="/guide"><BookOpen className="h-5 w-5" /> Guide</Link>
        <a className={item} href="/learn/" target="_blank" rel="noopener"><GraduationCap className="h-5 w-5" /> Learn (aevigor.com)</a>
        <Link className={item} to="/settings"><Gear className="h-5 w-5" /> Settings</Link>
      </CardContent></Card>
      {p.is_admin && <InviteTesters />}
      <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}><LogOut /> Log out</Button>
    </div>
  );
}
