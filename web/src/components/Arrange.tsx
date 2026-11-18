// "Edit layout": drag cards into any order and hide the ones you don't want. Saved to your account (ui_layout),
// with this browser as a fallback so it still works before the first save.
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export type ArrangeCard = { id: string; label: string; node: ReactNode };
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

export function Arrange({ page, cards }: { page: string; cards: ArrangeCard[] }) {
  const saved = useSaved(page);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<string[]>([]);
  const ids = cards.map((c) => c.id);
  const base = saved.data?.card_order ?? [];
  const current = [...base.filter((x) => ids.includes(x)), ...ids.filter((x) => !base.includes(x))];
  useEffect(() => { if (open) { setOrder(current); setHidden(saved.data?.hidden ?? []); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (e.over && e.active.id !== e.over.id) setOrder((o) => arrayMove(o, o.indexOf(String(e.active.id)), o.indexOf(String(e.over!.id))));
  };
  const save = async (v: Saved) => {
    try { localStorage.setItem(lsKey(page), JSON.stringify(v)); } catch { /* private mode */ }
    const { error } = await supabase.from('ui_layout').upsert({ page, ...v, updated_at: new Date().toISOString() }, { onConflict: 'user_id,page' });
    if (error) toast.error(error.message);
    qc.setQueryData(['ui_layout', page], v);
    setOpen(false);
  };
  const hid = saved.data?.hidden ?? [];
  return (
    <>
      {current.filter((id) => !hid.includes(id)).map((id) => <div key={id}>{cards.find((c) => c.id === id)!.node}</div>)}
      <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setOpen(true)}><LayoutGrid /> Edit layout</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit layout</SheetTitle><SheetDescription>Drag to reorder. Switch off cards you don't want.</SheetDescription></SheetHeader>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {order.map((id) => <Row key={id} id={id} label={cards.find((c) => c.id === id)!.label} shown={!hidden.includes(id)} onShown={(v) => setHidden(v ? hidden.filter((x) => x !== id) : [...hidden, id])} />)}
              </div>
            </SortableContext>
          </DndContext>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => save({ card_order: ids, hidden: [] })}>Reset to default</Button>
            <Button className="flex-1" onClick={() => save({ card_order: order, hidden })}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
