import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callApi } from '@/lib/api';
import { browserTimeZone } from '@/lib/time';
import { useProfile } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Message } from './Message';
import { TimeZoneSelect } from './TimeZoneSelect';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { startIcuConnect, takeIcuPending } from '@/lib/icu-oauth';

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

  const [params, setParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const handled = useRef(false);

  // Back from the intervals.icu consent page (via /beta/icu.html): finish the connection on the server.
  useEffect(() => {
    const code = params.get('icu_code'), state = params.get('icu_state'), err = params.get('icu_error');
    if (handled.current || (!code && !err)) return;
    handled.current = true;
    setParams({}, { replace: true });
    if (err) { setOauthError(err === 'access_denied' ? 'You chose not to connect. You can try again any time.' : 'intervals.icu could not finish the sign-in. Please try again.'); return; }
    const pending = takeIcuPending(state ?? '');
    if (!pending) { setOauthError('This sign-in started in a different browser or took too long. Please tap Connect again, in the same browser.'); return; }
    setBusy('Finishing the connection… (up to 30 s)');
    callApi<{ athlete?: { name?: string | null } }>('oauth-connect', { code, code_verifier: pending.verifier, time_zone: pending.timeZone || form.getValues('time_zone') })
      .then(async (r) => {
        toast.success('Connected' + (r.athlete?.name ? ` as ${r.athlete.name}` : ''));
        await qc.invalidateQueries();
        navigate('/today');
      })
      .catch((e) => { setOauthError((e as Error).message); setBusy(null); });
  }, [params]);  // eslint-disable-line react-hooks/exhaustive-deps

  async function connectOAuth() {
    setOauthError(null);
    setBusy('Opening intervals.icu…');
    try { await startIcuConnect(form.getValues('time_zone')); } catch (e) { setOauthError((e as Error).message); setBusy(null); }
  }

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
          <CardTitle>Connect with intervals.icu</CardTitle>
          <p className="text-sm">You'll sign in on intervals.icu and tap <b>Allow</b>. Aevigor never sees your password.</p>
          <Form {...form}>
            <FormField control={form.control} name="time_zone" render={({ field }) => (
              <FormItem><FormLabel>Your time zone</FormLabel><TimeZoneSelect value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>
            )} />
          </Form>
          <Button className="h-14 w-full rounded-2xl bg-gradient-to-r from-rose-500 via-orange-500 to-amber-400 font-display text-lg font-extrabold italic text-white shadow-lg shadow-orange-500/30 hover:opacity-95" onClick={connectOAuth} disabled={!!busy}>🔗 {busy ?? 'Connect with intervals.icu'}</Button>
          {oauthError && <p className="text-sm text-destructive" role="alert">{oauthError}</p>}
          <p className="text-sm text-muted-foreground">Your watch (Garmin, Polar and so on) needs to be linked to intervals.icu so HRV and sleep arrive there.</p>
        </CardContent>
      </Card>
      <Accordion type="single" collapsible className="mt-4">
        <AccordionItem value="key">
          <AccordionTrigger>Use an API key instead</AccordionTrigger>
          <AccordionContent>
            <Card className="text-foreground">
              <CardContent className="space-y-4 pt-5">
                <ol className="list-decimal space-y-1 pl-5 text-sm">
                  <li>Open <a className="text-primary underline" href="https://intervals.icu/settings" target="_blank" rel="noopener">intervals.icu › Settings</a> (on a computer is easiest).</li>
                  <li>Scroll down to <b>Developer Settings</b>.</li>
                  <li>Tap <b>Generate</b> (or <b>View</b>) next to API Key, then copy it.</li>
                </ol>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <FormField control={form.control} name="api_key" render={({ field }) => (
                      <FormItem><FormLabel>API key</FormLabel><FormControl><Input autoComplete="off" spellCheck={false} placeholder="Paste your API key" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <Button type="submit" variant="outline" className="w-full" disabled={form.formState.isSubmitting}>
                      {form.formState.isSubmitting ? 'Connecting… (up to 30 s)' : 'Connect with API key'}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      <p className="mt-4 text-sm">Your connection is encrypted before it is saved. You can disconnect any time in Settings, which also removes Aevigor's access on intervals.icu.</p>
      <Button variant="outline" className="mt-4 w-full" onClick={() => navigate('/settings')}>Back to Settings</Button>
    </Message>
  );
}
