// A collapsible card for Settings and Profile: tap the title to open or close it.
import type { ReactNode } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function Section({ title, children, open, extra }: { title: ReactNode; children: ReactNode; open?: boolean; extra?: ReactNode }) {
  return (
    <Accordion type="single" collapsible defaultValue={open ? 's' : undefined} className="rounded-lg border bg-card px-4 text-card-foreground shadow-sm">
      <AccordionItem value="s" className="border-b-0">
        <AccordionTrigger className="py-3 text-base font-semibold hover:no-underline"><span className="flex items-center gap-2">{title}{extra}</span></AccordionTrigger>
        <AccordionContent className="space-y-3 pb-4 text-sm">{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
