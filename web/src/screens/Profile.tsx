// Profile: name, sex (sets the body figure and women's health options), and thresholds and zones per sport
// from intervals.icu Sport Settings at each sync, or the person's own numbers (which can be sent to intervals.icu).
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { usePref, useProfile, useWellness } from '@/hooks/data';
import { useCurves, usePaceCurves } from '@/hooks/perf';
import { callApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { bestSpeed5min, bestWatts, DEFAULT_PACE, DEFAULT_POWER, defaultHr, effective, MY_ZONES_KEY, paceText, parsePace, type MyZones, type OwnSport, type OwnValues } from '@/lib/myzones';
import { Chip, Chips } from '@/components/chips';
import { HelpQ } from '@/components/HelpQ';
import { Section } from '@/components/Section';
import { hrZones, paceStr, paceZones, powerZones, sportName, type ZoneRow } from '@/lib/zones';
import type { SportSettings } from '@/lib/types';

const SEXES = [['female', 'Female'], ['male', 'Male'], ['unspecified', 'Prefer not to say']] as const;

function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="rounded-md border p-2"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value ?? '–'}</div></div>;
}
function Zones({ title, rows }: { title: string; rows: ZoneRow[] }) {
  if (!rows.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      <table className="w-full text-sm"><tbody>{rows.map((r) => (
        <tr key={r.name} className="border-t"><td className="py-1 font-medium">{r.name}</td><td className="text-right">{r.from}</td><td className="w-6 text-center text-muted-foreground">–</td><td>{r.to}</td></tr>
      ))}</tbody></table>
    </div>
  );
}
type Eff = ReturnType<typeof effective>;
type Auto = { vo2: number | null; p5: number | null; p1: number | null; v5: number | null };

function SportStats({ e, ride, run, auto }: { e: Eff; ride: boolean; run: boolean; auto: Auto }) {
  const mile = /mile/i.test(e.pace_units ?? '');
  const w = (v: number | null | undefined) => (v != null ? `${v} W` : null);
  const bpm = (v: number | null | undefined) => (v != null ? `${v} bpm` : null);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {(ride || e.ftp != null) && <Stat label={ride ? 'FTP (≈ LT2 power)' : 'Threshold power'} value={w(e.ftp)} />}
      {e.indoor_ftp != null && e.indoor_ftp !== e.ftp && <Stat label="Indoor FTP" value={w(e.indoor_ftp)} />}
      {ride && <Stat label="Critical power (CP)" value={w(e.cp)} />}
      {(ride || e.w_prime != null) && <Stat label="W′" value={e.w_prime != null ? `${(e.w_prime / 1000).toFixed(1)} kJ` : null} />}
      {ride && <Stat label="Peak power (1 s)" value={w(e.p_max ?? auto.p1)} />}
      {ride && <Stat label="5-min power (≈ VO2max power)" value={w(e.vo2_power ?? auto.p5)} />}
      {(run || e.threshold_pace != null) && <Stat label="Threshold pace (LT2)" value={e.threshold_pace ? paceStr(e.threshold_pace, mile) : null} />}
      {run && <Stat label="5-min best pace (≈ vVO2max)" value={(e.vo2_pace ?? auto.v5) ? paceStr((e.vo2_pace ?? auto.v5)!, mile) : null} />}
      <Stat label="Lactate threshold HR (LTHR)" value={bpm(e.lthr)} />
      {e.lt1_hr != null && <Stat label="Aerobic threshold HR (LT1)" value={bpm(e.lt1_hr)} />}
      <Stat label="Max HR" value={bpm(e.max_hr)} />
      {e.resting_hr != null && <Stat label="Resting HR" value={bpm(e.resting_hr)} />}
      {(ride || run) && <Stat label="VO2max" value={e.vo2max ?? auto.vo2} />}
    </div>
  );
}

function SportCard({ name, icu, own, auto, onSave }: { name: string; icu?: SportSettings; own?: OwnSport; auto: Auto; onSave: (o: OwnSport) => Promise<void> }) {
  const ride = name === 'Cycling', run = name === 'Running';
  const types = icu?.types ?? (ride ? ['Ride', 'VirtualRide'] : run ? ['Run'] : [name]);
  const mode = own?.mode ?? 'intervals';
  const e = effective(icu, own, types);
  const [editing, setEditing] = useState(false);
  return (
    <Section title={name}>
      <p className="text-xs text-muted-foreground">{types.map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')}</p>
      <Chips>
        <Chip on={mode === 'intervals'} onClick={() => void onSave({ mode: 'intervals', v: own?.v ?? {} })}>From intervals.icu</Chip>
        <Chip on={mode === 'own'} onClick={() => { void onSave({ mode: 'own', v: own?.v ?? {} }); setEditing(true); }}>My own</Chip>
      </Chips>
      {!icu && mode === 'intervals' && <p className="text-sm text-muted-foreground">Not in your intervals.icu Sport Settings yet. Pick My own to enter numbers here.</p>}
      <SportStats e={e} ride={ride} run={run} auto={auto} />
      {mode === 'own' && !editing && <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Edit numbers and zones</Button>}
      {mode === 'own' && editing && <OwnEditor name={name} e={e} icu={icu} types={types} own={own!} auto={auto} ride={ride} run={run}
        onSave={async (o) => { await onSave(o); }} onClose={() => setEditing(false)} />}
      <Zones title="Power zones" rows={powerZones(e)} />
      <Zones title="Pace zones" rows={paceZones(e)} />
      <Zones title="Heart rate zones" rows={hrZones(e)} />
    </Section>
  );
}

function NumField({ label, unit, value, onChange, placeholder }: { label: string; unit?: string; value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <label className="space-y-1 text-xs text-muted-foreground"><span>{label}{unit ? ` (${unit})` : ''}</span>
      <Input inputMode="decimal" className="h-9 text-foreground" value={value ?? ''} placeholder={placeholder}
        onChange={(ev) => { const t = ev.target.value.trim(); const n = Number(t); onChange(t === '' || !Number.isFinite(n) ? null : n); }} />
    </label>
  );
}
function PaceField({ label, value, mile, onChange, placeholder }: { label: string; value: number | null | undefined; mile: boolean; onChange: (v: number | null) => void; placeholder?: string }) {
  const [t, setT] = useState(paceText(value, mile));
  return (
    <label className="space-y-1 text-xs text-muted-foreground"><span>{label} (min:sec /{mile ? 'mi' : 'km'})</span>
      <Input className="h-9 text-foreground" value={t} placeholder={placeholder ?? '4:30'} onChange={(ev) => { setT(ev.target.value); onChange(parsePace(ev.target.value, mile)); }} />
    </label>
  );
}
// Zone tops: power and pace as % of threshold, heart rate in bpm. The last zone is open at the top.
function ZoneEditor({ title, unit, zones, onChange, fallback }: { title: string; unit: string; zones: number[] | null | undefined; onChange: (z: number[] | null) => void; fallback: number[] | null }) {
  const z = zones?.length ? zones : null;
  const tops = z ? z.slice(0, -1) : [];
  const set = (i: number, v: string) => { const n = [...tops]; n[i] = Number(v); onChange([...n, z![z!.length - 1]]); };
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title} · top of each zone ({unit})</div>
      {!z ? (
        <Button variant="outline" size="sm" disabled={!fallback} onClick={() => onChange(fallback)}>{fallback ? 'Start from standard zones' : 'Enter the threshold first'}</Button>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {tops.map((v, i) => (
              <label key={i} className="text-[11px] text-muted-foreground">Z{i + 1}
                <Input inputMode="decimal" className="h-8 px-2 text-foreground" value={Number.isFinite(v) ? v : ''} onChange={(ev) => set(i, ev.target.value)} />
              </label>
            ))}
            <div className="text-[11px] text-muted-foreground">Z{tops.length + 1}<div className="flex h-8 items-center">and up</div></div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" disabled={tops.length >= 9} onClick={() => onChange([...tops, (tops[tops.length - 1] ?? 0) + 5, z[z.length - 1]])}>Add zone</Button>
            <Button variant="outline" size="sm" disabled={tops.length <= 1} onClick={() => onChange([...tops.slice(0, -1), z[z.length - 1]])}>Remove last zone</Button>
            <Button variant="ghost" size="sm" onClick={() => onChange(null)}>Use intervals.icu zones</Button>
          </div>
        </>
      )}
    </div>
  );
}

function OwnEditor({ name, e, icu, types, own, auto, ride, run, onSave, onClose }: {
  name: string; e: Eff; icu?: SportSettings; types: string[]; own: OwnSport; auto: Auto; ride: boolean; run: boolean;
  onSave: (o: OwnSport) => Promise<void>; onClose: () => void;
}) {
  const [v, setV] = useState<Partial<OwnValues>>(() => ({ ...own.v }));
  const [busy, setBusy] = useState(false);
  const mile = /mile/i.test(e.pace_units ?? '');
  const f = <K extends keyof OwnValues>(k: K) => (x: OwnValues[K]) => setV((o) => ({ ...o, [k]: x }));
  const ph = (x: number | null | undefined) => (x != null ? String(x) : undefined);
  const zonesOk = (z?: number[] | null) => !z || z.every((x, i) => Number.isFinite(x) && x > 0 && (i === 0 || x > z[i - 1]));
  async function save(send: boolean) {
    if (![v.power_zones, v.hr_zones, v.pace_zones].every(zonesOk)) return toast.error('Each zone top must be a number higher than the one before.');
    setBusy(true);
    try {
      await onSave({ mode: 'own', v });
      if (send) {
        const m = effective(icu, { mode: 'own', v }, types);
        const r = await callApi<{ sent: string[] }>('zones', { id: icu?.id ?? null, type: types[0], values: {
          ftp: m.ftp, indoor_ftp: v.indoor_ftp, w_prime: m.w_prime, p_max: v.p_max, lthr: m.lthr, max_hr: m.max_hr, threshold_pace: m.threshold_pace,
          power_zones: v.power_zones, hr_zones: v.hr_zones, pace_zones: v.pace_zones } });
        toast.success(`Sent to intervals.icu (${r.sent.length} settings)`);
      } else toast.success('Saved');
      onClose();
    } catch (err) { toast.error((err as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">Leave a box empty to keep the intervals.icu number (shown in grey).</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ride && <NumField label="FTP" unit="W" value={v.ftp} onChange={f('ftp')} placeholder={ph(icu?.ftp)} />}
        {ride && <NumField label="Indoor FTP" unit="W" value={v.indoor_ftp} onChange={f('indoor_ftp')} placeholder={ph(icu?.indoor_ftp)} />}
        {ride && <NumField label="Critical power" unit="W" value={v.cp} onChange={f('cp')} />}
        {ride && <NumField label="W′" unit="J" value={v.w_prime} onChange={f('w_prime')} placeholder={ph(icu?.w_prime)} />}
        {ride && <NumField label="Peak power 1 s" unit="W" value={v.p_max} onChange={f('p_max')} placeholder={ph(icu?.p_max ?? auto.p1)} />}
        {ride && <NumField label="5-min power" unit="W" value={v.vo2_power} onChange={f('vo2_power')} placeholder={ph(auto.p5)} />}
        {run && <PaceField label="Threshold pace" value={v.threshold_pace} mile={mile} onChange={f('threshold_pace')} placeholder={paceText(icu?.threshold_pace, mile) || undefined} />}
        {run && <PaceField label="5-min best pace" value={v.vo2_pace} mile={mile} onChange={f('vo2_pace')} placeholder={paceText(auto.v5, mile) || undefined} />}
        <NumField label="LTHR" unit="bpm" value={v.lthr} onChange={f('lthr')} placeholder={ph(icu?.lthr)} />
        <NumField label="LT1 HR" unit="bpm" value={v.lt1_hr} onChange={f('lt1_hr')} />
        <NumField label="Max HR" unit="bpm" value={v.max_hr} onChange={f('max_hr')} placeholder={ph(icu?.max_hr)} />
        <NumField label="Resting HR" unit="bpm" value={v.resting_hr} onChange={f('resting_hr')} />
        {(ride || run) && <NumField label="VO2max" unit="ml/kg/min" value={v.vo2max} onChange={f('vo2max')} placeholder={ph(auto.vo2)} />}
      </div>
      {(ride || icu?.power_zones?.length) && <ZoneEditor title="Power zones" unit="% of FTP" zones={v.power_zones} onChange={f('power_zones')} fallback={icu?.power_zones ?? DEFAULT_POWER} />}
      {(run || icu?.pace_zones?.length) && <ZoneEditor title="Pace zones" unit="% of threshold speed" zones={v.pace_zones} onChange={f('pace_zones')} fallback={icu?.pace_zones ?? DEFAULT_PACE} />}
      <ZoneEditor title="Heart rate zones" unit="bpm" zones={v.hr_zones} onChange={f('hr_zones')} fallback={icu?.hr_zones ?? defaultHr(v.lthr ?? icu?.lthr, v.max_hr ?? icu?.max_hr)} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save(false)}>Save</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void save(true)}>Save and send to intervals.icu</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground">Send changes your {name} Sport Settings in intervals.icu (FTP, W′, peak power, LTHR, max HR, threshold pace and zones). CP, LT1, 5-min numbers and VO2max stay in Aevigor.</p>
    </div>
  );
}

export function Profile() {
  const { session } = useAuth();
  const p = useProfile().data!;
  const qc = useQueryClient();
  const well = useWellness(p).data ?? [];
  const vo2 = [...well].reverse().map((w) => (w.extra as Record<string, unknown> | null)?.vo2max).find((v) => typeof v === 'number') as number | undefined;
  const a = p.athlete;
  const my = usePref<MyZones>(MY_ZONES_KEY, {});
  const curves = useCurves(p).data ?? [], pace = usePaceCurves(p).data ?? [];
  const auto: Auto = { vo2: vo2 ?? null, p5: bestWatts(curves, 300), p1: bestWatts(curves, 1), v5: bestSpeed5min(pace) };
  const saveSport = async (name: string, o: OwnSport) => {
    try { await my.save({ ...my.value, [name]: o }); } catch (err) { toast.error((err as Error).message); throw err; }
  };
  const icuSports = a?.sports ?? [];
  const named = icuSports.map((s) => ({ name: sportName(s.types), s }));
  const cards = [
    ...['Cycling', 'Running'].map((n) => ({ name: n, s: named.find((x) => x.name === n)?.s })),
    ...named.filter((x) => x.name !== 'Cycling' && x.name !== 'Running')
  ];
  async function saveSex(sex: 'female' | 'male' | 'unspecified') {
    const { error } = await supabase.from('profiles').update({ sex }).eq('user_id', p.user_id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ['profile'] });
  }
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-bold tracking-wide">Profile</h1>
      <Section title="You" open>
        <p><b>{p.display_name || 'No name set'}</b><br /><span className="text-muted-foreground">{session?.user.email}</span>
          {(p as { athlete_code?: string | null }).athlete_code && <><br /><span className="text-xs text-muted-foreground">Athlete ID </span><span className="inline-block -skew-x-6 rounded bg-gradient-to-r from-[#FF6B00] to-[#FF2E63] px-1.5 font-display text-sm font-extrabold italic tracking-wider text-white">{(p as { athlete_code?: string }).athlete_code}</span></>}</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 font-medium">Sex <HelpQ text="Sets the body figure on the body maps. Female also offers cycle tracking (you turn it on). Prefer not to say shows the male figure and every option." /></div>
          <Chips>{SEXES.map(([k, l]) => <Chip key={k} on={(p.sex ?? 'unspecified') === k} onClick={() => void saveSex(k)}>{l}</Chip>)}</Chips>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Weight" value={a?.weight != null ? `${a.weight} kg` : null} />
          <Stat label="Resting HR" value={a?.resting_hr != null ? `${a.resting_hr} bpm` : null} />
        </div>
      </Section>
      <div className="flex items-center gap-2 pt-1"><h2 className="font-semibold">Thresholds and zones</h2>
        <HelpQ text="Each sport can follow your intervals.icu Sport Settings (updated at every sync) or use your own numbers. With My own you can also send them to intervals.icu so every app matches. 5-min power, peak power and VO2max fill in from your best efforts and watch until you type your own. Zone models are explained in Learn." /></div>
      {cards.map((c, i) => <SportCard key={c.name + i} name={c.name} icu={c.s} own={my.value[c.name]} auto={auto} onSave={(o) => saveSport(c.name, o)} />)}
      <a className="block text-sm text-primary underline" href="https://intervals.icu/settings" target="_blank" rel="noopener">Edit in intervals.icu Settings</a>
    </div>
  );
}
