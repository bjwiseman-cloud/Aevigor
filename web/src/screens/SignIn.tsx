import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Message } from './Message';

// Google sign-in shows only once it is set up in Supabase (VITE_GOOGLE_SIGNIN=on).
const GOOGLE = import.meta.env.VITE_GOOGLE_SIGNIN === 'on';

const HOME = window.location.origin + window.location.pathname;

export function friendlyAuthError(m: string): string {
  if (/invite-only/i.test(m)) return 'Aevigor is invite-only during the beta, and this email is not on the invite list. Join the waitlist at aevigor.com.';
  if (/invalid login/i.test(m)) return 'That email and password do not match.';
  if (/not confirmed/i.test(m)) return 'Please confirm your email first: check your inbox for the link.';
  if (/database error/i.test(m)) return 'This email is not on the invite list yet.';
  return m;
}

// A refused Google sign-up comes back as an error in the address bar
function errorFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#\/?/, ''));
  const e = params.get('error_description');
  if (e) window.history.replaceState(null, '', window.location.pathname);
  return e ? friendlyAuthError(e) : null;
}

export function SignIn() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [error, setError] = useState<string | null>(errorFromUrl);
  const [notice, setNotice] = useState<string | null>(null);
  const up = mode === 'up';

  const schema = z.object({
    email: z.string().trim().email('Enter a valid email address.'),
    password: up ? z.string().min(8, 'At least 8 characters.') : z.string().min(1, 'Enter your password.')
  });
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });

  async function onSubmit(v: z.infer<typeof schema>) {
    setError(null); setNotice(null);
    if (up) {
      const { data, error } = await supabase.auth.signUp({ email: v.email, password: v.password, options: { emailRedirectTo: HOME } });
      if (error) return setError(friendlyAuthError(error.message));
      if (!data.session) setNotice('Almost there: check your email and tap the link to confirm your account.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password });
      if (error) setError(friendlyAuthError(error.message));
    }
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: HOME } });
    if (error) setError(error.message);
  }

  async function forgot() {
    const email = form.getValues('email').trim();
    if (!email) return form.setError('email', { message: 'Type your email first, then tap Forgot password.' });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: HOME });
    if (error) setError(error.message);
    else toast.success('If that email has an account, a reset link is on its way.');
  }

  return (
    <Message title={up ? 'Create your account' : 'Sign in'}>
      <p className="mb-4">Aevigor is invite-only during the beta. Use the email address your invite was sent to.</p>
      {GOOGLE && (
        <>
          <Button variant="secondary" className="w-full bg-white text-neutral-800 hover:bg-white/90" onClick={google}>
            <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
            Continue with Google
          </Button>
          <p className="my-3 text-center text-sm">or with email</p>
        </>
      )}
      <Card>
        <CardContent className="pt-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" autoComplete="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl><Input type="password" autoComplete={up ? 'new-password' : 'current-password'} {...field} /></FormControl>
                  {up && <FormDescription>At least 8 characters.</FormDescription>}
                  <FormMessage />
                </FormItem>
              )} />
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              {notice && <Alert className="border-status-go"><AlertDescription>{notice}</AlertDescription></Alert>}
              <Button type="submit" className="w-full font-mono" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Working…' : up ? 'Create account' : 'Sign in'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-sm">
        {up ? (
          <>Already have an account? <Button variant="link" className="h-auto p-0" onClick={() => setMode('in')}>Sign in</Button></>
        ) : (
          <>New tester? <Button variant="link" className="h-auto p-0" onClick={() => setMode('up')}>Create your account</Button>
            {' · '}<Button variant="link" className="h-auto p-0" onClick={forgot}>Forgot password?</Button></>
        )}
      </p>
      <p className="mt-2 text-center text-sm">
        <a className="text-primary underline" href="/legal/beta-privacy.html">Beta privacy notice</a> · <a className="text-primary underline" href="/legal/beta-terms.html">Beta terms</a>
      </p>
    </Message>
  );
}
