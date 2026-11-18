import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Profile } from '@/lib/types';

export const NOT_MEDICAL = 'A personal log. Aevigor does not interpret results or suggest doses. Not medical advice.';

// Separate opt-in for health data (PIPEDA / Alberta PIPA): required before My log, Records or blood pressure.
export function HealthConsent({ profile }: { profile: Profile }) {
  const qc = useQueryClient();
  const accept = async () => {
    const { error } = await supabase.from('profiles').update({ health_consent_at: new Date().toISOString() }).eq('user_id', profile.user_id);
    if (error) toast.error(error.message); else { toast.success('Health log turned on'); qc.invalidateQueries({ queryKey: ['profile'] }); }
  };
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>Turn on your health log</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>My log, Records and blood pressure keep health information: what you take, your appointments, lab results, scans and readings.</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Only you can see it. It is never shared, sold or used for ads.</li>
          <li>It is optional. You can delete all of it any time from Settings.</li>
          <li>Aevigor only logs and charts what you enter. It does not interpret results, suggest doses or give medical advice.</li>
        </ul>
        <Button className="w-full" onClick={accept}>I agree, turn it on</Button>
      </CardContent>
    </Card>
  );
}
