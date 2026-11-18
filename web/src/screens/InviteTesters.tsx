// Admin-only card on Settings: add testers to the invite list and see who has joined.
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, X } from 'lucide-react';
import { callApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

type Invite = { email: string; note: string | null; invited_at: string; is_admin: boolean; joined_at: string | null; connected: boolean; last_sync: string | null };

const schema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  note: z.string().trim().max(200).optional()
});

const LINK = 'https://aevigor.com/beta/';
const message = (email: string) =>
  `You're invited to test Aevigor, my training app. Open ${LINK} and tap "Create your account" using ${email}. ` +
  `Then accept the privacy notice and connect your intervals.icu account. Thanks for helping!`;

export function InviteTesters() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['invites'], queryFn: () => callApi<{ invites: Invite[] }>('invites') });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', note: '' } });

  const add = useMutation({
    mutationFn: (v: z.infer<typeof schema>) => callApi<{ email: string }>('invite', v),
    onSuccess: async (r) => {
      form.reset();
      qc.invalidateQueries({ queryKey: ['invites'] });
      try { await navigator.clipboard.writeText(message(r.email)); toast.success(`${r.email} invited. Invite message copied, paste it into a text or email.`); }
      catch { toast.success(`${r.email} invited. Send them the link ${LINK}`); }
    },
    onError: (e: Error) => toast.error(e.message)
  });
  const remove = useMutation({
    mutationFn: (email: string) => callApi('uninvite', { email }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['invites'] }); toast.success('Invite removed'); },
    onError: (e: Error) => toast.error(e.message)
  });

  const invites = list.data?.invites ?? [];
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
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => add.mutate(v))} className="space-y-3">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" autoComplete="off" placeholder="friend@example.com" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="note" render={({ field }) => (
              <FormItem><FormLabel>Note (optional)</FormLabel><FormControl><Input placeholder="e.g. cycling club" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Invite'}</Button>
          </form>
        </Form>
        <p className="text-xs text-muted-foreground">
          Adding someone lets that email create an account. Nothing is sent automatically: after you add them, the invite message is copied so you can paste it into a text or email.
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
                    {i.is_admin ? 'admin · ' : ''}{i.joined_at ? (i.connected ? 'joined, connected' : 'joined, not connected yet') : 'not joined yet'}{i.note ? ` · ${i.note}` : ''}
                  </div>
                </div>
                {!i.joined_at && (
                  <>
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
