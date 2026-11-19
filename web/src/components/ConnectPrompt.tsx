// Using Aevigor without intervals.icu (Ben 2026-11-19): the app works, and each time you sign in a short
// prompt explains why connecting helps, in three steps, with a link to intervals.icu and "Not now".
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const KEY = 'aev-connect-later';
const said = () => { try { return sessionStorage.getItem(KEY) === '1'; } catch { return false; } };
export const notNow = () => { try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ } };

// Signing out clears "Not now", so the next sign-in shows the prompt again (so does opening the app afresh)
supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') { try { sessionStorage.removeItem(KEY); } catch { /* private mode */ } } });

export function ConnectSteps() {
  return (
    <ol className="list-decimal space-y-1 pl-5 text-sm">
      <li>Make a free account at <a className="text-primary underline" href="https://intervals.icu" target="_blank" rel="noopener">intervals.icu</a> and link your watch (Garmin, Polar, Coros, Apple Health and others) there.</li>
      <li>In intervals.icu, open <b>Settings</b>, scroll to <b>Developer Settings</b> and copy your <b>API key</b>.</li>
      <li>Come back here, tap <b>Connect now</b> and paste it.</li>
    </ol>
  );
}

export function ConnectPrompt({ connected }: { connected: boolean }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { if (!connected && !said()) setOpen(true); }, [connected]);
  if (connected) return null;
  const later = () => { notNow(); setOpen(false); };
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && later()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Connect intervals.icu?</AlertDialogTitle>
          <AlertDialogDescription>
            You can use Aevigor without it: check-ins, lifting, your log and records all work. Connecting brings in your watch's HRV, resting heart rate, sleep and workouts, which power Today's status, Load, Performance and Trends.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ConnectSteps />
        <AlertDialogFooter>
          <Button variant="outline" onClick={later}>Not now</Button>
          <Button onClick={() => { notNow(); setOpen(false); navigate('/connect'); }}>Connect now</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
