import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Message } from './Message';

const schema = z.object({ password: z.string().min(8, 'At least 8 characters.') });

export function ResetPassword() {
  const { doneRecovering } = useAuth();
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '' } });
  async function onSubmit(v: z.infer<typeof schema>) {
    const { error } = await supabase.auth.updateUser({ password: v.password });
    if (error) return form.setError('password', { message: error.message });
    toast.success('Password saved.');
    doneRecovering();
  }
  return (
    <Message title="Choose a new password">
      <Card><CardContent className="pt-5">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem><FormLabel>New password</FormLabel><FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>Save password</Button>
          </form>
        </Form>
      </CardContent></Card>
    </Message>
  );
}
