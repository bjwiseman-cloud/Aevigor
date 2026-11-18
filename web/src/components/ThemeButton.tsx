import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, Chips } from '@/components/chips';
import { useTheme, type Mode } from '@/lib/theme';

const NEXT: Record<Mode, Mode> = { auto: 'light', light: 'dark', dark: 'auto' };
const LABEL: Record<Mode, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' };

// Header button: taps through Auto → Light → Dark
export function ThemeButton() {
  const { mode, setMode } = useTheme();
  const Icon = mode === 'auto' ? Monitor : mode === 'light' ? Sun : Moon;
  return (
    <Button variant="ghost" size="icon" onClick={() => setMode(NEXT[mode])} aria-label={`Appearance: ${LABEL[mode]}. Tap to change.`} title={`Appearance: ${LABEL[mode]}`}>
      <Icon />
    </Button>
  );
}

export function ThemeChips() {
  const { mode, setMode } = useTheme();
  return <Chips>{(['auto', 'light', 'dark'] as Mode[]).map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{LABEL[m]}</Chip>)}</Chips>;
}
