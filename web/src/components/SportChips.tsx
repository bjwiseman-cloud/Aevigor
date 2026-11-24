// Sport chips, multi-select (Ben 2026-11-24): Cycling, Running, Lifting and a More dropdown, on Training and
// Performance. Tap chips to pick any combination; "All" clears the pick. An empty list means all sports.
import { Chip } from '@/components/chips';

export type SportOpt = { id: string; label: string };

export function toggleSport(list: string[], id: string, keepOne = false) {
  if (list.includes(id)) return keepOne && list.length === 1 ? list : list.filter((x) => x !== id);
  return [...list, id];
}

export function SportChips({ fixed, more = [], moreLabel, value, onChange, allLabel = 'All', keepOne = false, allIds, noAll = false }: {
  fixed: SportOpt[]; more?: string[]; moreLabel?: (id: string) => string; value: string[]; onChange: (v: string[]) => void;
  allLabel?: string; keepOne?: boolean; allIds?: string[]; noAll?: boolean;   // allIds: what "All" selects when an empty pick is not allowed
}) {
  const allOn = !noAll && (value.length === 0 || (!!allIds && allIds.every((x) => value.includes(x)) && value.length === allIds.length));
  const extra = value.filter((v) => more.includes(v));
  // More: a small drop-down; picking a sport from it adds that sport as its own chip (Ben 2026-11-24)
  const moreSel = more.length > 0 && (
    <select className="h-7 w-[4.25rem] shrink-0 appearance-none rounded-full border bg-card px-2.5 text-center text-xs font-semibold" value="" onChange={(e) => e.target.value && onChange([...(allOn ? [] : value), e.target.value])} aria-label="More sports">
      <option value="">More ▾</option>{more.filter((k) => !value.includes(k)).map((k) => <option key={k} value={k}>{moreLabel?.(k) ?? k}</option>)}
    </select>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Sports">
      {noAll ? moreSel : <Chip on={allOn} onClick={() => onChange(allIds ?? [])}>{allLabel}</Chip>}
      {fixed.map((s) => <Chip key={s.id} on={!allOn && value.includes(s.id)} onClick={() => onChange(toggleSport(allOn ? [] : value, s.id, keepOne))}>{s.label}</Chip>)}
      {extra.map((k) => <Chip key={k} on onClick={() => onChange(toggleSport(value, k, keepOne))}>{moreLabel?.(k) ?? k} ✕</Chip>)}
      {!noAll && moreSel}
    </div>
  );
}

/** Remembered pick per page, on this device. */
export function loadSports(key: string, def: string[] = []): string[] {
  try { const v = JSON.parse(localStorage.getItem(`aev-sports-${key}`) || 'null'); return Array.isArray(v) ? v : def; } catch { return def; }
}
export function saveSports(key: string, v: string[]) {
  try { localStorage.setItem(`aev-sports-${key}`, JSON.stringify(v)); } catch { /* private mode */ }
}
/** "VirtualRide" → "Virtual Ride" */
export const typeLabel = (t: string) => t.replace(/([a-z])([A-Z])/g, '$1 $2');
