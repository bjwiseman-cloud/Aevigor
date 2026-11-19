// Zone tables from intervals.icu Sport Settings. Power zones are % of FTP, pace zones % of threshold speed,
// HR zones are the top bpm of each zone (as intervals.icu stores them). 999 marks an open top zone.
import type { SportSettings } from '@/lib/types';

export type ZoneRow = { name: string; from: string; to: string };
const nm = (names: string[] | null, i: number) => names?.[i] || `Z${i + 1}`;

export function powerZones(s: SportSettings): ZoneRow[] {
  if (!s.power_zones?.length || !s.ftp) return [];
  const w = (p: number) => Math.round((s.ftp! * p) / 100);
  return s.power_zones.map((p, i) => {
    const lo = i ? s.power_zones![i - 1] : 0;
    return { name: nm(s.power_zone_names, i), from: `${w(lo)} W`, to: p >= 999 ? '+' : `${w(p)} W (${p}%)` };
  });
}
export function hrZones(s: SportSettings): ZoneRow[] {
  if (!s.hr_zones?.length) return [];
  return s.hr_zones.map((b, i) => ({ name: nm(s.hr_zone_names, i), from: `${i ? s.hr_zones![i - 1] + 1 : 0} bpm`, to: b >= 999 ? '+' : `${b} bpm` }));
}
export const paceStr = (mps: number, mile = false) => {
  if (!mps) return '–';
  const secs = (mile ? 1609.34 : 1000) / mps;
  return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')} /${mile ? 'mi' : 'km'}`;
};
export function paceZones(s: SportSettings): ZoneRow[] {
  if (!s.pace_zones?.length || !s.threshold_pace) return [];
  const mile = /mile/i.test(s.pace_units ?? '');
  const sp = (p: number) => (s.threshold_pace! * p) / 100;
  return s.pace_zones.map((p, i) => {
    const lo = i ? s.pace_zones![i - 1] : 0;
    return { name: nm(s.pace_zone_names, i), from: lo ? paceStr(sp(lo), mile) : 'slower', to: p >= 999 ? 'faster' : paceStr(sp(p), mile) };
  });
}
// Which sport a settings block is: the first matching type wins
export function sportName(types: string[]) {
  if (types.some((t) => /Ride/.test(t))) return 'Cycling';
  if (types.some((t) => /Run/.test(t))) return 'Running';
  if (types.some((t) => /Swim/.test(t))) return 'Swimming';
  return types[0]?.replace(/([a-z])([A-Z])/g, '$1 $2') ?? 'Other';
}
