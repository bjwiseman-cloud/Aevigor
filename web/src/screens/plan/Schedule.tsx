// Calendar tab (Ben 2026-11-24). Order: Calendar, Coming up this week, Tests this week, Coming up this month.
// Four kinds of entry, each with its own colour and filter chip: Training, Tests, Races, Appointments & events.
// Views: Day (24-hour timeline from 5 AM) · Week (Sun-Sat, AM and PM each day) · Month · Quarter (3 months of dots).
// Tap a day or a time to add something there (pre-filled), or "+" under the calendar. "My log" in the add form opens
// My log's own Add an item screen. Training, tests and races do not need the health opt-in; appointments do.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Arrange } from '@/components/Arrange';
import { useCalendar, useDailyLoad, usePlannedTests, useProfile } from '@/hooks/data';
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
import { NextTestCard, daysAway, weekOf } from '@/screens/Load';
import { ResultPromptCard } from '@/components/Results';
import { cn } from '@/lib/utils';

type View = 'day' | 'week' | 'month' | 'quarter';
// Ben 2026-11-24: three types only. Events = races and tests (and intervals.icu events); Appointments = medical, lab, physio, other.
export type CalType = 'training' | 'events' | 'appointments';
type Entry = { day: string; time?: string; title: string; sub?: string; type: CalType; icon: string; event?: PlanEvent; done?: boolean };

export const CAL_TYPES: { id: CalType; label: string; add: string; icon: string; dot: string; tile: string }[] = [
  { id: 'training', label: 'Training', add: 'Training', icon: '🚴', dot: '#22C55E', tile: 'from-emerald-400 to-teal-500' },
  { id: 'events', label: 'Events', add: 'Event', icon: '🏁', dot: '#FF2E63', tile: 'from-[#FF6B00] to-[#FF2E63]' },
  { id: 'appointments', label: 'Appointments', add: 'Appointment', icon: '📅', dot: '#00B8FF', tile: 'from-sky-400 to-blue-600' }
];
const look = (t: CalType) => CAL_TYPES.find((x) => x.id === t)!;
const typeOfKind = (k: EventKind): CalType => (k === 'training' ? 'training' : k === 'fitness_test' || k === 'race' ? 'events' : 'appointments');
const EVENT_SUB: { id: EventKind; label: string; icon: string }[] = [{ id: 'race', label: 'Race', icon: '🏁' }, { id: 'fitness_test', label: 'Test', icon: '⏱' }];
const APPT_KINDS = EVENT_KINDS.filter((k) => ['medical', 'lab', 'physio', 'other'].includes(k.id));
const SPORT: Record<string, [string, string]> = { ride: ['🚴', 'Ride'], run: ['🏃', 'Run'], WeightTraining: ['🏋️', 'Lifting'], Badminton: ['🏸', 'Badminton'], Swim: ['🏊', 'Swim'] };
const sport = (k: string) => SPORT[k] ?? ['💪', k.replace(/([a-z])([A-Z])/g, '$1 $2')];

const REMIND = [{ m: 1440, label: 'Day before' }, { m: 720, label: 'Evening before' }, { m: 60, label: '1 h before' }, { m: 15, label: '15 min before' }];
const REPEATS = [{ r: null, label: 'Never' }, { r: 'FREQ=WEEKLY', label: 'Weekly' }, { r: 'FREQ=MONTHLY', label: 'Monthly' }, { r: 'FREQ=MONTHLY;INTERVAL=3', label: 'Every 3 months' }, { r: 'FREQ=MONTHLY;INTERVAL=6', label: 'Every 6 months' }, { r: 'FREQ=YEARLY', label: 'Yearly' }];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DOW_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dowOf = (d: string) => new Date(d + 'T12:00:00Z').getUTCDay();   // Sunday 0
const sundayOf = (d: string) => addDaysIso(d, -dowOf(d));
const monthStart = (d: string) => d.slice(0, 8) + '01';
const addMonths = (d: string, n: number) => { const x = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 + n, 1)); return x.toISOString().slice(0, 10); };
const monthEnd = (d: string) => addDaysIso(addMonths(monthStart(d), 1), -1);
const hourLabel = (h: number) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

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

// ---------- All calendar entries between two days ----------
function useEntries(from: string, to: string) {
  const p = useProfile().data!;
  const d = usePlanData(p), tests = usePlannedTests(p), cal = useCalendar(p), load = useDailyLoad(p);
  const tz = p.time_zone, today = d.today;
  const entries = useMemo(() => {
    const out: Entry[] = [];
    // Training: what intervals.icu has planned (future) or what was done (past), per sport per day
    for (const r of load.data ?? []) {
      if (r.day < from || r.day > to) continue;
      const [ic, nm] = sport(r.sport), past = r.day < today || (r.day === today && r.actual > 0);
      const v = Math.round(past ? r.actual : r.planned);
      if (v > 0) out.push({ day: r.day, title: nm, sub: past ? `${v} load done` : `${v} load planned`, type: 'training', icon: ic, done: past });
    }
    for (const t of tests.data ?? []) if (t.day >= from && t.day <= to) out.push({ day: t.day, title: t.name || t.kind, sub: t.kind, type: 'events', icon: '⏱' });
    for (const c of cal.data ?? []) {
      if (c.day < from || c.day > to) continue;
      if (/^Race/.test(c.kind)) out.push({ day: c.day, title: c.name || c.kind, sub: c.kind, type: 'events', icon: '🏁' });
      else if (c.kind === 'Event') out.push({ day: c.day, title: c.name || 'Event', sub: 'intervals.icu', type: 'events', icon: '📌' });
    }
    for (const e of d.events.data ?? []) {
      const lp = localParts(e.starts_at, tz), k = EVENT_KINDS.find((x) => x.id === e.kind);
      const days: string[] = [];
      if (!e.rrule) days.push(lp.day);
      else for (let x = from; x <= to; x = addDaysIso(x, 1)) if (occursOn(e.rrule, lp.day, x)) days.push(x);
      for (const day of days) if (day >= from && day <= to) out.push({ day, time: lp.time, title: e.title, sub: e.location ?? k?.label, type: typeOfKind(e.kind), icon: k?.icon ?? '📌', event: e });
    }
    return out.sort((a, b) => (a.day + (a.time ?? '')).localeCompare(b.day + (b.time ?? '')));
  }, [load.data, tests.data, cal.data, d.events.data, from, to, today, tz]);
  return { entries, today, tz, health: d.on, logItems: d.items.data ?? [] };
}

// ---------- Add / edit sheet ----------
type AddType = CalType | 'log';
function EventSheet({ open, onOpenChange, ev, tz, today, startDay, startTime }: { open: boolean; onOpenChange: (o: boolean) => void; ev: PlanEvent | null; tz: string; today: string; startDay?: string; startTime?: string }) {
  const profile = useProfile().data!;
  const nav = useNavigate();
  const p = ev ? localParts(ev.starts_at, tz) : { day: startDay ?? today, time: startTime ?? '09:00' };
  const [type, setType] = useState<AddType>(ev ? typeOfKind(ev.kind) : 'appointments');
  const [appt, setAppt] = useState<EventKind>(ev && typeOfKind(ev.kind) === 'appointments' ? ev.kind : 'medical');
  const [evk, setEvk] = useState<EventKind>(ev && typeOfKind(ev.kind) === 'events' ? ev.kind : 'race');
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
  const kind: EventKind = type === 'training' ? 'training' : type === 'events' ? evk : appt;
  const needsHealth = type === 'appointments' && !profile.health_consent_at;
  const submit = async () => {
    const row = { kind, title: title.trim(), starts_at: toInstant(day, time, tz), location: location || null, description: description || null, prep_notes: prep || null, remind_minutes: remind, rrule, on_external_calendars: external };
    await save.mutateAsync(ev ? { op: 'update', id: ev.id, row } : { op: 'insert', row });
    onOpenChange(false);
  };
  const types: { id: AddType; label: string; icon: string }[] = [...CAL_TYPES.map((t) => ({ id: t.id as AddType, label: t.add, icon: t.icon })), { id: 'log', label: 'My log', icon: '💊' }];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader><SheetTitle className="font-display text-2xl font-extrabold uppercase italic">{ev ? 'Edit' : 'Add to calendar'}</SheetTitle>
          <SheetDescription>{shortDate(day)}{time ? ` · ${time}` : ''}. Reminders show your title and prep notes.</SheetDescription></SheetHeader>
        <div className="space-y-4">
          <Field label="Type"><Chips>{types.filter((t) => !ev || t.id !== 'log').map((t) => <Chip key={t.id} on={type === t.id} onClick={() => setType(t.id)}>{t.icon} {t.label}</Chip>)}</Chips></Field>
          {type === 'log' ? (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>My log items (supplements, medications, meals) have their own form with repeats and reminders.</p>
              <Button className="w-full" onClick={() => { onOpenChange(false); nav(`/checkin/log?add=1&day=${day}&time=${time}`); }}>Open My log · Add an item</Button>
            </div>
          ) : needsHealth ? (
            <div className="space-y-2"><p className="text-sm text-muted-foreground">Appointments are kept with your private health log, which needs its own opt-in first. Training, tests and races do not.</p><HealthConsent profile={profile} /></div>
          ) : (<>
            {type === 'events' && <Field label="Kind"><Chips>{EVENT_SUB.map((k) => <Chip key={k.id} on={evk === k.id} onClick={() => setEvk(k.id)}>{k.icon} {k.label}</Chip>)}</Chips></Field>}
            {type === 'appointments' && <Field label="Kind"><Chips>{APPT_KINDS.map((k) => <Chip key={k.id} on={appt === k.id} onClick={() => setAppt(k.id)}>{k.icon} {k.label}</Chip>)}</Chips></Field>}
            <Field label="Title"><Input value={title} maxLength={120} placeholder={type === 'training' ? 'e.g. Group ride' : type === 'events' ? (evk === 'race' ? 'e.g. Gravel 90 km' : 'e.g. FTP test') : 'e.g. Blood work, Dr. Lee'} onChange={(e) => setTitle(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Date"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
              <Field label="Time"><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
            </div>
            <Field label="Where" hint="clinic, lab or route"><Input value={location} maxLength={200} onChange={(e) => setLocation(e.target.value)} /></Field>
            <Field label="Description"><Textarea value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Prep notes" hint={type === 'appointments' ? 'e.g. fast from 20:00' : 'e.g. fresh legs, same route'}><Textarea value={prep} maxLength={1000} onChange={(e) => setPrep(e.target.value)} /></Field>
            <Field label="Remind me"><Chips>{REMIND.map((r) => <Chip key={r.m} on={remind.includes(r.m)} onClick={() => setRemind(remind.includes(r.m) ? remind.filter((x) => x !== r.m) : [...remind, r.m])}>{r.label}</Chip>)}</Chips></Field>
            <Field label="Repeats"><Chips>{REPEATS.map((r) => <Chip key={r.label} on={rrule === r.r} onClick={() => setRrule(r.r)}>{r.label}</Chip>)}</Chips></Field>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <span className="text-sm">Show on outside calendars<span className="block text-xs text-muted-foreground">Off for medical items unless you choose it</span></span>
              <Switch checked={external} onCheckedChange={setExternal} aria-label="Show on outside calendars" />
            </div>
            <Button className="w-full" onClick={submit} disabled={!title.trim() || save.isPending}>Save</Button>
            {ev && <Button variant="ghost" className="w-full text-destructive" onClick={async () => { await save.mutateAsync({ op: 'delete', id: ev.id }); onOpenChange(false); }}>Delete</Button>}
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// One row in a list: coloured icon square, title, subtitle and a "when" pill (Race Day list look)
export function CalRow({ e, when, onClick }: { e: Pick<Entry, 'title' | 'sub' | 'type' | 'icon' | 'done'>; when?: string; onClick?: () => void }) {
  const l = look(e.type);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className="flex w-full items-center gap-3 rounded-xl bg-muted px-2.5 py-2 text-left">
      <span className={cn('grid h-9 w-9 shrink-0 -skew-x-6 place-items-center rounded-lg bg-gradient-to-br text-lg shadow', l.tile, e.done && 'opacity-60')}>{e.done ? '✅' : e.icon}</span>
      <span className="min-w-0 flex-1"><b className="block truncate text-sm">{e.title}</b>{e.sub && <span className="block truncate text-xs text-muted-foreground">{e.sub}</span>}</span>
      {when && <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-heading">{when}</span>}
    </Tag>
  );
}

// ---------- The calendar card ----------
function CalendarCard({ onAdd, onEdit, onDay }: { onAdd: (day: string, time?: string) => void; onEdit: (e: PlanEvent) => void; onDay: (day: string) => void }) {
  const p = useProfile().data!;
  const [view, setView] = useState<View>('month');
  const [show, setShow] = useState<CalType[]>(['training', 'events', 'appointments']);
  const today = usePlanData(p).today;
  const [at, setAt] = useState(today);
  const range = useMemo((): [string, string] => {
    if (view === 'day') return [at, at];
    if (view === 'week') return [sundayOf(at), addDaysIso(sundayOf(at), 6)];
    if (view === 'month') return [monthStart(at), monthEnd(at)];
    return [monthStart(at), monthEnd(addMonths(at, 2))];
  }, [view, at]);
  const { entries: all, logItems } = useEntries(range[0], range[1]);
  const entries = all.filter((e) => show.includes(e.type));
  const onDayOf = (d: string) => entries.filter((e) => e.day === d);
  const step = (n: number) => setAt(view === 'day' ? addDaysIso(at, n) : view === 'week' ? addDaysIso(at, 7 * n) : addMonths(at, n * (view === 'quarter' ? 3 : 1)));
  const title = view === 'day' ? `${DOW_LONG[dowOf(at)]} ${shortDate(at)}` : view === 'week' ? `${shortDate(range[0])} – ${shortDate(range[1])}`
    : view === 'month' ? `${MONTHS[+at.slice(5, 7) - 1]} ${at.slice(0, 4)}` : `${MONTHS[+range[0].slice(5, 7) - 1].slice(0, 3)} – ${MONTHS[+range[1].slice(5, 7) - 1].slice(0, 3)} ${range[1].slice(0, 4)}`;
  const tapDay = (d: string) => (onDayOf(d).length ? onDay(d) : onAdd(d));
  const item = (e: Entry, k: number) => (
    <button key={k} type="button" onClick={(ev) => { ev.stopPropagation(); if (e.event) onEdit(e.event); else onDay(e.day); }}
      className={cn('flex w-full items-center gap-1 truncate rounded-md bg-gradient-to-r px-1.5 py-0.5 text-left text-[11px] font-semibold text-white shadow-sm', look(e.type).tile, e.done && 'opacity-60')}>
      <span>{e.done ? '✓' : e.icon}</span><span className="truncate">{e.title}{e.time && e.type !== 'training' ? ` · ${e.time}` : ''}</span>
    </button>
  );

  const monthGrid = (start: string, mini = false) => {
    const lead = dowOf(start), cells: (string | null)[] = Array(lead).fill(null);
    for (let x = start; x <= monthEnd(start); x = addDaysIso(x, 1)) cells.push(x);
    return (
      <div className={cn('grid grid-cols-7', mini ? 'gap-0.5' : 'gap-1')}>
        {DOW.map((h, i) => <div key={i} className={cn('text-center font-display font-bold text-muted-foreground', mini ? 'text-[9px]' : 'text-[11px]')}>{h}</div>)}
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const es = onDayOf(c), isToday = c === today, types = [...new Set(es.map((e) => e.type))];
          const hasTest = es.some((e) => e.type === 'events');
          return (
            <button key={i} type="button" aria-label={`${shortDate(c)}${es.length ? `, ${es.length} items` : ', add'}`} onClick={() => (mini ? onDay(c) : tapDay(c))}
              className={cn('relative flex flex-col items-center rounded-lg transition-transform active:scale-95', mini ? 'h-8 justify-center text-[10px]' : 'min-h-[54px] justify-start pt-1 text-xs',
                isToday ? 'bg-gradient-to-br from-[#FF6B00] to-[#FF2E63] font-extrabold text-white shadow-[0_0_14px_rgba(255,107,0,0.6)] animate-glowpulse motion-reduce:animate-none'
                  : hasTest && !mini ? 'bg-gradient-to-br from-violet-500/90 to-sky-500/90 font-bold text-white' : 'bg-muted font-bold', c < today && !isToday && 'opacity-50')}>
              <span>{+c.slice(8)}</span>
              {mini ? (
                <span className="flex gap-0.5">{types.map((t) => <i key={t} className="h-1.5 w-1.5 rounded-full" style={{ background: isToday ? '#fff' : look(t).dot }} />)}</span>
              ) : (
                <span className="mt-0.5 flex flex-wrap justify-center gap-px text-[13px] leading-none">
                  {es.slice(0, 3).map((e, k) => <span key={k} title={e.title}>{e.done ? '✓' : e.icon}</span>)}
                  {es.length > 3 && <span className="text-[9px] font-bold">+{es.length - 3}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  // Day: a 24-hour timeline from 5 AM (Ben 2026-11-24). Tap an hour to add something at that time.
  const dayView = () => {
    const untimed = onDayOf(at).filter((e) => !e.time);
    const logs = logItems.filter((i) => i.active && i.rrule !== 'AS_NEEDED' && occursOn(i.rrule, i.start_date, at, i.end_date));
    return (
      <div className="space-y-2">
        {untimed.length > 0 && <div className="space-y-1 rounded-xl border border-dashed p-2"><div className="text-[11px] font-bold uppercase text-muted-foreground">All day</div>{untimed.map(item)}</div>}
        <div className="max-h-[420px] overflow-y-auto rounded-xl border">
          {Array.from({ length: 24 }, (_, k) => (k + 5) % 24).map((h) => {
            const hh = String(h).padStart(2, '0');
            const es = onDayOf(at).filter((e) => e.time?.startsWith(hh));
            return (
              <div key={h} role="button" tabIndex={0} onClick={() => onAdd(at, `${hh}:00`)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd(at, `${hh}:00`); }}
                className="flex min-h-[40px] cursor-pointer gap-2 border-b px-2 py-1 last:border-b-0 hover:bg-muted">
                <span className="w-12 shrink-0 pt-0.5 text-right font-display text-xs font-bold italic text-muted-foreground">{hourLabel(h)}</span>
                <div className="min-w-0 flex-1 space-y-1">{es.map(item)}</div>
              </div>
            );
          })}
        </div>
        {logs.length > 0 && <p className="text-xs text-muted-foreground">My log today: {logs.map((i) => i.name).join(', ')}. Manage them in Check-in › My log.</p>}
      </div>
    );
  };

  // Week: Sunday to Saturday, each day split into AM and PM. Tap a half to add at 9 AM or 2 PM.
  const weekView = () => (
    <div className="space-y-1.5">
      {Array.from({ length: 7 }, (_, k) => addDaysIso(range[0], k)).map((d) => {
        const es = onDayOf(d), untimed = es.filter((e) => !e.time), am = es.filter((e) => e.time && e.time < '12:00'), pm = es.filter((e) => e.time && e.time >= '12:00');
        return (
          <div key={d} className={cn('rounded-xl border p-1.5', d === today && 'border-[#FF6B00] shadow-[0_0_12px_rgba(255,107,0,0.35)]', d < today && 'opacity-60')}>
            <div className="mb-1 flex items-center gap-2 px-1">
              <span className={cn('font-display text-sm font-extrabold uppercase italic', d === today && 'text-[#FF6B00]')}>{DOW_LONG[dowOf(d)]} {+d.slice(8)}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-1">{untimed.map((e, k) => <span key={k} className="max-w-full">{item(e, k)}</span>)}</span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {([['AM', am, '09:00'], ['PM', pm, '14:00']] as const).map(([lab, list, t]) => (
                <div key={lab} role="button" tabIndex={0} onClick={() => onAdd(d, t)} onKeyDown={(e) => { if (e.key === 'Enter') onAdd(d, t); }} className="min-h-[34px] cursor-pointer space-y-1 rounded-lg bg-muted p-1 hover:ring-1 hover:ring-[#FF6B00]">
                  <span className="font-display text-[10px] font-bold italic text-muted-foreground">{lab}</span>
                  {list.map(item)}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <button type="button" aria-label="Back" onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-heading"><ChevronLeft className="h-4 w-4" /></button>
          <CardTitle help="schedule" className="flex-1 text-center"><span className="inline-flex items-center gap-1.5"><span className="grid h-7 w-7 -skew-x-6 place-items-center rounded-md bg-gradient-to-br from-[#FF6B00] to-[#FF2E63] text-sm not-italic">📅</span>{title}</span></CardTitle>
          <button type="button" aria-label="Next" onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-heading"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-1.5">
          {(['day', 'week', 'month', 'quarter'] as View[]).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn('flex-1 -skew-x-[8deg] rounded-md py-1.5 font-display text-sm font-bold uppercase italic', view === v ? 'bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] text-white' : 'bg-muted text-muted-foreground')}><span className="inline-block skew-x-[8deg]">{v}</span></button>
          ))}
          {at !== today && <button type="button" onClick={() => setAt(today)} className="rounded-full bg-secondary px-2 py-1 text-xs font-bold text-heading">Today</button>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CAL_TYPES.map((t) => { const on = show.includes(t.id); return (
            <button key={t.id} type="button" aria-pressed={on} onClick={() => setShow(on ? show.filter((x) => x !== t.id) : [...show, t.id])}
              className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', on ? 'border-transparent bg-secondary' : 'text-muted-foreground opacity-60')}>
              <i className="h-2.5 w-2.5 rounded-full" style={{ background: on ? t.dot : 'transparent', border: `2px solid ${t.dot}` }} />{t.label}
            </button>
          ); })}
        </div>
        {view === 'month' && monthGrid(monthStart(at))}
        {view === 'quarter' && <div className="space-y-3">{[0, 1, 2].map((k) => { const m = addMonths(at, k); return <div key={k}><div className="mb-1 font-display text-sm font-extrabold uppercase italic text-heading">{MONTHS[+m.slice(5, 7) - 1]}</div>{monthGrid(m, true)}</div>; })}<p className="text-[11px] text-muted-foreground">Tap a day to see what is on it.</p></div>}
        {view === 'day' && dayView()}
        {view === 'week' && weekView()}
        <Button className="w-full" onClick={() => onAdd(view === 'day' ? at : at >= today ? at : today)}><Plus /> Add to calendar</Button>
        <p className="text-xs text-muted-foreground">Add training, an event (race or test), an appointment or a My log item, or tap a day. Training, tests and races also come from your intervals.icu calendar.</p>
      </CardContent>
    </Card>
  );
}

// Everything on one day (from a quarter dot, or a busy day in the month)
function DaySheet({ day, onClose, onAdd, onEdit }: { day: string; onClose: () => void; onAdd: (d: string) => void; onEdit: (e: PlanEvent) => void }) {
  const { entries } = useEntries(day, day);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle className="font-display text-2xl font-extrabold uppercase italic">{DOW_LONG[dowOf(day)]} {shortDate(day)}</SheetTitle><SheetDescription>{entries.length ? `${entries.length} on this day` : 'Nothing on this day yet'}</SheetDescription></SheetHeader>
        <div className="space-y-2">
          <Button className="w-full" onClick={() => { onClose(); onAdd(day); }}><Plus /> Add on this day</Button>
          {entries.map((e, k) => <CalRow key={k} e={e} when={e.time} onClick={e.event ? () => { onClose(); onEdit(e.event!); } : undefined} />)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Coming up this week: appointments, events, races and your own entries in the current week, with a countdown
function ThisWeekCard({ onEdit }: { onEdit: (e: PlanEvent) => void }) {
  const p = useProfile().data!;
  const today = usePlanData(p).today;
  const [mon, sun] = weekOf(today);
  const { entries } = useEntries(mon, sun);
  const list = entries.filter((e) => e.day >= today && (e.type !== 'training' || e.event));
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>📆 Coming up this week</CardTitle><p className="text-xs text-muted-foreground">Week of {shortDate(mon)}</p></CardHeader>
      <CardContent className="space-y-2">
        {list.length ? list.map((e, i) => <CalRow key={i} e={e} when={daysAway(e.day, today)} onClick={e.event ? () => onEdit(e.event!) : undefined} />)
          : <p className="text-sm text-muted-foreground">Nothing else booked this week. Tap a day on the calendar to add something.</p>}
      </CardContent>
    </Card>
  );
}

function ThisMonthCard({ onEdit }: { onEdit: (e: PlanEvent) => void }) {
  const p = useProfile().data!;
  const today = usePlanData(p).today;
  const [, sun] = weekOf(today);
  const end = monthEnd(today) > addDaysIso(sun, 7) ? monthEnd(today) : addDaysIso(today, 30);
  const { entries } = useEntries(addDaysIso(sun, 1), end);
  const list = entries.filter((e) => e.type !== 'training' || e.event).slice(0, 12);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle>🚀 Coming up this month</CardTitle><p className="text-xs text-muted-foreground">After this week, to {shortDate(end)}</p></CardHeader>
      <CardContent className="space-y-2">
        {list.length ? list.map((e, i) => <CalRow key={i} e={e} when={shortDate(e.day)} onClick={e.event ? () => onEdit(e.event!) : undefined} />)
          : <p className="text-sm text-muted-foreground">Nothing coming up yet.</p>}
      </CardContent>
    </Card>
  );
}

export function Schedule() {
  const profile = useProfile().data!;
  const d = usePlanData(profile);
  const [sheet, setSheet] = useState<{ ev: PlanEvent | null; key: number; day?: string; time?: string } | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const add = (day: string, time?: string) => setSheet({ ev: null, key: Date.now(), day, time });
  const edit = (ev: PlanEvent) => setSheet({ ev, key: Date.now() });
  return (
    <div className="space-y-4">
      <ResultPromptCard />
      <Arrange page="calendar-v3" cards={[
        { id: 'calendar', label: 'Calendar', node: <CalendarCard onAdd={add} onEdit={edit} onDay={setDayOpen} /> },
        { id: 'week', label: 'Coming up this week', node: <ThisWeekCard onEdit={edit} /> },
        { id: 'tests', label: 'Tests this week', node: <NextTestCard /> },
        { id: 'month', label: 'Coming up this month', node: <ThisMonthCard onEdit={edit} /> }
      ]} />
      {dayOpen && <DaySheet day={dayOpen} onClose={() => setDayOpen(null)} onAdd={add} onEdit={edit} />}
      {sheet && <EventSheet key={sheet.key} open onOpenChange={(o) => !o && setSheet(null)} ev={sheet.ev} tz={profile.time_zone} today={d.today} startDay={sheet.day} startTime={sheet.time} />}
    </div>
  );
}
