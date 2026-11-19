// Admin-only card on the Menu: add a tester's email, which sends them the invite email, and see who has joined.
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, Send, X } from 'lucide-react';
import { callApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

type Invite = { email: string; note: string | null; invited_at: string; is_admin: boolean; joined_at: string | null; emailed?: boolean; connected: boolean; last_sync: string | null };

type Req = { email: string; name: string | null; note: string | null; created_at: string };

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  note: z.string().trim().max(200).optional()
});

const LINK = 'https://aevigor.com/beta/';
const message = (email: string) =>
  `You're invited to test Aevigor, my training app. Open ${LINK} and tap "Create your account" (or Continue with Google) using ${email}. ` +
  `Then accept the privacy notice and connect your intervals.icu account. Thanks for helping!`;

export function InviteTesters() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['invites'], queryFn: () => callApi<{ invites: Invite[]; requests?: Req[] }>('invites') });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', note: '' } });

  const add = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => callApi<{ email: string; emailed?: boolean; email_error?: string | null }>('invite', v),
    onSuccess: async (r) => {
      form.reset();
      qc.invalidateQueries({ queryKey: ['invites'] });
      if (r.emailed) { toast.success(`Invite email sent to ${r.email}.`); return; }
      try { await navigator.clipboard.writeText(message(r.email)); toast.warning(`${r.email} is invited, but the email could not be sent${r.email_error ? ` (${r.email_error})` : ''}. The invite message is copied so you can paste it into a text instead.`); }
      catch { toast.warning(`${r.email} is invited, but the email could not be sent. Send them the link ${LINK}`); }
    },
    onError: (e: Error) => toast.error(e.message)
  });
  const resend = useMutation({
    mutationFn: (email: string) => callApi('invite-resend', { email }),
    onSuccess: (_r, email) => { qc.invalidateQueries({ queryKey: ['invites'] }); toast.success(`Invite email sent again to ${email}`); },
    onError: (e: Error) => toast.error(e.message)
  });
  const remove = useMutation({
    mutationFn: (email: string) => callApi('uninvite', { email }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invites'] }); toast.success('Invite removed'); },
    onError: (e: Error) => toast.error(e.message)
  });

  const decline = useMutation({
    mutationFn: (email: string) => callApi('request-decide', { email, decision: 'declined' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invites'] }); toast.success('Request declined'); },
    onError: (e: Error) => toast.error(e.message)
  });
  const invites = list.data?.invites ?? [];
  const requests = list.data?.requests ?? [];
  const joined = invites.filter((i) => i.joined_at).length;

  async function copy(email: string) {
    try { await navigator.clipboard.writeText(message(email)); toast.success('Invite message copied'); }
    catch { toast.error('Could not copy. Send them the link ' + LINK); }
  }

  return (
    <Card className="border-primary/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          Invite testers <Badge variant="outline">{joined} joined · {invites.length} invited</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {requests.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Sign-up requests from aevigor.com ({requests.length})</div>
            <ul className="divide-y rounded-md border">
              {requests.map((r) => (
                <li key={r.email} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.name ? <b>{r.name}</b> : null} {r.email}</div>
                    {r.note && <div className="text-xs text-muted-foreground">{r.note}</div>}
                  </div>
                  <Button size="sm" disabled={add.isPending} onClick={() => add.mutate({ email: r.email, note: [r.name, r.note].filter(Boolean).join(' · ').slice(0, 200) || undefined })}>Approve</Button>
                  <Button size="sm" variant="ghost" disabled={decline.isPending} onClick={() => decline.mutate(r.email)}>Decline</Button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Approve sends that person the invite email.</p>
          </div>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => add.mutate(v))} className="space-y-3">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" autoComplete="off" placeholder="friend@example.com" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="note" render={({ field }) => (
              <FormItem><FormLabel>Note (optional)</FormLabel><FormControl><Input placeholder="e.g. cycling club" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={add.isPending}>{add.isPending ? 'Sending…' : 'Send invite'}</Button>
          </form>
        </Form>
        <p className="text-xs text-muted-foreground">
          Sends an invite email from no-reply@aevigor.com with a link to the beta. They choose a password (or use Google with the same email), then can connect intervals.icu or use the app without it.
        </p>
        {list.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : list.error ? (
          <p className="text-sm text-destructive">{(list.error as Error).message}</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {invites.map((i) => (
              <li key={i.email} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{i.email}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.is_admin ? 'admin · ' : ''}{i.joined_at ? (i.connected ? 'joined, connected' : 'joined, not connected yet') : i.emailed ? 'invite email sent, not joined yet' : 'not joined yet'}{i.note ? ` · ${i.note}` : ''}
                  </div>
                </div>
                {!i.joined_at && (
                  <>
                    <Button size="icon" variant="ghost" aria-label={`Send the invite email again to ${i.email}`} disabled={resend.isPending} onClick={() => resend.mutate(i.email)}><Send className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Copy invite message for ${i.email}`} onClick={() => copy(i.email)}><Copy className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" aria-label={`Remove invite for ${i.email}`} disabled={remove.isPending} onClick={() => remove.mutate(i.email)}><X className="h-4 w-4" /></Button>
                  </>
                )}
              </li>
            ))}
            {!invites.length && <li className="px-3 py-2 text-sm text-muted-foreground">No one invited yet.</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
