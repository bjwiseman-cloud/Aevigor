import { useState } from 'react';
import { CircleHelp, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Topic = { id: string; field: string; title: string; short: string; why: string };
type Content = { fields: { id: string; title: string }[]; topics: Topic[] };

// Loaded on first tap only, so the help text is not part of the app's first download.
let cache: Promise<Content> | null = null;
const load = () => (cache ??= import('@/content/learn.json').then((m) => m.default as Content));

// The "?" on a card: what it means and why it matters, with a link to the full Learn page on aevigor.com.
export function HelpButton({ topic }: { topic: string }) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState<{ topic: Topic; field: string } | null>(null);
  const show = () => {
    setOpen(true);
    void load().then((c) => {
      const found = c.topics.find((x) => x.id === topic);
      if (found) setT({ topic: found, field: c.fields.find((f) => f.id === found.field)?.title ?? '' });
    });
  };
  return (
    <>
      <button type="button" onClick={show} aria-label="What is this?" className="-m-1 rounded-full p-1 font-sans text-muted-foreground hover:text-foreground">
        <CircleHelp className="h-4 w-4" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetDescription className="text-xs uppercase tracking-wide">{t ? t.field : 'Help'}</SheetDescription>
            <SheetTitle className="font-serif">{t ? t.topic.title : 'Loading…'}</SheetTitle>
          </SheetHeader>
          {t && (
            <div className="space-y-3 text-sm">
              <p>{t.topic.short}</p>
              <p><b>Why it matters.</b> {t.topic.why}</p>
              {t.topic.field === 'health' && <p className="text-xs text-muted-foreground">Not medical advice.</p>}
              <a className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" href={`/learn/${t.topic.id}.html`} target="_blank" rel="noopener">
                Learn more: how it is worked out, with references <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
