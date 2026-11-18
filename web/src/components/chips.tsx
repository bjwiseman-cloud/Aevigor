import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Chip({ on, onClick, children, className }: { on?: boolean; onClick: () => void; children: ReactNode; className?: string }) {
  return (
    <button type="button" aria-pressed={!!on} onClick={onClick}
      className={cn('rounded-full border px-3 py-1 text-sm transition-colors', on ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted', className)}>
      {children}
    </button>
  );
}

export function Chips({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-wrap gap-1.5', className)}>{children}</div>;
}

export function Stepper({ value, onChange, min = 0, step = 1, label }: { value: number; onChange: (v: number) => void; min?: number; step?: number; label: string }) {
  return (
    <div className="inline-flex items-center rounded-md border" role="group" aria-label={label}>
      <button type="button" className="px-2.5 py-1.5" aria-label={`Less ${label}`} onClick={() => onChange(Math.max(min, +(value - step).toFixed(3)))}><Minus className="h-4 w-4" /></button>
      <span className="min-w-[3ch] text-center font-mono">{value}</span>
      <button type="button" className="px-2.5 py-1.5" aria-label={`More ${label}`} onClick={() => onChange(+(value + step).toFixed(3))}><Plus className="h-4 w-4" /></button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">{label}{hint && <span className="ml-1 font-normal text-muted-foreground">· {hint}</span>}</div>
      {children}
    </div>
  );
}
