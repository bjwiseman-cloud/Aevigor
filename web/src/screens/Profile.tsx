// Profile: name, sex (sets the body figure and women's health options), and thresholds and zones per sport
// copied from intervals.icu Sport Settings at each sync. Zones are edited in intervals.icu, so every app matches.
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { useProfile, useWellness } from '@/hooks/data';
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
function SportCard({ s, vo2 }: { s: SportSettings; vo2: number | null }) {
  const name = sportName(s.types);
  const ride = name === 'Cycling', run = name === 'Running';
  const mile = /mile/i.test(s.pace_units ?? '');
  return (
    <Section title={name}>
      <p className="text-xs text-muted-foreground">{s.types.map((t) => t.replace(/([a-z])([A-Z])/g, '$1 $2')).join(', ')}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {s.ftp != null && <Stat label={ride ? 'FTP' : 'Threshold power'} value={`${s.ftp} W`} />}
        {s.indoor_ftp != null && s.indoor_ftp !== s.ftp && <Stat label="Indoor FTP" value={`${s.indoor_ftp} W`} />}
        {s.w_prime != null && <Stat label="W′" value={`${(s.w_prime / 1000).toFixed(1)} kJ`} />}
        {s.p_max != null && <Stat label="Peak power" value={`${s.p_max} W`} />}
        {s.threshold_pace != null && <Stat label="Threshold pace" value={paceStr(s.threshold_pace, mile)} />}
        <Stat label="LTHR" value={s.lthr != null ? `${s.lthr} bpm` : null} />
        <Stat label="Max HR" value={s.max_hr != null ? `${s.max_hr} bpm` : null} />
        {(ride || run) && <Stat label="VO2max (watch)" value={vo2} />}
      </div>
      <Zones title="Power zones" rows={powerZones(s)} />
      <Zones title="Pace zones" rows={paceZones(s)} />
      <Zones title="Heart rate zones" rows={hrZones(s)} />
    </Section>
  );
}

export function Profile() {
  const { session } = useAuth();
  const p = useProfile().data!;
  const qc = useQueryClient();
  const well = useWellness(p).data ?? [];
  const vo2 = [...well].reverse().map((w) => (w.extra as Record<string, unknown> | null)?.vo2max).find((v) => typeof v === 'number') as number | undefined;
  const a = p.athlete;
  async function saveSex(sex: 'female' | 'male' | 'unspecified') {
    const { error } = await supabase.from('profiles').update({ sex }).eq('user_id', p.user_id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ['profile'] });
  }
  const order = (s: SportSettings) => ['Cycling', 'Running'].indexOf(sportName(s.types)) + 1 || 9;
  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-bold tracking-wide">Profile</h1>
      <Section title="You" open>
        <p><b>{p.display_name || 'No name set'}</b><br /><span className="text-muted-foreground">{session?.user.email}</span></p>
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
        <HelpQ text="These come from intervals.icu Sport Settings, so every app you use shows the same numbers. To change them, edit them in intervals.icu > Settings; they update here after the next sync. Zone models are explained in Learn." /></div>
      {a?.sports.length
        ? [...a.sports].sort((x, y) => order(x) - order(y)).map((s, i) => <SportCard key={i} s={s} vo2={vo2 ?? null} />)
        : <p className="text-sm text-muted-foreground">Fills in after the next sync, from your intervals.icu Sport Settings.</p>}
      <a className="block text-sm text-primary underline" href="https://intervals.icu/settings" target="_blank" rel="noopener">Edit in intervals.icu Settings</a>
    </div>
  );
}
