import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useProfile } from '@/hooks/data';
import { usePlanData, useSave } from '@/hooks/plan';
import { addDaysIso, amountText, buildRule, CATEGORIES, describe, occursOn, parseRule, type Category, type Ends, type LogGroup, type LogItem, type Repeat } from '@/lib/plan';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Chip, Chips, Field, Stepper } from '@/components/chips';
import { RepeatPicker, TimesPicker } from '@/components/RepeatPicker';
import { HealthConsent, NOT_MEDICAL } from '@/components/health';
import { PLAN_TABS, SubTabs } from '@/screens/Layout';

const UNITS = ['tablet', 'capsule', 'mg', 'mcg', 'IU', 'g', 'ml', 'units', 'drops', 'scoop'];

// Neutral count of the last 14 scheduled slots: "Taken 12 of 14". No colours for good or bad.
function adherence(item: LogItem, doses: { item_id: string; day: string; slot: string; status: string }[], groups: LogGroup[], today: string) {
  const g = groups.find((x) => x.id === item.group_id);
  const rule = g ? g.rrule : item.rrule, times = g ? g.times : item.times;
  const marks: ('taken' | 'skipped' | null)[] = [];
  for (let k = 13; k >= 0 && marks.length < 28; k--) {
    const day = addDaysIso(today, -k);
    if (!occursOn(rule, item.start_date, day, item.end_date)) continue;
    for (const t of times) { const d = doses.find((x) => x.item_id === item.id && x.day === day && x.slot === t); marks.push((d?.status as 'taken' | 'skipped') ?? null); }
  }
  return { marks, taken: marks.filter((m) => m === 'taken').length };
}

function Strip({ marks }: { marks: ('taken' | 'skipped' | null)[] }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-[3px]" aria-hidden>
      {marks.map((m, i) => <span key={i} className={'h-2.5 w-2.5 rounded-full border border-muted-foreground ' + (m === 'taken' ? 'bg-muted-foreground' : '')} />)}
    </div>
  );
}

type Draft = {
  id?: string; category: Category; name: string; strength: string; form: string; amount: number; unit: string;
  repeat: Repeat; ends: Ends; times: string[]; start: string; notes: string; reminder: boolean; group_id: string | null;
};

function toDraft(i: LogItem | null, today: string, category: Category = 'supplement'): Draft {
  if (!i) return { category, name: '', strength: '', form: '', amount: 1, unit: 'tablet', repeat: { kind: 'daily' }, ends: { kind: 'never' }, times: ['08:00'], start: today, notes: '', reminder: true, group_id: null };
  const { repeat, ends } = parseRule(i.rrule, i.start_date);
  return {
    id: i.id, category: i.category, name: i.name, strength: i.strength ?? '', form: i.form ?? '', amount: i.amount ?? 1, unit: i.unit ?? '',
    repeat, ends: i.end_date && ends.kind === 'never' ? { kind: 'date', date: i.end_date } : ends, times: i.times, start: i.start_date,
    notes: i.notes ?? '', reminder: i.reminder, group_id: i.group_id
  };
}

function ItemSheet({ open, onOpenChange, initial, items, groups }: {
  open: boolean; onOpenChange: (o: boolean) => void; initial: Draft; items: LogItem[]; groups: LogGroup[];
}) {
  const [d, setD] = useState<Draft>(initial);
  const [q, setQ] = useState(initial.name);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const save = useSave('log_items', ['log_items']);
  const del = useSave('log_items', ['log_items']);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s || s === d.name.toLowerCase()) return [];
    return items.filter((i) => i.name.toLowerCase().includes(s)).slice(0, 5);
  }, [q, items, d.name]);
  const inGroup = groups.find((g) => g.id === d.group_id);

  const submit = async () => {
    const name = (d.name || q).trim();
    if (!name) return;
    const row = {
      category: d.category, name, strength: d.strength || null, form: d.form || null, amount: d.amount, unit: d.unit || null,
      rrule: buildRule(d.repeat, d.ends, d.start), times: inGroup ? inGroup.times : d.times, start_date: d.start,
      end_date: d.ends.kind === 'date' ? d.ends.date : null, notes: d.notes || null,
      reminder: d.repeat.kind !== 'asneeded' && d.reminder, group_id: d.group_id
    };
    await save.mutateAsync(d.id ? { op: 'update', id: d.id, row } : { op: 'insert', row });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{d.id ? 'Edit item' : 'Add an item'}</SheetTitle>
          <SheetDescription>You enter what you take and when. Aevigor never suggests amounts.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <Field label="Name">
            <Input autoFocus={!d.id} value={q} placeholder="e.g. Vitamin D3, Creatine, Pre-ride carbs" onChange={(e) => { setQ(e.target.value); set({ name: e.target.value }); }} />
            {matches.length > 0 && (
              <div className="rounded-md border">
                {matches.map((m) => (
                  <button key={m.id} type="button" className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                    onClick={() => { setQ(m.name); set({ name: m.name, category: m.category, strength: m.strength ?? '', form: m.form ?? '', unit: m.unit ?? d.unit, amount: m.amount ?? d.amount }); }}>
                    {m.name} <span className="text-muted-foreground">{[m.strength, m.form].filter(Boolean).join(' · ')}</span>
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Searching the Health Canada product lists and scanning a label are coming next. For now it matches what you've logged before.</p>
          </Field>

          <Field label="Type">
            <Chips>{CATEGORIES.map((c) => <Chip key={c.id} on={d.category === c.id} onClick={() => set({ category: c.id })}>{c.icon} {c.label}</Chip>)}</Chips>
          </Field>

          <Field label="Amount you take" hint="strength from the label is optional">
            <div className="flex flex-wrap items-center gap-2">
              <Stepper label="amount" value={d.amount} step={d.unit === 'tablet' || d.unit === 'capsule' || d.unit === 'scoop' ? 1 : 0.5} onChange={(amount) => set({ amount })} />
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={d.unit} onChange={(e) => set({ unit: e.target.value })} aria-label="Unit">
                {[...new Set([d.unit, ...UNITS])].filter(Boolean).map((u) => <option key={u}>{u}</option>)}
              </select>
              <Input className="h-9 w-32" placeholder="Strength, e.g. 1,000 IU" value={d.strength} onChange={(e) => set({ strength: e.target.value })} aria-label="Strength" />
            </div>
          </Field>

          {!inGroup && d.repeat.kind !== 'asneeded' && <TimesPicker times={d.times} onChange={(times) => set({ times })} />}
          {!inGroup && <RepeatPicker repeat={d.repeat} ends={d.ends} times={d.times} start={d.start} onRepeat={(repeat) => set({ repeat })} onEnds={(ends) => set({ ends })} />}

          {d.repeat.kind !== 'asneeded' && (
            <Field label="Reminder">
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="text-sm">{inGroup ? `Part of ${inGroup.name}` : 'Remind me'}</span>
                <Switch checked={d.reminder} onCheckedChange={(reminder) => set({ reminder })} aria-label="Reminder" />
              </div>
              {groups.length > 0 && (
                <Chips>
                  <Chip on={!d.group_id} onClick={() => set({ group_id: null })}>On its own</Chip>
                  {groups.map((g) => <Chip key={g.id} on={d.group_id === g.id} onClick={() => set({ group_id: g.id })}>{g.name}</Chip>)}
                </Chips>
              )}
            </Field>
          )}

          <Accordion type="single" collapsible>
            <AccordionItem value="more" className="border-b-0">
              <AccordionTrigger className="py-1 text-sm">More details</AccordionTrigger>
              <AccordionContent className="space-y-3">
                <Field label="Start date"><Input type="date" value={d.start} onChange={(e) => set({ start: e.target.value })} /></Field>
                <Field label="Form"><Input placeholder="tablet, capsule, injection…" value={d.form} onChange={(e) => set({ form: e.target.value })} /></Field>
                <Field label="Notes"><Textarea value={d.notes} maxLength={1000} onChange={(e) => set({ notes: e.target.value })} /></Field>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <Button className="w-full" onClick={submit} disabled={save.isPending || !(d.name || q).trim()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          {d.id && (
            <Button variant="ghost" className="w-full text-destructive" onClick={async () => { await del.mutateAsync({ op: 'delete', id: d.id }); onOpenChange(false); }}>Delete this item</Button>
          )}
          <p className="text-center text-xs text-muted-foreground">{NOT_MEDICAL}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function GroupSheet({ open, onOpenChange, group, today }: { open: boolean; onOpenChange: (o: boolean) => void; group: LogGroup | null; today: string }) {
  const init = group ? parseRule(group.rrule, today) : { repeat: { kind: 'daily' } as Repeat, ends: { kind: 'never' } as Ends };
  const [name, setName] = useState(group?.name ?? 'Night routine');
  const [times, setTimes] = useState<string[]>(group?.times ?? ['21:30']);
  const [repeat, setRepeat] = useState<Repeat>(init.repeat);
  const [ends, setEnds] = useState<Ends>(init.ends);
  const save = useSave('log_groups', ['log_groups']);
  const submit = async () => {
    const row = { name: name.trim() || 'Routine', times, rrule: buildRule(repeat, ends, today), reminder: true };
    await save.mutateAsync(group ? { op: 'update', id: group.id, row } : { op: 'insert', row });
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader><SheetTitle>{group ? 'Edit group' : 'New reminder group'}</SheetTitle>
          <SheetDescription>One reminder lists every item in the group with its amount. Add items to it from each item's Reminder setting.</SheetDescription></SheetHeader>
        <div className="space-y-4">
          <Field label="Name">
            <Chips>{['☀️ Morning stack', '🌙 Night routine', '🍽 With meals'].map((n) => <Chip key={n} on={name === n} onClick={() => setName(n)}>{n}</Chip>)}</Chips>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <TimesPicker times={times} onChange={setTimes} />
          <RepeatPicker repeat={repeat} ends={ends} times={times} start={today} onRepeat={setRepeat} onEnds={setEnds} allowAsNeeded={false} />
          <Button className="w-full" onClick={submit} disabled={save.isPending || !times.length}>Save group</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function MyLog() {
  const profile = useProfile().data!;
  const d = usePlanData(profile);
  const [sheet, setSheet] = useState<{ draft: Draft; key: number } | null>(null);
  const [groupSheet, setGroupSheet] = useState<{ g: LogGroup | null; key: number } | null>(null);
  const saveGroup = useSave('log_groups', ['log_groups']);
  const saveItem = useSave('log_items', ['log_items']);

  if (!d.on) return <><SubTabs tabs={PLAN_TABS} /><HealthConsent profile={profile} /></>;
  const items = d.items.data ?? [], groups = d.groups.data ?? [], doses = d.doses.data ?? [];
  const thisMonth = d.today.slice(0, 7);
  const monthDoses = doses.filter((x) => x.day.startsWith(thisMonth));
  const open = (i: LogItem | null, cat?: Category) => setSheet({ draft: toDraft(i, d.today, cat), key: Date.now() });

  return (
    <div className="space-y-4">
      <SubTabs tabs={PLAN_TABS} />
      <Card>
        <CardHeader className="pb-2"><CardTitle>My log</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Things you take or do on a schedule. You set them and their reminders; Aevigor keeps the log. {NOT_MEDICAL}</p>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md border p-2"><div className="font-mono text-lg">{monthDoses.filter((x) => x.status === 'taken').length}</div><div className="text-xs text-muted-foreground">Logged as taken this month</div></div>
            <div className="rounded-md border p-2"><div className="font-mono text-lg">{monthDoses.filter((x) => x.status === 'skipped').length}</div><div className="text-xs text-muted-foreground">Logged as skipped this month</div></div>
          </div>
          <Button className="w-full" onClick={() => open(null)}><Plus /> Add an item</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle>⏰ Reminder groups</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {groups.map((g) => {
            const its = items.filter((i) => i.group_id === g.id && i.active);
            return (
              <div key={g.id} className="flex items-start gap-3 py-2.5">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setGroupSheet({ g, key: Date.now() })}>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{describe(parseRule(g.rrule, d.today).repeat, parseRule(g.rrule, d.today).ends, g.times, d.today)}</div>
                  <div className="text-sm">{its.length ? its.map(amountText).join(' · ') : <span className="text-muted-foreground">No items yet: open an item and pick this group</span>}</div>
                </button>
                <Switch checked={g.reminder} aria-label={`Reminder for ${g.name}`} onCheckedChange={(reminder) => saveGroup.mutate({ op: 'update', id: g.id, row: { reminder } })} />
              </div>
            );
          })}
          <button type="button" className="w-full py-2.5 text-left text-sm text-primary" onClick={() => setGroupSheet({ g: null, key: Date.now() })}>+ New group (one reminder for several items)</button>
        </CardContent>
      </Card>

      {CATEGORIES.map((c) => {
        const its = items.filter((i) => i.category === c.id);
        if (!its.length) return null;
        return (
          <Card key={c.id}>
            <CardHeader className="pb-2"><CardTitle>{c.icon} {c.label}</CardTitle></CardHeader>
            <CardContent className="divide-y">
              {its.map((i) => {
                const g = groups.find((x) => x.id === i.group_id);
                const a = i.rrule === 'AS_NEEDED' ? null : adherence(i, doses, groups, d.today);
                const pr = parseRule(i.rrule, i.start_date);
                return (
                  <div key={i.id} className="py-2.5">
                    <div className="flex items-start gap-3">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => open(i)}>
                        <div><b>{i.name}</b>{(i.amount != null || i.strength) && <> · {amountText(i).split(' · ')[1]}</>}</div>
                        <div className="text-xs text-muted-foreground">{g ? `In ${g.name}` : describe(pr.repeat, pr.ends, i.times, i.start_date)}</div>
                      </button>
                      {!g && i.rrule !== 'AS_NEEDED' && (
                        <Switch checked={i.reminder} aria-label={`Reminder for ${i.name}`} onCheckedChange={(reminder) => saveItem.mutate({ op: 'update', id: i.id, row: { reminder } })} />
                      )}
                    </div>
                    {a && a.marks.length > 0 && <><Strip marks={a.marks} /><div className="text-xs text-muted-foreground">Taken {a.taken} of {a.marks.length} in the last 2 weeks</div></>}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      {sheet && <ItemSheet key={sheet.key} open onOpenChange={(o) => !o && setSheet(null)} initial={sheet.draft} items={items} groups={groups} />}
      {groupSheet && <GroupSheet key={groupSheet.key} open onOpenChange={(o) => !o && setGroupSheet(null)} group={groupSheet.g} today={d.today} />}
    </div>
  );
}
