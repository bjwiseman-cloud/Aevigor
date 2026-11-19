// "Photo of my log": take a photo or pick a screenshot of a workout log, read it on the phone (Tesseract.js, free,
// the picture never leaves the device; only the reader's language file is downloaded once), and fill in the lifts.
import { useRef, useState } from 'react';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useExercises } from '@/components/ExercisePicker';
import { parseLog, type ReadLift } from '@/lib/logreader';

// Makes a screenshot easier to read: grey, light text on dark (dark-theme apps) turned to dark on light, and
// enlarged up to 2x (kept under 16 million pixels, the most an iPhone canvas allows).
async function prepare(file: File): Promise<HTMLCanvasElement | File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.max(1, Math.min(2, Math.sqrt(16e6 / (bmp.width * bmp.height)), 2400 / bmp.width));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) { const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; d[i] = d[i + 1] = d[i + 2] = g; sum += g; }
    if (sum / (d.length / 4) < 128) for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255 - d[i]; }
    ctx.putImageData(img, 0, 0);
    return c;
  } catch { return file; }
}

export function PhotoLogButton({ unit, onRead }: { unit: 'kg' | 'lb'; onRead: (lifts: ReadLift[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const all = useExercises();
  const [busy, setBusy] = useState<number | null>(null);
  async function read(file: File) {
    setBusy(0);
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, { logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') setBusy(Math.round(m.progress * 100)); } });
      const { data } = await worker.recognize(await prepare(file));
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
