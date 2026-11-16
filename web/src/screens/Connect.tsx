import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callApi } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { browserTimeZone } from '@/lib/time';
import { useProfile } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Message } from './Message';
import { TimeZoneSelect } from './TimeZoneSelect';

const schema = z.object({
  api_key: z.string().trim().regex(/^[A-Za-z0-9]{10,100}$/, 'That API key does not look right. Copy it again from intervals.icu.'),
  time_zone: z.string().min(1)
});

export function Connect() {
  const profile = useProfile().data;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { api_key: '', time_zone: profile?.intervals_connected_at ? profile.time_zone : browserTimeZone() }
  });

  async function onSubmit(v: z.infer<typeof schema>) {
    try {
      const r = await callApi<{ athlete?: { name?: string | null } }>('connect', v);
      toast.success('Connected' + (r.athlete?.name ? ` as ${r.athlete.name}` : ''));
      await qc.invalidateQueries();
      navigate('/today');
    } catch (e) {
      form.setError('api_key', { message: (e as Error).message });
    }
  }

  return (
    <Message title="Connect intervals.icu">
      <p className="mb-4">Aevigor reads your HRV, resting heart rate, sleep and workouts from intervals.icu. You only do this once.</p>
      <Card className="text-foreground">
        <CardContent className="space-y-4 pt-5">
          <CardTitle>Find your API key</CardTitle>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>Open <a className="text-primary underline" href="https://intervals.icu/settings" target="_blank" rel="noopener">intervals.icu › Settings</a> (on a computer is easiest).</li>
            <li>Scroll down to <b>Developer Settings</b>.</li>
            <li>Tap <b>Generate</b> (or <b>View</b>) next to API Key, then copy it.</li>
          </ol>
          <p className="text-sm text-muted-foreground">Your watch (Garmin, Polar and so on) needs to be linked to intervals.icu so HRV and sleep arrive there.</p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="api_key" render={({ field }) => (
                <FormItem><FormLabel>API key</FormLabel><FormControl><Input autoComplete="off" spellCheck={false} placeholder="Paste your API key" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="time_zone" render={({ field }) => (
                <FormItem><FormLabel>Your time zone</FormLabel><TimeZoneSelect value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full font-mono" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Connecting… (up to 30 s)' : 'Connect'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <p className="mt-4 text-sm">Your key is encrypted before it is saved and is never shown again. You can disconnect any time in Settings.</p>
      {profile?.intervals_connected_at
        ? <Button variant="outline" className="mt-4 w-full" onClick={() => navigate('/settings')}>Cancel</Button>
        : <Button variant="outline" className="mt-4 w-full" onClick={() => supabase.auth.signOut()}>Sign out</Button>}
    </Message>
  );
}
