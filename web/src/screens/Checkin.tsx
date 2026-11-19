// Morning check-in, ported from the live app (Apps Script V15-V18): sickness, the wellness answers, mental clarity,
// the optional libido log, caffeine / alcohol / temperature, the soreness & injury body map and comments.
// "Post Activity" is the post-session form.
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { callApi } from '@/lib/api';
import { niceDay, todayIn } from '@/lib/time';
import { useProfile, useTodayCheckin } from '@/hooks/data';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { HelpButton } from '@/components/Help';
import { HelpQ } from '@/components/HelpQ';
import { BodyMapEditor, figureSex, upgradeKeys, type MapMode, type MapValue } from '@/components/BodyMap';
import { cn } from '@/lib/utils';

// intervals.icu stores these answers as 1-4 (1 = best). Soreness comes from the body map.
const QUESTIONS = [
  { key: 'sleep_quality', label: 'Sleep quality', opts: ['Great', 'Good', 'Average', 'Poor'], help: 'How well you slept, in your own words. Part of Feel (out of 25), which is weighted most in the status.' },
  { key: 'fatigue', label: 'Fatigue', opts: ['Low', 'Average', 'High', 'Extreme'], help: 'How tired your body feels this morning. Part of Feel. Extreme sets Go easy on its own.' },
  { key: 'stress', label: 'Stress', opts: ['Low', 'Average', 'High', 'Extreme'], help: 'Life and work stress, not training. Part of Feel.' },
  { key: 'mood', label: 'Mood', opts: ['Great', 'Good', 'OK', 'Grumpy'], help: 'Your mood this morning. Part of Feel.' },
  { key: 'motivation', label: 'Motivation', opts: ['Extreme', 'High', 'Average', 'Low'], help: 'How keen you are to train. Saved to intervals.icu and shown on Trends; it is not part of the Feel score.' }
] as const;
const CLARITY = ['Very foggy', 'Foggy', 'Normal', 'Clear', 'Very sharp'];
const LIBIDO = ['None', 'Very low', 'Low', 'Slightly low', 'Moderate', 'Slightly high', 'High', 'Very high'];
const MORE = [
  { k: 'caffeine', label: 'Caffeine yesterday', unit: 'mg', min: 0, max: 1500, step: 10, hint: '1 coffee ≈ 95 mg, espresso ≈ 65 mg, tea ≈ 45 mg' },
  { k: 'alcohol', label: 'Alcohol yesterday', unit: 'drinks', min: 0, max: 30, step: 0.5, hint: '1 standard drink = 1 beer, 1 glass of wine or 1 shot' },
  { k: 'body_temp', label: 'Body temperature this morning', unit: '°C', min: 34, max: 42, step: 0.1, hint: 'Optional. A log only: it does not change the status' }
] as const;

function Note({ children }: { children: ReactNode }) { return <p className="text-xs text-muted-foreground">{children}</p>; }
function Q({ title, help, extra, children }: { title: ReactNode; help?: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <Card><CardContent className="space-y-2 py-3">
      <div className="flex items-center justify-between gap-2"><b>{title}</b>{help && <HelpQ text={help} />}</div>
      {extra}{children}
    </CardContent></Card>
  );
}
function Opts({ opts, value, onPick, cols }: { opts: string[]; value: number | null | undefined; onPick: (v: number | null) => void; cols: number }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {opts.map((o, i) => (
        <button key={o} type="button" onClick={() => onPick(value === i + 1 ? null : i + 1)}
          className={cn('rounded-md border px-1 py-2 text-xs leading-tight', value === i + 1 ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}>{o}</button>
      ))}
    </div>
  );
}

export function CheckinSeg({ on }: { on: 'morning' | 'session' }) {
  const cls = (x: boolean) => cn('flex-1 rounded-md px-3 py-1.5 text-center text-sm', x ? 'bg-primary text-primary-foreground' : 'text-muted-foreground');
  return (
    <div className="mb-3 flex gap-1 rounded-lg border bg-card p-1">
      <Link to="/checkin" className={cls(on === 'morning')}>Morning</Link>
      <Link to="/checkin/session" className={cls(on === 'session')}>Post Activity</Link>
    </div>
  );
}

type V = Record<string, number | null>;
type BodyMap = Record<string, { sore?: number; injury?: number }>;
const MORNING_MODES: MapMode[] = [{ id: 'sore', label: 'Sore', scale: 'sore', target: 'muscle' }, { id: 'injury', label: 'Injured', scale: 'injury', target: 'muscle' }];
function fromBody(b: BodyMap | null | undefined): MapValue {
  const v: MapValue = { sore: {}, injury: {} };
  for (const [k, x] of Object.entries(upgradeKeys(b))) {
    if (x.sore) v.sore[k] = x.sore;
    if (x.injury && x.injury >= 2) v.injury[k] = x.injury;
  }
  return v;
}
function toBody(v: MapValue): BodyMap {
  const out: BodyMap = {};
  for (const [k, n] of Object.entries(v.sore ?? {})) (out[k] ??= {}).sore = n;
  for (const [k, n] of Object.entries(v.injury ?? {})) (out[k] ??= {}).injury = n;
  return out;
}

export function CheckinPage() {
  const profile = useProfile().data!;
  const existing = useTodayCheckin(profile);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const day = todayIn(profile.time_zone);
  const [v, setV] = useState<V>({});
  const [sick, setSick] = useState<'No' | 'Mild' | 'Yes'>('No');
  const [body, setBody] = useState<MapValue>({ sore: {}, injury: {} });
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState<Record<string, string>>({});
  const [libOn, setLibOn] = useState(!!profile.libido_log);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ex = existing.data;
    if (!ex) return;
    const nv: V = {};
    QUESTIONS.forEach((q) => { nv[q.key] = ex[q.key] ?? null; });
    nv.clarity = ex.clarity ?? null; nv.libido = ex.libido ?? null;
    setV(nv); setSick(ex.sick ?? 'No'); setBody(fromBody(ex.body)); setNotes(ex.notes ?? '');
    setMore(Object.fromEntries(MORE.map((m) => [m.k, ex[m.k] == null ? '' : String(ex[m.k])])));
  }, [existing.data]);
  useEffect(() => { setLibOn(!!profile.libido_log); }, [profile.libido_log]);

  const pick = (k: string) => (x: number | null) => setV({ ...v, [k]: x });
  const answered = ['sleep_quality', 'fatigue', 'stress', 'mood'].filter((k) => v[k]).length + 1; // + soreness from the body map

  async function libido(on: boolean, deleteAll = false) {
    try {
      const r = await callApi<{ deleted: number }>('libido', deleteAll ? { on: false, deleteAll: true } : { on });
      setLibOn(on && !deleteAll);
      if (!on || deleteAll) setV({ ...v, libido: null });
      await qc.invalidateQueries({ queryKey: ['profile'] });
      toast.success(deleteAll ? `Deleted ${r.deleted} entries` : on ? 'Libido log on' : 'Libido log off');
    } catch (e) { toast.error((e as Error).message); }
  }

  async function save() {
    if (answered < 3) { toast.error('Please answer at least 2 of sleep, fatigue, stress and mood so your Feel score can be worked out.'); return; }
    const req: Record<string, unknown> = { day, sick, notes, body: toBody(body), clarity: v.clarity ?? null, libido: libOn ? v.libido ?? null : null };
    QUESTIONS.forEach((q) => { req[q.key] = v[q.key] ?? null; });
    for (const m of MORE) {
      const t = (more[m.k] ?? '').trim();
      if (t && (Number(t) < m.min || Number(t) > m.max)) { toast.error(`${m.label}: ${m.min} to ${m.max} ${m.unit}`); return; }
      req[m.k] = t === '' ? null : Number(t);
    }
    setSaving(true);
    try {
      const r = await callApi<{ copied?: boolean }>('checkin', req);
      toast.success(r.copied ? 'Saved and copied to intervals.icu' : 'Saved');
      await qc.invalidateQueries();
      navigate('/today');
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  return (
    <div className="space-y-3">
      <CheckinSeg on="morning" />
      <p className="text-center font-mono text-xs text-muted-foreground">{niceDay(day)}{existing.data ? ' · saved, you can change it' : ''} · saves to intervals.icu</p>

      <Q title="Feeling sick?" help="Mild = above the neck (stuffy nose, sore throat). Yes = below the neck (fever, chest, body aches, stomach). Sickness overrides the other signals: Yes = Go easy, Mild = one step lower.">
        <Opts cols={3} opts={['No', 'Mild · above the neck', 'Yes · below the neck']} value={['No', 'Mild', 'Yes'].indexOf(sick) + 1} onPick={(x) => setSick((['No', 'Mild', 'Yes'] as const)[(x ?? 1) - 1])} />
      </Q>

      {QUESTIONS.map((q) => (
        <Q key={q.key} title={q.label} help={q.help}><Opts cols={4} opts={[...q.opts]} value={v[q.key]} onPick={pick(q.key)} /></Q>
      ))}

      <Q title="Mental clarity" help="How clear your thinking feels, 1 very foggy to 5 very sharp. A log only: it does not change the status.">
        <Opts cols={5} opts={CLARITY} value={v.clarity} onPick={pick('clarity')} />
      </Q>

      <Q title={<>Libido <span className="text-xs font-normal text-muted-foreground">· optional</span></>} help="Optional private log, 0-7, saved to your account and intervals.icu and charted on Trends. It does not change the status. Turn it off or delete every entry at any time. Not medical advice.">
        {!libOn ? (
          <>
            <Note>Off</Note>
            <Button type="button" variant="outline" size="sm" onClick={() => libido(true)}>Turn on libido log</Button>
          </>
        ) : (
          <>
            <p className="text-sm">{v.libido == null ? 'Not logged today' : `Today: ${v.libido} · ${LIBIDO[v.libido]}`}</p>
            <Slider min={0} max={7} step={1} value={[v.libido ?? 4]} onValueChange={([x]) => setV({ ...v, libido: x })} aria-label="Libido" className={v.libido == null ? 'opacity-40' : ''} />
            <div className="flex justify-between text-[11px] text-muted-foreground"><span>0 None</span><span>4 Moderate</span><span>7 Very high</span></div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setV({ ...v, libido: null })}>Don't log today</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => libido(false)}>Turn off</Button>
              <AlertDialog>
                <AlertDialogTrigger asChild><Button type="button" variant="outline" size="sm">Delete all libido entries</Button></AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Delete every libido entry?</AlertDialogTitle>
                    <AlertDialogDescription>This removes every libido entry from Aevigor and from your intervals.icu, and turns the log off. It cannot be undone.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => libido(false, true)}>Delete all</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </Q>

      <Accordion type="single" collapsible defaultValue={MORE.some((m) => existing.data?.[m.k] != null) ? 'm' : undefined} className="rounded-lg border bg-card px-4">
        <AccordionItem value="m" className="border-b-0">
          <AccordionTrigger className="py-3 text-sm"><span><b>Caffeine · alcohol · temperature</b> <span className="text-xs text-muted-foreground">· optional</span></span></AccordionTrigger>
          <AccordionContent className="space-y-3">
            {MORE.map((m) => (
              <div key={m.k} className="space-y-1">
                <div className="flex items-center justify-between gap-2"><label className="text-xs font-semibold uppercase tracking-wide" htmlFor={`ml_${m.k}`}>{m.label} ({m.unit})</label><HelpQ text={m.hint} /></div>
                <Input id={`ml_${m.k}`} type="number" inputMode="decimal" min={m.min} max={m.max} step={m.step} placeholder="Not logged"
                  value={more[m.k] ?? ''} onChange={(e) => setMore({ ...more, [m.k]: e.target.value })} />
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Q title="Soreness and injury" help="Pick Sore or Injured, tap a muscle, then set the level. Swipe across the body or tap Front / Back to turn. The highest sore level is saved as Soreness (part of Feel), the highest injury level as Injury, and the muscles go into your intervals.icu comments.">
        <BodyMapEditor sex={figureSex(profile.sex)} modes={MORNING_MODES} value={body} onChange={setBody} />
      </Q>

      <Q title="Comments">
        <Textarea maxLength={2000} placeholder="Anything else worth remembering?" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Q>

      <Button type="button" className="w-full" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save check-in'}</Button>
      <p className="text-center text-xs text-muted-foreground">Training guidance, not medical advice. <HelpButton topic="feel" /></p>
    </div>
  );
}
