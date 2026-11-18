// Shared bits for the Recharts charts (Recharts needs real colour values, not CSS variables).
import type { ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export const C = {
  grid: '#16324a', axis: '#5f7f99', text: '#cfefff', cyan: '#00f0ff', green: '#39ff9a', yellow: '#ffcc00',
  red: '#ff3d3d', orange: '#ff6a00', magenta: '#ff4fd8', grey: '#5f7f99', band: '#00f0ff'
};

export const axis = { stroke: C.axis, tick: { fill: C.axis, fontSize: 10 }, tickLine: false };

export function shortDay(d: string) {
  return new Date(d + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export const tooltipStyle = {
  contentStyle: { background: '#06121d', border: '1px solid #16324a', borderRadius: 6, fontSize: 12 },
  labelStyle: { color: C.text },
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
