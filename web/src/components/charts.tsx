// Shared bits for the Recharts charts (Recharts needs real colour values, not CSS variables).
// Colours follow the theme: C, axis and tooltipStyle are read when a chart renders, and Layout
// re-renders the page when the theme changes.
import type { ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { resolved } from '@/lib/theme';

type Pal = { grid: string; axis: string; text: string; cyan: string; green: string; yellow: string; red: string; orange: string; magenta: string; grey: string; band: string; tip: string };
// Names are kept from the first app (cyan = main series colour); the values are the website palettes.
const PAL: Record<'light' | 'dark', Pal> = {
  light: { grid: '#ddd4c4', axis: '#8a8278', text: '#171615', cyan: '#2f5d86', green: '#3f7d4e', yellow: '#a87b14', red: '#b4381f', orange: '#c4621c', magenta: '#8a4a86', grey: '#8a8278', band: '#2f5d86', tip: '#fffdf8' },
  dark: { grid: '#38332d', axis: '#7d766c', text: '#ece6da', cyan: '#d2ae66', green: '#8fbf7f', yellow: '#e0c068', red: '#e07a5f', orange: '#e09a52', magenta: '#c79bd0', grey: '#7d766c', band: '#d2ae66', tip: '#1f1c19' }
};
const pal = () => PAL[resolved()];
export const C = Object.fromEntries(
  (Object.keys(PAL.light) as (keyof Pal)[]).map((k) => [k, undefined])
) as unknown as Pal;
for (const k of Object.keys(PAL.light) as (keyof Pal)[]) Object.defineProperty(C, k, { get: () => pal()[k], enumerable: true });

export const axis = {
  get stroke() { return C.axis; },
  get tick() { return { fill: C.axis, fontSize: 10 }; },
  tickLine: false
};

export function shortDay(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const tooltipStyle = {
  get contentStyle() { return { background: C.tip, border: `1px solid ${C.grid}`, borderRadius: 4, fontSize: 12, color: C.text }; },
  get labelStyle() { return { color: C.text }; },
  labelFormatter: (d: unknown) => (typeof d === 'string' && /^\d{4}-/.test(d) ? shortDay(d) : String(d))
};

export function HowToRead({ children }: { children: ReactNode }) {
  return (
    <Accordion type="single" collapsible className="mt-1">
      <AccordionItem value="how" className="border-b-0">
        <AccordionTrigger className="py-2 text-xs text-muted-foreground">How to read this chart</AccordionTrigger>
        <AccordionContent className="space-y-1.5 text-xs text-muted-foreground">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; area?: boolean }[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-4 rounded-sm"
            style={i.area ? { background: i.color + '55', border: `1px ${i.dashed ? 'dashed' : 'solid'} ${i.color}` } : { borderTop: `2px ${i.dashed ? 'dashed' : 'solid'} ${i.color}`, height: 0 }}
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
