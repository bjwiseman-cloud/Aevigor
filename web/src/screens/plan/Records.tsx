import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/data';
import { useRecords, useSave, type HealthRecord, type LabValue, type RecordKind } from '@/hooks/plan';
import { addDaysIso, shortDate } from '@/lib/plan';
import { todayIn } from '@/lib/time';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Chip, Chips, Field } from '@/components/chips';
import { C, axis, shortDay, tooltipStyle, Legend } from '@/components/charts';
import { HealthConsent, NOT_MEDICAL } from '@/components/health';
import { PLAN_TABS, SubTabs } from '@/screens/Layout';

// Labs and diagnostics types (no icons, Ben 2026-11-18). Value types get a chart and table; file types list by date.
const KINDS: { id: RecordKind; label: string; female?: boolean }[] = [
  { id: 'blood', label: 'Blood work' }, { id: 'urine', label: 'Urinalysis' }, { id: 'dexa', label: 'DEXA / body fat scan' },
  { id: 'ecg', label: 'ECG' }, { id: 'imaging', label: 'X-ray' }, { id: 'mammogram', label: 'Mammogram', female: true },
  { id: 'pap', label: 'Pap test', female: true }, { id: 'other', label: 'Other' }
];
const VALUE_KINDS: RecordKind[] = ['blood', 'urine', 'dexa'];
const kindsFor = (sex: string | null | undefined) => KINDS.filter((k) => !k.female || sex !== 'male');
const FLAGS = ['Below', 'Normal', 'High'] as const;
type Row = { marker: string; value: string; unit: string; range: string; flag: LabValue['flag'] };

// ---------- Blood pressure ----------
function BpPanel({ tz }: { tz: string }) {
  const profile = useProfile().data!;
  const { bp } = useRecords(profile);
  const [range, setRange] = useState(30);
  const [open, setOpen] = useState(false);
  const [sys, setSys] = useState(''); const [dia, setDia] = useState(''); const [pulse, setPulse] = useState('');
  const save = useSave('bp_readings', ['bp_readings']);
  const today = todayIn(tz);
  const rows = (bp.data ?? []).filter((r) => r.taken_at.slice(0, 10) >= addDaysIso(today, -range));
  const data = rows.map((r) => ({ t: r.taken_at.slice(0, 10), sys: r.systolic, dia: r.diastolic, pulse: r.pulse }));
  const latest = bp.data?.at(-1);
  const last30 = (bp.data ?? []).filter((r) => r.taken_at.slice(0, 10) >= addDaysIso(today, -30));
  const avg = (k: 'systolic' | 'diastolic') => Math.round(last30.reduce((a, r) => a + r[k], 0) / Math.max(1, last30.length));
  const add = async () => {
    await save.mutateAsync({ op: 'insert', row: { taken_at: new Date().toISOString(), systolic: +sys, diastolic: +dia, pulse: pulse ? +pulse : null, source: 'manual' } });
    setSys(''); setDia(''); setPulse(''); setOpen(false);
  };
  return (
    <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted p-2"><div className="text-xs text-muted-foreground">Latest</div><b className="text-lg">{latest ? `${latest.systolic}/${latest.diastolic}` : '–'}</b>{latest && <div className="text-xs text-muted-foreground">{shortDate(latest.taken_at.slice(0, 10))}</div>}</div>
          <div className="rounded-md bg-muted p-2"><div className="text-xs text-muted-foreground">30-day average</div><b className="text-lg">{last30.length ? `${avg('systolic')}/${avg('diastolic')}` : '–'}</b><div className="text-xs text-muted-foreground">{last30.length} readings</div></div>
        </div>
        <Chips>{[[7, 'Week'], [30, 'Month'], [90, '3 mo'], [365, 'Year']].map(([d, l]) => <Chip key={d} on={range === d} onClick={() => setRange(d as number)}>{l}</Chip>)}</Chips>
        {data.length ? (
          <div className="h-48">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="t" tickFormatter={shortDay} {...axis} />
                <YAxis domain={['dataMin - 10', 'dataMax + 10']} {...axis} />
                <Tooltip {...tooltipStyle} />
                <Line dataKey="sys" name="Systolic" stroke={C.cyan} strokeWidth={2} dot={{ r: 2 }} />
                <Line dataKey="dia" name="Diastolic" stroke={C.magenta} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <p className="text-sm text-muted-foreground">No readings in this range yet.</p>}
        <Legend items={[{ label: 'Systolic', color: C.cyan }, { label: 'Diastolic', color: C.magenta }]} />
        {rows.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Date</th><th className="text-left">Reading</th><th className="text-left">Pulse</th></tr></thead>
            <tbody>{[...rows].reverse().slice(0, 30).map((r) => <tr key={r.id} className="border-t"><td className="py-1">{shortDate(r.taken_at.slice(0, 10))}</td><td>{r.systolic}/{r.diastolic}</td><td>{r.pulse ?? '–'}</td></tr>)}</tbody>
          </table>
        )}
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}><Plus /> Add a reading</Button>
        <p className="text-xs text-muted-foreground">Hilo band sync is being looked into; add readings by hand for now. {NOT_MEDICAL}</p>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent>
            <SheetHeader><SheetTitle>Add blood pressure</SheetTitle><SheetDescription>Saved with today's date and time.</SheetDescription></SheetHeader>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Systolic"><Input inputMode="numeric" value={sys} onChange={(e) => setSys(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Diastolic"><Input inputMode="numeric" value={dia} onChange={(e) => setDia(e.target.value.replace(/\D/g, ''))} /></Field>
              <Field label="Pulse"><Input inputMode="numeric" value={pulse} onChange={(e) => setPulse(e.target.value.replace(/\D/g, ''))} /></Field>
            </div>
            <Button className="mt-4 w-full" disabled={!(+sys > 40 && +sys < 260 && +dia > 20 && +dia < 200) || save.isPending} onClick={add}>Save</Button>
          </SheetContent>
        </Sheet>
    </div>
  );
}

// ---------- Add / edit a record ----------
function RecordSheet({ rec, labs, onClose, uid, today, start, sex }: { rec: HealthRecord | null; labs: LabValue[]; onClose: () => void; uid: string; today: string; start: RecordKind; sex: string | null | undefined }) {
  const [kind, setKind] = useState<RecordKind>(rec?.kind ?? start);
  const [day, setDay] = useState(rec?.day ?? today);
  const [title, setTitle] = useState(rec?.title ?? '');
  const [source, setSource] = useState(rec?.source ?? '');
  const [notes, setNotes] = useState(rec?.notes ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [rows, setRows] = useState<Row[]>(labs.map((l) => ({ marker: l.marker, value: l.value_num != null ? String(l.value_num) : l.value_text ?? '', unit: l.unit ?? '', range: l.range_text ?? '', flag: l.flag })));
  const [busy, setBusy] = useState(false);
  const save = useSave('records', ['records', 'lab_values']);
  const lab = VALUE_KINDS.includes(kind);
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));

  const submit = async () => {
    setBusy(true);
    try {
      const paths = [...(rec?.files ?? [])];
      for (const f of files) {
        const path = `${uid}/${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, '_')}`;
        const { error } = await supabase.storage.from('records').upload(path, f);
        if (error) throw error;
        paths.push(path);
      }
      const row = { kind, day, title: title || null, source: source || null, notes: notes || null, files: paths };
      const saved = await save.mutateAsync(rec ? { op: 'update', id: rec.id, row } : { op: 'insert', row });
      const id = (saved?.id as string) ?? rec!.id;
      if (lab) {
        await supabase.from('lab_values').delete().eq('record_id', id);
        const vals = rows.filter((r) => r.marker.trim()).map((r) => ({
          record_id: id, marker: r.marker.trim(), unit: r.unit || null, range_text: r.range || null, flag: r.flag,
          value_num: r.value !== '' && !isNaN(+r.value) ? +r.value : null, value_text: r.value !== '' && isNaN(+r.value) ? r.value : null
        }));
        if (vals.length) { const { error } = await supabase.from('lab_values').insert(vals); if (error) throw error; }
      }
      toast.success('Record saved');
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (rec?.files.length) await supabase.storage.from('records').remove(rec.files);
    await save.mutateAsync({ op: 'delete', id: rec!.id });
    onClose();
  };

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle>{rec ? 'Edit record' : 'Add a health record'}</SheetTitle>
          <SheetDescription>Copy results and flags exactly as your report shows them.</SheetDescription></SheetHeader>
        <div className="space-y-4">
          <Field label="Type"><Chips>{kindsFor(sex).map((k) => <Chip key={k.id} on={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</Chip>)}</Chips></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><Input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></Field>
            <Field label="Lab or clinic"><Input value={source} maxLength={120} onChange={(e) => setSource(e.target.value)} /></Field>
          </div>
          <Field label="Title" hint="optional"><Input value={title} maxLength={120} placeholder="e.g. Annual panel" onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Files" hint="PDF or photos, 20 MB each">
            <Input type="file" multiple accept="application/pdf,image/*" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
            {!!rec?.files.length && <p className="text-xs text-muted-foreground">{rec.files.length} file(s) already attached</p>}
            <p className="text-xs text-muted-foreground">Reading values from a photo or PDF is coming next. For now, type them below.</p>
          </Field>
          {lab && (
            <Field label="Results" hint="flag as printed on the report">
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div key={i} className="space-y-1 rounded-md border p-2">
                    <div className="flex gap-1">
                      <Input placeholder={kind === 'dexa' ? 'Measure (e.g. Body fat %)' : 'Marker (e.g. Ferritin)'} value={r.marker} onChange={(e) => set(i, { marker: e.target.value })} />
                      <Button size="icon" variant="ghost" aria-label="Remove row" onClick={() => setRows(rows.filter((_, k) => k !== i))}><Trash2 /></Button>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <Input placeholder="Value" value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
                      <Input placeholder="Unit" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} />
                      <Input placeholder="Range" value={r.range} onChange={(e) => set(i, { range: e.target.value })} />
                    </div>
                    <Chips>{FLAGS.map((f) => <Chip key={f} on={r.flag === f} onClick={() => set(i, { flag: r.flag === f ? null : f })}>{f}</Chip>)}</Chips>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setRows([...rows, { marker: '', value: '', unit: '', range: '', flag: null }])}><Plus /> Add a result</Button>
              </div>
            </Field>
          )}
          <Field label="Notes"><Textarea value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Button className="w-full" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          {rec && <Button variant="ghost" className="w-full text-destructive" onClick={remove}>Delete record and files</Button>}
          <p className="text-xs text-muted-foreground">{NOT_MEDICAL}</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- One marker over time ----------
function MarkerTimeline({ marker, labs, records }: { marker: string; labs: LabValue[]; records: HealthRecord[] }) {
  const pts = labs.filter((l) => l.marker.toLowerCase() === marker.toLowerCase())
    .map((l) => ({ ...l, day: records.find((r) => r.id === l.record_id)?.day ?? '' }))
    .filter((p) => p.day).sort((a, b) => a.day.localeCompare(b.day));
  const num = pts.filter((p) => p.value_num != null).map((p) => ({ t: p.day, v: p.value_num }));
  return (
    <div className="space-y-2">
      {num.length > 1 && (
        <div className="h-36">
          <ResponsiveContainer>
            <LineChart data={num} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="t" tickFormatter={shortDay} {...axis} />
              <YAxis domain={['auto', 'auto']} {...axis} />
              <Tooltip {...tooltipStyle} />
              <Line dataKey="v" name={marker} stroke={C.cyan} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground"><tr><th className="text-left">Date</th><th className="text-left">Result</th><th className="text-left">Range</th><th className="text-left">Flag</th></tr></thead>
        <tbody>{pts.map((p) => <tr key={p.id}><td>{shortDate(p.day)}</td><td>{p.value_num ?? p.value_text} {p.unit}</td><td>{p.range_text}</td><td>{p.flag ?? ''}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export function Records() {
  const profile = useProfile().data!;
  const { on, records, labs } = useRecords(profile);
  const [type, setType] = useState<RecordKind | 'bp'>('bp');
  const [sheet, setSheet] = useState<{ rec: HealthRecord | null } | null>(null);
  const [marker, setMarker] = useState<string | null>(null);
  const today = todayIn(profile.time_zone);
  const recs = useMemo(() => (records.data ?? []).filter((r) => r.kind === type).sort((a, b) => b.day.localeCompare(a.day)), [records.data, type]);
  const markers = useMemo(() => {
    const ids = new Set(recs.map((r) => r.id));
    return [...new Set((labs.data ?? []).filter((l) => ids.has(l.record_id)).map((l) => l.marker))].sort();
  }, [labs.data, recs]);
  useEffect(() => { setMarker(null); }, [type]);

  if (!on) return <><SubTabs tabs={PLAN_TABS} /><HealthConsent profile={profile} /></>;
  const open = async (path: string) => {
    const { data, error } = await supabase.storage.from('records').createSignedUrl(path, 300);
    if (error) toast.error(error.message); else window.open(data.signedUrl, '_blank', 'noopener');
  };
  const kind = KINDS.find((k) => k.id === type);
  const values = type !== 'bp' && VALUE_KINDS.includes(type);

  return (
    <div className="space-y-4">
      <SubTabs tabs={PLAN_TABS} />
      <Card>
        <CardHeader className="pb-2"><CardTitle help="labs">Labs and diagnostics</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Chips><Chip on={type === 'bp'} onClick={() => setType('bp')}>Blood pressure</Chip>{kindsFor(profile.sex).map((k) => <Chip key={k.id} on={type === k.id} onClick={() => setType(k.id)}>{k.label}</Chip>)}</Chips>
          {type === 'bp' ? <BpPanel tz={profile.time_zone} /> : <>
            {values && (markers.length ? <>
              <Chips>{markers.map((m) => <Chip key={m} on={marker === m} onClick={() => setMarker(m)}>{m}</Chip>)}</Chips>
              {marker ? <MarkerTimeline marker={marker} labs={labs.data ?? []} records={recs} /> : <p className="text-sm text-muted-foreground">Pick a result to see it over time, with a table of each test date.</p>}
            </> : null)}
            <div className="divide-y rounded-md border">
              {recs.length ? recs.map((r) => {
                const vals = (labs.data ?? []).filter((l) => l.record_id === r.id);
                return (
                  <div key={r.id} className="space-y-1 px-3 py-2 text-sm">
                    <button type="button" className="w-full text-left" onClick={() => setSheet({ rec: r })}>
                      <span className="text-muted-foreground">{shortDate(r.day)}</span> <b>{r.title || kind?.label}</b>{r.source && <span className="text-muted-foreground"> · {r.source}</span>}
                      {!!vals.length && <span className="block text-xs text-muted-foreground">{vals.length} results{vals.some((v) => v.flag && v.flag !== 'Normal') ? ` · ${vals.filter((v) => v.flag && v.flag !== 'Normal').length} flagged on the report` : ''}</span>}
                    </button>
                    {r.files.map((f) => <button key={f} type="button" className="mr-2 text-xs underline" onClick={() => open(f)}>{f.split('/').pop()!.slice(37)}</button>)}
                  </div>
                );
              }) : <p className="p-3 text-sm text-muted-foreground">No {kind?.label ?? 'records'} yet.</p>}
            </div>
            <Button className="w-full" onClick={() => setSheet({ rec: null })}><Plus /> Add {kind?.label ?? 'a record'}</Button>
          </>}
          <p className="text-xs text-muted-foreground">Flags are copied as printed on your report. {NOT_MEDICAL}</p>
        </CardContent>
      </Card>
      {sheet && <RecordSheet rec={sheet.rec} start={type === 'bp' ? 'blood' : type} sex={profile.sex} labs={sheet.rec ? (labs.data ?? []).filter((l) => l.record_id === sheet.rec!.id) : [{ id: '', record_id: '', marker: '', value_num: null, value_text: null, unit: null, range_text: null, flag: null }]} uid={profile.user_id} today={today} onClose={() => setSheet(null)} />}
    </div>
  );
}
