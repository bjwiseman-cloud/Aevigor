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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { TimeZoneSelect } from './TimeZoneSelect';
import { InviteTesters } from './InviteTesters';

const accountSchema = z.object({ display_name: z.string().trim().max(80), time_zone: z.string().min(1) });
const passwordSchema = z.object({ password: z.string().min(8, 'At least 8 characters.') });

export function Settings() {
  const { session } = useAuth();
  const profile = useProfile().data!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
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

  async function changePassword(v: z.infer<typeof passwordSchema>) {
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) return pw.setError('password', { message: error.message });
    pw.reset(); toast.success('Password changed');
  }

  async function disconnect() {
    try { await callApi('disconnect'); await qc.invalidateQueries(); toast.success('Disconnected'); }
    catch (e) { toast.error((e as Error).message); }
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
      <h1 className="font-mono text-xl text-primary">Settings</h1>

      {profile.is_admin && <InviteTesters />}

      <Card>
        <CardHeader className="pb-3"><CardTitle>Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>intervals.icu</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {profile.intervals_connected_at ? (
            <>
              <p>Connected as athlete <b>{profile.intervals_athlete_id}</b>.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/connect')}>Change API key</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button variant="outline" className="w-full border-destructive text-destructive">Disconnect</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect intervals.icu?</AlertDialogTitle>
                    <AlertDialogDescription>Syncing stops and your saved API key is deleted. Your past data stays until you delete your account.</AlertDialogDescription>
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
              <p className="text-muted-foreground">Not connected.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate('/connect')}>Connect</Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle>Privacy</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
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
        </CardContent>
      </Card>

      <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>Sign out</Button>
    </div>
  );
}
