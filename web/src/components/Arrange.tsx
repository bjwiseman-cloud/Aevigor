// Cards on every tab: press and hold a card (phone) or click and hold (computer) to drag it to a new place, and
// "Choose cards" to switch cards off or reorder them in a list. Saved to your account (ui_layout), with this
// browser as a fallback so it still works before the first save. The hold delay keeps taps, scrolling, charts
// and sliders working as normal: moving before the hold ends cancels the drag.
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

// more: the card sits in the "More cards" drop-down under the main cards (Ben 2026-11-23).
export type ArrangeCard = { id: string; label: string; node: ReactNode; off?: boolean; more?: boolean };
type Saved = { card_order: string[]; hidden: string[] };
const lsKey = (page: string) => `aev-layout-${page}`;

function useSaved(page: string) {
  return useQuery({
    queryKey: ['ui_layout', page],
    queryFn: async (): Promise<Saved | null> => {
      const { data } = await supabase.from('ui_layout').select('card_order, hidden').eq('page', page).maybeSingle();
      if (data) return data as Saved;
      try { const s = localStorage.getItem(lsKey(page)); return s ? JSON.parse(s) : null; } catch { return null; }
    }
  });
}

function useSave(page: string) {
  const qc = useQueryClient();
  return async (v: Saved) => {
    qc.setQueryData(['ui_layout', page], v);
    try { localStorage.setItem(lsKey(page), JSON.stringify(v)); } catch { /* private mode */ }
    const { error } = await supabase.from('ui_layout').upsert({ page, ...v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,page' });
    if (error) toast.error(error.message);
  };
}

function useHoldSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 350, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
}

function Row({ id, label, shown, onShown }: { id: string; label: string; shown: boolean; onShown: (v: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="flex items-center gap-2 rounded-md border bg-card px-2 py-2">
      <button type="button" className="cursor-grab touch-none p-1" aria-label={`Move ${label}`} {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
      <span className="flex-1 text-sm">{label}</span>
      <Switch checked={shown} onCheckedChange={onShown} aria-label={`Show ${label}`} />
    </div>
  );
}

function Movable({ id, children }: { id: string; children: ReactNode }) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('[-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none', isDragging && 'relative z-20 scale-[1.02] rounded-lg opacity-90 shadow-xl ring-2 ring-primary')}>
      {children}
    </div>
  );
}

/** Cards that can be moved by press-and-hold and switched off. Cards marked `off` start hidden until switched on. */
export function Arrange({ page, cards, chooser = true }: { page: string; cards: ArrangeCard[]; chooser?: boolean }) {
  const saved = useSaved(page);
  const save = useSave(page);
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const ids = cards.map((c) => c.id);
  const defHidden = cards.filter((c) => c.off).map((c) => c.id);
  const base = saved.data?.card_order ?? [];
  // New cards (not in the saved order yet) go in at their default place: just before the next card that follows them.
  const current = base.filter((x) => ids.includes(x));
  ids.forEach((id, i) => {
    if (current.includes(id)) return;
    const next = ids.slice(i + 1).find((x) => current.includes(x));
    current.splice(next ? current.indexOf(next) : current.length, 0, id);
  });
  const hid = saved.data ? saved.data.hidden.filter((x) => ids.includes(x)).concat(defHidden.filter((x) => !base.includes(x))) : defHidden;
  useEffect(() => { if (open) { setOrder(current); setHidden(hid); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const sensors = useHoldSensors();
  const listSensors = useSensors(useSensor(MouseSensor), useSensor(TouchSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const visible = current.filter((id) => !hid.includes(id));
  const byId = (id: string) => cards.find((c) => c.id === id)!;
  const main = visible.filter((id) => !byId(id).more), extra = visible.filter((id) => byId(id).more);
  // Dragging on the page moves the card among the visible ones; hidden cards keep their places.
  const onPageDrop = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(current, current.indexOf(String(e.active.id)), current.indexOf(String(e.over.id)));
    navigator.vibrate?.(10);
    void save({ card_order: next, hidden: hid });
  };
  const onListDrop = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) setOrder((o) => arrayMove(o, o.indexOf(String(e.active.id)), o.indexOf(String(e.over!.id))));
  };
  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={() => navigator.vibrate?.(15)} onDragEnd={onPageDrop}>
        <SortableContext items={main} strategy={verticalListSortingStrategy}>
          {main.map((id) => <Movable key={id} id={id}>{byId(id).node}</Movable>)}
        </SortableContext>
      </DndContext>
      {extra.length > 0 && (
        <Accordion type="single" collapsible className="rounded-xl border bg-card px-3">
          <AccordionItem value="more" className="border-none">
            <AccordionTrigger className="text-sm font-semibold">More cards ({extra.length})<span className="ml-2 mr-auto truncate text-xs font-normal text-muted-foreground">{extra.map((id) => byId(id).label).join(' · ')}</span></AccordionTrigger>
            <AccordionContent className="space-y-4 pb-3">{extra.map((id) => <div key={id}>{byId(id).node}</div>)}</AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
      {chooser && <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setOpen(true)}><LayoutGrid /> Choose cards</Button>}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader><SheetTitle>Choose cards</SheetTitle><SheetDescription>Switch cards on or off, and drag to reorder. Tip: on the page itself, press and hold any card (or click and hold on a computer) and drag it.</SheetDescription></SheetHeader>
          <DndContext sensors={listSensors} collisionDetection={closestCenter} onDragEnd={onListDrop}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {order.map((id) => <Row key={id} id={id} label={byId(id).label} shown={!hidden.includes(id)} onShown={(v) => setHidden(v ? hidden.filter((x) => x !== id) : [...hidden, id])} />)}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => { void save({ card_order: ids, hidden: defHidden }); setOpen(false); }}>Reset to default</Button>
            <Button className="flex-1" onClick={() => { void save({ card_order: order, hidden }); setOpen(false); }}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
