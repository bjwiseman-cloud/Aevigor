export function todayIn(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function niceDay(day: string): string {
  return new Date(day + 'T12:00:00Z').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function timeZones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    list = ['America/Edmonton', 'America/Vancouver', 'America/Toronto'];
  }
  return list.includes(current) ? list : [current, ...list];
}

export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Edmonton';
}

export function fmt(v: number | null | undefined, unit = ''): string {
  return v === null || v === undefined || !isFinite(v) ? '–' : `${Math.round(v * 10) / 10}${unit}`;
}
