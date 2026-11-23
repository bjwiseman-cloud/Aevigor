import { Arrange } from '@/components/Arrange';
import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useProfile, usePlannedTests } from '@/hooks/data';
import { usePlanData, useSave } from '@/hooks/plan';
import { addDaysIso, EVENT_KINDS, occursOn, shortDate, type EventKind, type PlanEvent } from '@/lib/plan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Chip, Chips, Field } from '@/components/chips';
import { HealthConsent } from '@/components/health';
import { NextTestCard } from '@/screens/Load';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month' | 'quarter';
type Show = 'training' | 'tests' | 'log' | 'appointments';
type Entry = { day: string; time?: string; title: string; show: Show; icon: string; event?: PlanEvent };

const REMIND = [{ m: 1440, label: 'Day before' }, { m: 720, label: 'Evening before' }, { m: 60, label: '1 h before' }, { m: 15, label: '15 min before' }];
const REPEATS = [{ r: null, label: 'Never' }, { r: 'FREQ=MONTHLY', label: 'Monthly' }, { r: 'FREQ=MONTHLY;INTERVAL=3', label: 'Every 3 months' }, { r: 'FREQ=MONTHLY;INTERVAL=6', label: 'Every 6 months' }, { r: 'FREQ=YEARLY', label: 'Yearly' }];

function localParts(iso: string, tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(iso));
  const g = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  return { day: `${g('year')}-${g('month')}-${g('day')}`, time: `${g('hour').replace('24', '00')}:${g('minute')}` };
}
// Local date + time in the person's time zone -> ISO instant
function toInstant(day: string, time: string, tz: string) {
  const guess = new Date(`${day}T${time}:00Z`);
  const p = localParts(guess.toISOString(), tz);
  const diff = (new Date(`${p.day}T${p.time}:00Z`).getTime() - guess.getTime());
  return new Date(guess.getTime() - diff).toISOString();
}

function EventSheet({ open, onOpenChange, ev, tz, today }: { open: boolean; onOpenChange: (o: boolean) => void; ev: PlanEvent | null; tz: string; today: string }) {
  const p = ev ? localParts(ev.starts_at, tz) : { day: addDaysIso(today, 7), time: '09:00' };
  const [kind, setKind] = useState<EventKind>(ev?.kind ?? 'medical');
  const [title, setTitle] = useState(ev?.title ?? '');
  const [day, setDay] = useState(p.day);
  const [time, setTime] = useState(p.time);
  const [location, setLocation] = useState(ev?.location ?? '');
  const [description, setDescription] = useState(ev?.description ?? '');
  const [prep, setPrep] = useState(ev?.prep_notes ?? '');
  const [remind, setRemind] = useState<number[]>(ev?.remind_minutes ?? [1440]);
  const [rrule, setRrule] = useState<string | null>(ev?.rrule ?? null);
  const [external, setExternal] = useState(ev?.on_external_calendars ?? false);
  const save = useSave('events', ['events']);
  const submit = async () => {
    const row = { kind, title: title.trim(), starts_at: toInstant(day, time, tz), location: location || null, description: description || null, prep_notes: prep || null, remind_minutes: remind, rrule, on_external_calendars: external };
    await save.mutateAsync(ev ? { op: 'update', id: ev.id, row } : { op: 'insert', row });
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader><SheetTitle>{ev ? 'Edit event' : 'New appointment, test or event'}</SheetTitle>
          <SheetDescription>Reminders show your title and prep notes in the app.</SheetDescription></SheetHeader>
        <div className="space-y-4">
          <Field label="Type"><Chips>{EVENT_KINDS.map((k) => <Chip key={k.id} on={kind === k.id} onClick={() => setKind(k.id)}>{k.icon} {k.label}</Chip>)}</Chips></Field>
          <Field label="Title"><Input value={title} maxLength={120} placeholder="e.g. Blood work, Dr. Lee, VO2 test" onChange={(e) => setTitle(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
            <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          </div>
          <Field label="Where" hint="clinic, lab or route"><Input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} /></Field>
          <Field label="Description" hint="what it's for, who with"><Textarea value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Prep notes" hint="e.g. fast from 20:00, bring requisition"><Textarea value={prep} maxLength={1000} onChange={(e) => setPrep(e.target.value)} /></Field>
          <Field label="Remind me">
            <Chips>{REMIND.map((r) => <Chip key={r.m} on={remind.includes(r.m)} onClick={() => setRemind(remind.includes(r.m) ? remind.filter((x) => x !== r.m) : [...remind, r.m])}>{r.label}</Chip>)}</Chips>
          </Field>
          <Field label="Repeats"><Chips>{REPEATS.map((r) => <Chip key={r.label} on={rrule === r.r} onClick={() => setRrule(r.r)}>{r.label}</Chip>)}</Chips></Field>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <span className="text-sm">Show on outside calendars<span className="block text-xs text-muted-foreground">Off for medical items unless you choose it</span></span>
            <Switch checked={external} onCheckedChange={setExternal} aria-label="Show on outside calendars" />
          </div>
          <Button className="w-full" onClick={submit} disabled={!title.trim() || save.isPending}>Save</Button>
          {ev && <Button variant="ghost" className="w-full text-destructive" onClick={async () => { await save.mutateAsync({ op: 'delete', id: ev.id }); onOpenChange(false); }}>Delete</Button>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const SHOW: { id: Show; label: string }[] = [{ id: 'training', label: 'Training' }, { id: 'tests', label: 'Tests and races' }, { id: 'log', label: 'My log' }, { id: 'appointments', label: 'Appointments' }];

export function Schedule() {
  const profile = useProfile().data!;
  const d = usePlanData(profile);
  const tests = usePlannedTests(profile);
  const [view, setView] = useState<View>('month');
  const [show, setShow] = useState<Show[]>(['training', 'tests', 'log', 'appointments']);
  const [sheet, setSheet] = useState<{ ev: PlanEvent | null; key: number } | null>(null);
  const tz = profile.time_zone, today = d.today;

  const range = useMemo(() => {
    if (view === 'day') return [today, today];
    if (view === 'week') { const m = addDaysIso(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7)); return [m, addDaysIso(m, 6)]; }
    if (view === 'month') { const f = today.slice(0, 8) + '01'; const n = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7), 0)).getUTCDate(); return [f, f.slice(0, 8) + String(n).padStart(2, '0')]; }
    return [today, addDaysIso(today, 90)];
  }, [view, today]);

  const entries = useMemo(() => {
    const out: Entry[] = [];
    for (const t of tests.data ?? []) if (t.day >= range[0] && t.day <= range[1]) out.push({ day: t.day, title: t.name || t.kind, show: 'tests', icon: '⏱' });
    for (const e of d.events.data ?? []) {
      const p = localParts(e.starts_at, tz);
      const k = EVENT_KINDS.find((x) => x.id === e.kind)!;
      const days: string[] = [];
      if (!e.rrule) days.push(p.day);
      else for (let x = range[0]; x <= range[1]; x = addDaysIso(x, 1)) if (occursOn(e.rrule, p.day, x)) days.push(x);
      for (const day of days) if (day >= range[0] && day <= range[1]) out.push({ day, time: p.time, title: e.title, show: e.kind === 'race' || e.kind === 'fitness_test' ? 'tests' : 'appointments', icon: k.icon, event: e });
    }
    // My log items only in Day and Week views (they would crowd the month grid); monthly-or-rarer items show in every view
    for (const i of d.items.data ?? []) {
      if (!i.active || i.rrule === 'AS_NEEDED') continue;
      const rare = /FREQ=(MONTHLY|YEARLY)/.test(i.rrule);
      if (view !== 'day' && view !== 'week' && !rare) continue;
      for (let x = range[0]; x <= range[1]; x = addDaysIso(x, 1)) if (occursOn(i.rrule, i.start_date, x, i.end_date)) out.push({ day: x, time: i.times[0], title: i.name, show: 'log', icon: '💊' });
    }
    return out.filter((e) => show.includes(e.show)).sort((a, b) => (a.day + (a.time ?? '')).localeCompare(b.day + (b.time ?? '')));
  }, [tests.data, d.events.data, d.items.data, range, show, tz, view]);

  if (!d.on) return <div className="space-y-4"><h1 className="font-serif text-xl font-bold tracking-wide">Calendar</h1><NextTestCard /><HealthConsent profile={profile} /></div>;

  const monthGrid = () => {
    const first = range[0], lead = (new Date(first + 'T12:00:00Z').getUTCDay() + 6) % 7, cells: (string | null)[] = Array(lead).fill(null);
    for (let x = first; x <= range[1]; x = addDaysIso(x, 1)) cells.push(x);
    return (
      <div className="grid grid-cols-7 gap-1 text-xs">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((h, i) => <div key={i} className="text-center text-muted-foreground">{h}</div>)}
        {cells.map((c, i) => (
          <div key={i} className={cn('min-h-[52px] rounded border p-1', !c && 'border-transparent', c === today && 'border-primary')}>
            {c && <><div>{+c.slice(8)}</div>{entries.filter((e) => e.day === c).slice(0, 2).map((e, k) => <div key={k} className="truncate" title={e.title}>{e.icon} {e.title}</div>)}</>}
          </div>
        ))}
      </div>
    );
  };

  const upcoming = entries.filter((e) => e.day >= today);
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-bold tracking-wide">Calendar</h1>
      <Arrange page="schedule" cards={[
        { id: 'next', label: 'Next test', node: <NextTestCard /> },
        { id: 'calendar', label: 'Calendar', node: (
          <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle help="schedule">Calendar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Chips>{(['day', 'week', 'month', 'quarter'] as View[]).map((v) => <Chip key={v} on={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</Chip>)}</Chips>
          <Chips>{SHOW.map((s) => <Chip key={s.id} on={show.includes(s.id)} onClick={() => setShow(show.includes(s.id) ? show.filter((x) => x !== s.id) : [...show, s.id])}>{s.label}</Chip>)}</Chips>
          {view === 'month' ? monthGrid() : (
            <div className="divide-y rounded-md border">
              {entries.length ? entries.map((e, i) => (
                <button key={i} type="button" disabled={!e.event} onClick={() => e.event && setSheet({ ev: e.event, key: Date.now() })} className="flex w-full gap-3 px-3 py-2 text-left text-sm">
                  <span className="w-20 shrink-0 text-muted-foreground">{shortDate(e.day)}{e.time && <><br />{e.time}</>}</span>
                  <span>{e.icon} {e.title}</span>
                </button>
              )) : <p className="p-3 text-sm text-muted-foreground">Nothing in this {view}.</p>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Tests come from your intervals.icu calendar. Google and iPhone calendar sync come with phone alerts.</p>
        </CardContent>
      </Card>
            <Button className="w-full" onClick={() => setSheet({ ev: null, key: Date.now() })}><Plus /> Add appointment, test or event</Button>
          </div>
        ) },
        { id: 'upcoming', label: 'Coming up', node: (
      <Card>
        <CardHeader className="pb-2"><CardTitle>{view === 'quarter' ? 'Coming up in the next 3 months' : `Coming up this ${view}`}</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {upcoming.length ? upcoming.slice(0, 20).map((e, i) => (
            <button key={i} type="button" disabled={!e.event} onClick={() => e.event && setSheet({ ev: e.event, key: Date.now() })} className="block w-full py-2 text-left text-sm">
              <span className="text-muted-foreground">{shortDate(e.day)}{e.time ? ' · ' + e.time : ''}</span> {e.icon} <b>{e.title}</b>
              {e.event?.prep_notes && <span className="block text-xs text-muted-foreground">Prep: {e.event.prep_notes}</span>}
            </button>
          )) : <p className="text-sm text-muted-foreground">Nothing coming up.</p>}
        </CardContent>
      </Card>
        ) }
      ]} />
      {sheet && <EventSheet key={sheet.key} open onOpenChange={(o) => !o && setSheet(null)} ev={sheet.ev} tz={tz} today={today} />}
    </div>
  );
}
