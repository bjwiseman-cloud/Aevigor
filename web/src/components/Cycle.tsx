// Cycle tracking UI: the one-tap "Turn on" card, today's estimated phase with quick logging, and Settings controls.
// Log only: no fertility, ovulation or pregnancy predictions, no advice. "Not medical advice" is shown.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useProfile } from '@/hooks/data';
import { useCycle } from '@/hooks/cycle';
import { todayIn } from '@/lib/time';
import { FLOWS, LIFE_STAGES, MENO_SYMPTOMS, PHASES, SYMPTOMS, phaseOn, showsPhases, type CycleDay } from '@/lib/cycle';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Chip, Chips } from '@/components/chips';
import { HelpQ } from '@/components/HelpQ';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const err = (e: unknown) => toast.error((e as Error).message);

// Today: shown for Female (and Prefer not to say once turned on)
export function CycleCard() {
  const p = useProfile().data!;
  const c = useCycle(p);
  const today = todayIn(p.time_zone);
  if (!c.loaded) return null;
  if (!c.on) {
    if (p.sex !== 'female' || c.settings) return null; // turned off on purpose, or not offered
    return (
      <Card><CardContent className="space-y-2 pt-5 text-sm">
        <p className="font-semibold">Cycle tracking</p>
        <p className="text-muted-foreground">Log period days and symptoms, and see estimated phases shaded on your Trends charts. Optional, private, and you can turn it off or delete it at any time.</p>
        {c.health
          ? <Button size="sm" onClick={() => c.saveSettings({ tracking: true, life_stage: 'regular' }).catch(err)}>Turn on cycle tracking</Button>
          : <p>It is part of the health log, which you turn on in <Link className="text-primary underline" to="/plan/log">Plan</Link>.</p>}
      </CardContent></Card>
    );
  }
  const ph = showsPhases(c.settings) ? phaseOn(today, c.days) : null;
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base">Cycle <HelpQ text="Phases are estimates from the period days you log (average cycle length, Ovulatory estimated as cycle length minus 14 days). They are not predictions and not medical advice." /></CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {ph ? <p className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: PHASES[ph.phase].color }} />Day {ph.cycleDay} · {PHASES[ph.phase].label}</p>
          : showsPhases(c.settings) ? <p className="text-muted-foreground">Log your next period day to see the estimated phase.</p> : null}
        <DayLog day={today} />
        <p className="text-xs text-muted-foreground">Not medical advice.</p>
      </CardContent>
    </Card>
  );
}

// Period today? + flow + symptom chips for one day
export function DayLog({ day, compact }: { day: string; compact?: boolean }) {
  const p = useProfile().data!;
  const c = useCycle(p);
  const saved = c.days.find((d) => d.day === day);
  const cur: CycleDay = saved ?? { day, period: false, flow: null, symptoms: [], note: null };
  if (!c.on) return null;
  const save = (v: Partial<CycleDay>) => c.saveDay({ ...cur, ...v }).catch(err);
  const syms = c.settings?.life_stage === 'menopause' || c.settings?.life_stage === 'perimenopause' ? [...MENO_SYMPTOMS, ...SYMPTOMS] : SYMPTOMS;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2"><span className="font-medium">Period today?</span>
        <Chips><Chip on={cur.period} onClick={() => save({ period: true })}>Yes</Chip><Chip on={!cur.period && !!saved} onClick={() => save({ period: false, flow: null })}>No</Chip></Chips></div>
      {cur.period && <Chips>{FLOWS.map((f) => <Chip key={f} on={cur.flow === f} onClick={() => save({ flow: cur.flow === f ? null : f })}>{cap(f)}</Chip>)}</Chips>}
      {!compact && <Chips>{syms.map((s) => <Chip key={s} on={cur.symptoms.includes(s)} onClick={() => save({ symptoms: cur.symptoms.includes(s) ? cur.symptoms.filter((x) => x !== s) : [...cur.symptoms, s] })}>{s}</Chip>)}</Chips>}
    </div>
  );
}

// Settings > Women's health
export function CycleSettingsSection() {
  const p = useProfile().data!;
  const c = useCycle(p);
  const [contra, setContra] = useState<string | null>(null);
  if (!c.health) return <p className="text-muted-foreground">Cycle tracking is part of the health log. Turn the health log on in <Link className="text-primary underline" to="/plan/log">Plan</Link> first.</p>;
  const s = c.settings;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><span className="font-medium">Cycle tracking</span>
        <Chips><Chip on={!!s?.tracking} onClick={() => c.saveSettings({ tracking: true, life_stage: s?.life_stage ?? 'regular' }).catch(err)}>On</Chip><Chip on={!!s && !s.tracking} onClick={() => c.saveSettings({ tracking: false }).catch(err)}>Off</Chip></Chips></div>
      {s?.tracking && <>
        <div className="space-y-1"><div className="font-medium">Life stage</div>
          <Chips>{LIFE_STAGES.map(([k, l]) => <Chip key={k} on={s.life_stage === k} onClick={() => c.saveSettings({ life_stage: k }).catch(err)}>{l}</Chip>)}</Chips>
          <p className="text-xs text-muted-foreground">Estimated phases show only for regular, irregular or perimenopause cycles.</p></div>
        <div className="space-y-1"><div className="font-medium">Contraception (log only)</div>
          <div className="flex gap-2"><Input placeholder="e.g. none, pill, IUD" value={contra ?? s.contraception ?? ''} onChange={(e) => setContra(e.target.value.slice(0, 60))} />
            <Button variant="outline" disabled={contra === null} onClick={() => c.saveSettings({ contraception: contra || null }).then(() => setContra(null)).catch(err)}>Save</Button></div>
          <Chips><span className="text-xs text-muted-foreground">Hormonal?</span>{([[true, 'Yes'], [false, 'No']] as const).map(([v, l]) => <Chip key={l} on={s.hormonal === v} onClick={() => c.saveSettings({ hormonal: s.hormonal === v ? null : v }).catch(err)}>{l}</Chip>)}</Chips></div>
      </>}
      <p className="text-xs text-muted-foreground">Private to you, never shared. Delete it any time with Delete my health data. Not medical advice.</p>
    </div>
  );
}
