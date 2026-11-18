import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { CONSENT_VERSION } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Message } from './Message';

export function Consent() {
  const { session } = useAuth();
  const qc = useQueryClient();
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function agree() {
    if (!c1 || !c2) return setError('Please tick both boxes to continue.');
    setBusy(true);
    const { error } = await supabase.from('profiles')
      .update({ consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION }).eq('user_id', session!.user.id);
    setBusy(false);
    if (error) return setError(error.message);
    qc.invalidateQueries({ queryKey: ['profile'] });
  }

  return (
    <Message title="Before you start">
      <Card className="text-foreground">
        <CardContent className="space-y-4 pt-5 text-sm">
          <section><CardTitle className="mb-2">What Aevigor stores</CardTitle>
            <ul className="list-disc space-y-1 pl-5">
              <li>Your email and name.</li>
              <li>From your intervals.icu account: HRV, resting heart rate, sleep, and your recent and planned workouts.</li>
              <li>Your daily check-in answers, including whether you feel sick.</li>
              <li>Your intervals.icu API key, encrypted.</li>
            </ul></section>
          <section><CardTitle className="mb-2">Why</CardTitle>
            <p>Only to work out your daily training status and show it to you. Your data is not sold, shared or used for ads.</p></section>
          <section><CardTitle className="mb-2">Where and who</CardTitle>
            <p>Stored with Supabase in Canada. Each tester can only see their own data. Ben (who runs Aevigor) can technically see stored data in the database, and will only look to fix a problem you report.</p></section>
          <section><CardTitle className="mb-2">Your choices</CardTitle>
            <p>Disconnect intervals.icu or delete your account and all your data at any time in Settings.</p></section>
          <p className="text-muted-foreground">Full details: <a className="text-primary underline" href="/legal/beta-privacy.html" target="_blank">Beta privacy notice</a> · <a className="text-primary underline" href="/legal/beta-terms.html" target="_blank">Beta terms</a></p>
          <div className="flex items-start gap-3">
            <Checkbox id="c1" checked={c1} onCheckedChange={(v) => setC1(v === true)} className="mt-0.5" />
            <Label htmlFor="c1" className="leading-snug">I have read the beta privacy notice and terms, and I agree to Aevigor storing and using my health and training data as described.</Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox id="c2" checked={c2} onCheckedChange={(v) => setC2(v === true)} className="mt-0.5" />
            <Label htmlFor="c2" className="leading-snug">I understand Aevigor gives training guidance, not medical advice, and this is an early test version that may have mistakes.</Label>
          </div>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <Button className="w-full font-mono" onClick={agree} disabled={busy}>I agree</Button>
          <Button variant="outline" className="w-full" onClick={() => supabase.auth.signOut()}>Not now, sign out</Button>
        </CardContent>
      </Card>
    </Message>
  );
}
