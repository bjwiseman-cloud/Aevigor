import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SubTabs, TRAINING_TABS } from '@/screens/Layout';

const TEXT = {
  performance: { title: 'Performance', body: 'Power curve with medals and W/kg, W′ battery, best efforts, test results and compare, durability by race type, and running equivalents arrive here in the next build.' },
  sessions: { title: 'Sessions', body: 'Pick any ride, run or lift to see its analysis, then compare it with a similar session. Coming in the next build.' }
};

export function TrainingPlaceholder({ page }: { page: keyof typeof TEXT }) {
  const t = TEXT[page];
  return (
    <div className="space-y-4">
      <SubTabs tabs={TRAINING_TABS} />
      <Card><CardHeader className="pb-2"><CardTitle>{t.title}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{t.body}</CardContent></Card>
    </div>
  );
}
