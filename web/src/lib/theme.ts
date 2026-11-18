// Appearance: Auto (follow the device), Light (Modern Eastern) or Dark (Refined Dark).
// Same storage key as aevigor.com, so the website and the app share one choice.
import { useSyncExternalStore } from 'react';

export type Mode = 'auto' | 'light' | 'dark';
const KEY = 'aev-theme';
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

export function getMode(): Mode {
  try { const m = localStorage.getItem(KEY); return m === 'light' || m === 'dark' ? m : 'auto'; } catch { return 'auto'; }
}
export function resolved(): 'light' | 'dark' {
  const m = getMode();
  return m === 'auto' ? (mq?.matches ? 'dark' : 'light') : m;
}
function apply() {
  const d = resolved() === 'dark';
  document.documentElement.classList.toggle('dark', d);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', d ? '#171513' : '#f3eee3');
  listeners.forEach((l) => l());
}
export function setMode(m: Mode) {
  try { if (m === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, m); } catch { /* private mode */ }
  apply();
}
mq?.addEventListener?.('change', apply);
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); });

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, resolved);
  const mode = useSyncExternalStore(subscribe, getMode);
  return { theme, mode, setMode };
}
