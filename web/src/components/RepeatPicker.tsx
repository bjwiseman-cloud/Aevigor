// "How often" chips: each chip opens only the extra choice it needs, with a one-line summary underneath.
import { Chip, Chips, Field, Stepper } from '@/components/chips';
import { Input } from '@/components/ui/input';
import { DAY_SHORT, describe, niceTime, type Ends, type Repeat } from '@/lib/plan';

export const TIME_PRESETS = [
  { label: 'Morning', t: '08:00' }, { label: 'Midday', t: '12:00' }, { label: 'Evening', t: '18:00' }, { label: 'Bedtime', t: '21:30' }
];

export function TimesPicker({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  const toggle = (t: string) => onChange(times.includes(t) ? times.filter((x) => x !== t) : [...times, t].sort());
  const custom = times.filter((t) => !TIME_PRESETS.some((p) => p.t === t));
  return (
    <Field label="When" hint="tap more than one for twice a day">
      <Chips>
        {TIME_PRESETS.map((p) => <Chip key={p.t} on={times.includes(p.t)} onClick={() => toggle(p.t)}>{p.label}</Chip>)}
        {custom.map((t) => <Chip key={t} on onClick={() => toggle(t)}>{niceTime(t)} ✕</Chip>)}
        <label className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm">
          + Time
          <input type="time" aria-label="Add a custom time" className="bg-transparent" onChange={(e) => { if (e.target.value && !times.includes(e.target.value)) onChange([...times, e.target.value].sort()); e.target.value = ''; }} />
        </label>
      </Chips>
    </Field>
  );
}

const KINDS: { k: Repeat['kind']; label: string; make: () => Repeat }[] = [
  { k: 'daily', label: 'Daily', make: () => ({ kind: 'daily' }) },
  { k: 'days', label: 'Some days', make: () => ({ kind: 'days', days: [0, 3] }) },
  { k: 'every', label: 'Every X days', make: () => ({ kind: 'every', n: 2, unit: 'day' }) },
  { k: 'cycle', label: 'Cycle', make: () => ({ kind: 'cycle', on: 5, off: 2, unit: 'day' }) },
  { k: 'monthly', label: 'Monthly', make: () => ({ kind: 'monthly', mode: 'date' }) },
  { k: 'asneeded', label: 'As needed', make: () => ({ kind: 'asneeded' }) }
];

export function RepeatPicker({ repeat, ends, times, start, onRepeat, onEnds, allowAsNeeded = true }: {
  repeat: Repeat; ends: Ends; times: string[]; start: string;
  onRepeat: (r: Repeat) => void; onEnds: (e: Ends) => void; allowAsNeeded?: boolean;
}) {
  return (
    <Field label="How often">
      <Chips>
        {KINDS.filter((k) => allowAsNeeded || k.k !== 'asneeded').map((k) => (
          <Chip key={k.k} on={repeat.kind === k.k} onClick={() => onRepeat(k.make())}>{k.label}</Chip>
        ))}
      </Chips>

      {repeat.kind === 'days' && (
        <Chips className="pt-1">
          {DAY_SHORT.map((d, i) => (
            <Chip key={i} className="w-9 px-0" on={repeat.days.includes(i)}
              onClick={() => onRepeat({ kind: 'days', days: repeat.days.includes(i) ? repeat.days.filter((x) => x !== i) : [...repeat.days, i] })}>{d}</Chip>
          ))}
        </Chips>
      )}
      {repeat.kind === 'every' && (
        <div className="flex items-center gap-2 pt-1 text-sm">
          Every <Stepper label="interval" min={1} value={repeat.n} onChange={(n) => onRepeat({ ...repeat, n })} />
          <Chips><Chip on={repeat.unit === 'day'} onClick={() => onRepeat({ ...repeat, unit: 'day' })}>days</Chip><Chip on={repeat.unit === 'week'} onClick={() => onRepeat({ ...repeat, unit: 'week' })}>weeks</Chip></Chips>
        </div>
      )}
      {repeat.kind === 'cycle' && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-sm">
          <Stepper label="on" min={1} value={repeat.on} onChange={(on) => onRepeat({ ...repeat, on })} /> on,
          <Stepper label="off" min={1} value={repeat.off} onChange={(off) => onRepeat({ ...repeat, off })} /> off
          <Chips><Chip on={repeat.unit === 'day'} onClick={() => onRepeat({ ...repeat, unit: 'day' })}>days</Chip><Chip on={repeat.unit === 'week'} onClick={() => onRepeat({ ...repeat, unit: 'week' })}>weeks</Chip></Chips>
        </div>
      )}
      {repeat.kind === 'monthly' && (
        <Chips className="pt-1">
          <Chip on={repeat.mode === 'date'} onClick={() => onRepeat({ kind: 'monthly', mode: 'date' })}>Same date</Chip>
          <Chip on={repeat.mode === 'nth'} onClick={() => onRepeat({ kind: 'monthly', mode: 'nth' })}>Same weekday (e.g. 1st Mon)</Chip>
        </Chips>
      )}

      {repeat.kind !== 'asneeded' && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-sm">
          <span className="text-muted-foreground">Ends</span>
          <Chip on={ends.kind === 'never'} onClick={() => onEnds({ kind: 'never' })}>Never</Chip>
          <Chip on={ends.kind === 'date'} onClick={() => onEnds({ kind: 'date', date: start })}>On a date</Chip>
          <Chip on={ends.kind === 'count'} onClick={() => onEnds({ kind: 'count', n: 10 })}>After X times</Chip>
          {ends.kind === 'date' && <Input type="date" className="h-8 w-auto" value={ends.date} min={start} onChange={(e) => onEnds({ kind: 'date', date: e.target.value })} aria-label="End date" />}
          {ends.kind === 'count' && <Stepper label="times" min={1} value={ends.n} onChange={(n) => onEnds({ kind: 'count', n })} />}
        </div>
      )}
      <p className="rounded-md bg-muted px-3 py-2 text-sm">{describe(repeat, ends, repeat.kind === 'asneeded' ? [] : times, start)}</p>
    </Field>
  );
}
