import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callApi } from '@/lib/api';
import { niceDay, todayIn } from '@/lib/time';
import { useProfile, useTodayCheckin } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';

// intervals.icu stores these answers as 1-4 (1 = best)
const QUESTIONS = [
  { key: 'sleep_quality', label: '🌙 Sleep quality', opts: ['Great', 'Good', 'Average', 'Poor'] },
  { key: 'fatigue', label: '🔋 Fatigue', opts: ['Low', 'Average', 'High', 'Extreme'] },
  { key: 'soreness', label: '💪 Muscle soreness', opts: ['Low', 'Average', 'High', 'Extreme'] },
  { key: 'stress', label: '🧠 Stress', opts: ['Low', 'Average', 'High', 'Extreme'] },
  { key: 'mood', label: '😀 Mood', opts: ['Great', 'Good', 'OK', 'Grumpy'] },
  { key: 'motivation', label: '🔥 Motivation', opts: ['Extreme', 'High', 'Average', 'Low'] }
] as const;
type QKey = (typeof QUESTIONS)[number]['key'];

const answer = z.string().optional();
const schema = z.object({
  sleep_quality: answer, fatigue: answer, soreness: answer, stress: answer, mood: answer, motivation: answer,
  sick: z.enum(['No', 'Mild', 'Yes']).optional(),
  notes: z.string().max(2000).optional()
}).refine((v) => QUESTIONS.filter((q) => v[q.key]).length >= 3, {
  message: 'Please answer at least 3 questions so your Feel score can be worked out.', path: ['notes']
});
type Values = z.infer<typeof schema>;

export function CheckinPage() {
  const profile = useProfile().data!;
  const existing = useTodayCheckin(profile);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const day = todayIn(profile.time_zone);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { notes: '' } });

  useEffect(() => {
    const ex = existing.data;
    if (!ex) return;
    const v: Values = { notes: ex.notes ?? '', sick: ex.sick ?? undefined };
    QUESTIONS.forEach((q) => { if (ex[q.key]) v[q.key] = String(ex[q.key]); });
    form.reset(v);
  }, [existing.data, form]);

  async function onSubmit(v: Values) {
    const body: Record<string, unknown> = { day, sick: v.sick ?? null, notes: v.notes ?? '' };
    QUESTIONS.forEach((q) => { body[q.key] = v[q.key] ? Number(v[q.key]) : null; });
    try {
      const r = await callApi<{ copied?: boolean }>('checkin', body);
      toast.success(r.copied ? 'Saved and copied to intervals.icu' : 'Saved');
      await qc.invalidateQueries();
      navigate('/today');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <h1 className="font-serif text-xl font-bold tracking-wide">Morning check-in</h1>
      <p className="mb-4 text-sm text-muted-foreground">{niceDay(day)}{existing.data && ' · saved, you can change it'}. Answer how you feel right now.</p>
      <Card>
        <CardContent className="pt-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {QUESTIONS.map((q) => (
                <FormField key={q.key} control={form.control} name={q.key as QKey} render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base">{q.label}</FormLabel>
                    <FormControl>
                      <ToggleGroup type="single" variant="outline" className="grid grid-cols-4" value={field.value ?? ''} onValueChange={(x) => field.onChange(x || undefined)}>
                        {q.opts.map((o, i) => <ToggleGroupItem key={o} value={String(i + 1)} className="text-xs">{o}</ToggleGroupItem>)}
                      </ToggleGroup>
                    </FormControl>
                  </FormItem>
                )} />
              ))}
              <FormField control={form.control} name="sick" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-base">🤒 Feeling sick?</FormLabel>
                  <FormControl>
                    <ToggleGroup type="single" variant="outline" className="grid grid-cols-3" value={field.value ?? ''} onValueChange={(x) => field.onChange(x || undefined)}>
                      <ToggleGroupItem value="No" className="text-xs">No</ToggleGroupItem>
                      <ToggleGroupItem value="Mild" className="h-auto py-2 text-xs">Mild · above the neck</ToggleGroupItem>
                      <ToggleGroupItem value="Yes" className="h-auto py-2 text-xs">Yes · below the neck</ToggleGroupItem>
                    </ToggleGroup>
                  </FormControl>
                  <FormDescription>Above the neck: runny nose, sore throat. Below the neck: fever, chest, aches, stomach.</FormDescription>
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel>Notes (optional)</FormLabel><FormControl><Textarea maxLength={2000} {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Saving…' : 'Save check-in'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </>
  );
}
