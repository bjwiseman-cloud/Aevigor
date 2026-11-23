import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { callApi } from '@/lib/api';
import { useAuth } from '@/auth/AuthProvider';
import { useProfile } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { TimeZoneSelect } from './TimeZoneSelect';
import { useHealthOn } from '@/hooks/plan';
import { useUnit } from '@/hooks/lifting';
import { Section } from '@/components/Section';
import { CycleSettingsSection } from '@/components/Cycle';
import { Landmarks } from '@/components/Landmarks';
import { PhoneAlerts } from '@/components/PhoneAlerts';
import { Reminders } from '@/components/ReminderSettings';
import { Chip, Chips } from '@/components/chips';
import { ThemeChips } from '@/components/ThemeButton';

const accountSchema = z.object({ display_name: z.string().trim().max(80), time_zone: z.string().min(1) });
const passwordSchema = z.object({ password: z.string().min(8, 'At least 8 characters.') });

export function Settings() {
  const { session } = useAuth();
  const profile = useProfile().data!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const healthOn = useHealthOn(profile);
  const [unit, setUnit] = useUnit();
  const providers: string[] = session?.user.app_metadata?.providers ?? [session?.user.app_metadata?.provider].filter(Boolean);

  const account = useForm<z.infer<typeof accountSchema>>({
    resolver: zodResolver(accountSchema),
    defaultValues: { display_name: profile.display_name ?? '', time_zone: profile.time_zone }
  });
  const pw = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { password: '' } });

  async function saveAccount(v: z.infer<typeof accountSchema>) {
    const { error } = await supabase.from('profiles').update({ display_name: v.display_name || null, time_zone: v.time_zone }).eq('user_id', profile.user_id);
    if (error) return toast.error(error.message);
    toast.success('Saved');
    qc.invalidateQueries({ queryKey: ['profile'] });
  }

  async function resetAll() {
    try {
      const a = await supabase.from('user_prefs').delete().not('key', 'is', null);
      if (a.error) throw a.error;
      const b = await supabase.from('ui_layout').delete().not('page', 'is', null);
      if (b.error) throw b.error;
      setUnit('kg');
      await qc.invalidateQueries();
      toast.success('Settings reset to default');
    } catch (e) { toast.error((e as Error).message); }
  }

  async function changePassword(v: z.infer<typeof passwordSchema>) {
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) return pw.setError('password', { message: error.message });
    pw.reset(); toast.success('Password changed');
  }

  async function disconnect() {
    try { await callApi('disconnect'); await qc.invalidateQueries(); toast.success('Disconnected'); }
    catch (e) { toast.error((e as Error).message); }
  }

  // Files first (storage API), then every health row; consent is cleared too.
  async function deleteHealth() {
    try {
      const { data: recs, error: e1 } = await supabase.from('records').select('files');
      if (e1) throw e1;
      const files = (recs ?? []).flatMap((r: { files: string[] }) => r.files);
      for (let i = 0; i < files.length; i += 100) {
        const { error } = await supabase.storage.from('records').remove(files.slice(i, i + 100));
        if (error) throw error;
      }
      const { error } = await supabase.rpc('delete_my_health_data');
      if (error) throw error;
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      await (await reg?.pushManager.getSubscription())?.unsubscribe();
      await supabase.rpc('delete_my_push_data');
      await qc.invalidateQueries();
      toast.success('Your health data has been deleted.');
    } catch (e) { toast.error((e as Error).message); }
  }

  async function deleteAccount() {
    try {
      await callApi('delete-account', { confirm: 'DELETE' });
      // Signing out returns to the sign-in screen; the message stays up long enough to read.
      toast.success('Account deleted. All your Aevigor data has been removed. Thanks for testing.', { duration: 10000 });
      await supabase.auth.signOut();
    } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-bold tracking-wide">Settings</h1>

      <Section title="Appearance">
          <ThemeChips />
          <p className="text-muted-foreground">Auto matches your phone or computer. Light is rice paper and ink; Dark is charcoal and gold. Same choice as aevigor.com.</p>
      </Section>

      <Section title="Units">
        <div className="flex items-center gap-2"><span className="w-28">Lifting weights</span><Chips><Chip on={unit === 'kg'} onClick={() => setUnit('kg')}>kg</Chip><Chip on={unit === 'lb'} onClick={() => setUnit('lb')}>lb</Chip></Chips></div>
        <p className="text-muted-foreground">Distance, pace and body weight follow your intervals.icu settings.</p>
      </Section>

      <Section title="Weekly volume landmarks"><Landmarks /></Section>

      {profile.sex !== 'male' && <Section title="Women's health"><CycleSettingsSection /></Section>}


      <Section title="Account">
          <p className="flex flex-wrap items-center gap-2">{session?.user.email} <Badge variant="outline">{providers.join(', ') || 'email'}</Badge></p>
          <Form {...account}>
            <form onSubmit={account.handleSubmit(saveAccount)} className="space-y-4">
              <FormField control={account.control} name="display_name" render={({ field }) => (
                <FormItem><FormLabel>Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={account.control} name="time_zone" render={({ field }) => (
                <FormItem><FormLabel>Time zone</FormLabel><TimeZoneSelect value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>
              )} />
              <Button type="submit" variant="outline" className="w-full">Save</Button>
            </form>
          </Form>
          {providers.includes('email') && (
            <Form {...pw}>
              <form onSubmit={pw.handleSubmit(changePassword)} className="space-y-3 border-t pt-4">
                <FormField control={pw.control} name="password" render={({ field }) => (
                  <FormItem><FormLabel>New password</FormLabel><FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" variant="outline" className="w-full">Change password</Button>
              </form>
            </Form>
          )}
      </Section>

      <Section title="intervals.icu">
          {profile.intervals_connected_at ? (
            <>
              <p>Connected as athlete <b>{profile.intervals_athlete_id}</b>.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/connect')}>Reconnect intervals.icu</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" className="w-full border-destructive text-destructive">Disconnect</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect intervals.icu?</AlertDialogTitle>
                    <AlertDialogDescription>Syncing stops and Aevigor's access to intervals.icu is removed. Your past data stays until you delete your account.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={disconnect}>Disconnect</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">Not connected. Optional: connecting brings in your watch's HRV, resting heart rate, sleep and workouts for Today, Load, Performance and Trends.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/connect')}>Connect with intervals.icu</Button>
            </>
          )}
      </Section>

      <Section title="Reminders"><Reminders email={profile.email ?? null} /></Section>

      <Section title="Health log">
          <p className="text-muted-foreground">{healthOn ? 'On. My log, Schedule and Records keep what you enter, only for you.' : 'Off. Turn it on from Plan.'}</p>
          {healthOn && <PhoneAlerts />}
          {healthOn && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="outline" className="w-full border-destructive text-destructive">Delete my health data</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete all health data?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently deletes My log, reminders, appointments, records, uploaded files, lab results and blood pressure readings, and turns the health log off. It cannot be undone. Your training data stays.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteHealth}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
      </Section>

      <Section title="Privacy">
          <p className="text-muted-foreground">
            <a className="text-primary underline" href="/legal/beta-privacy.html" target="_blank">Beta privacy notice</a> · <a className="text-primary underline" href="/legal/beta-terms.html" target="_blank">Beta terms</a>
            {profile.consent_at && <> · You agreed on {new Date(profile.consent_at).toLocaleDateString()}.</>}
          </p>
          <AlertDialog onOpenChange={() => setConfirmText('')}>
            <AlertDialogTrigger asChild><Button variant="destructive" className="w-full">Delete my account</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account and all your data?</AlertDialogTitle>
                <AlertDialogDescription>This permanently deletes your account, check-ins, synced data and saved key. It cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-2">
                <Label htmlFor="confirm">Type DELETE to confirm</Label>
                <Input id="confirm" autoComplete="off" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={confirmText.trim() !== 'DELETE'} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteAccount}>
                  Delete everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
      </Section>

      <AlertDialog>
        <AlertDialogTrigger asChild><Button variant="outline" className="w-full">Reset all settings</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Reset all settings?</AlertDialogTitle>
            <AlertDialogDescription>Chart choices, card order, volume landmarks and units go back to the defaults. Your logged data, check-ins and health log are not touched.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={resetAll}>Reset</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>Sign out</Button>
    </div>
  );
}
