// "Photo of my log": take a photo or pick a screenshot of a workout log, read it on the phone (Tesseract.js, free,
// the picture never leaves the device; only the reader's language file is downloaded once), and fill in the lifts.
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useExercises } from '@/components/ExercisePicker';
import { parseLog, type ReadLift } from '@/lib/logreader';

export function PhotoLogButton({ unit, onRead }: { unit: 'kg' | 'lb'; onRead: (lifts: ReadLift[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const all = useExercises();
  const [busy, setBusy] = useState<number | null>(null);
  async function read(file: File) {
    setBusy(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') setBusy(Math.round(m.progress * 100)); } });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      const lifts = parseLog(data.text, (all ?? []).map((x) => x.n), unit);
      if (!lifts.length) toast.error('No sets found in that picture. Try a sharper, straight-on photo, or add them by hand.');
      else {
        onRead(lifts);
        const sets = lifts.reduce((s, l) => s + l.sets.length, 0);
        toast.success(`Read ${lifts.length} exercise${lifts.length > 1 ? 's' : ''}, ${sets} sets. Check them before saving.`);
      }
    } catch (e) {
      toast.error('The photo reader could not start: ' + (e as Error).message);
    } finally { setBusy(null); if (input.current) input.current.value = ''; }
  }
  return (
    <>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); }} />
      <Button type="button" variant="outline" className="w-full" disabled={busy !== null || !all} onClick={() => input.current?.click()}>
        {busy !== null ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Reading photo{busy ? ` ${busy}%` : '…'}</> : <><Camera className="mr-1 h-4 w-4" /> Photo of my log</>}
      </Button>
    </>
  );
}
