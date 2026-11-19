import { useState } from 'react';

// Small "?" that opens a short explanation in place.
export function HelpQ({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="shrink-0 text-right">
      <button type="button" aria-label="What is this?" aria-expanded={open} onClick={() => setOpen(!open)} className="h-6 w-6 rounded-full border text-xs text-muted-foreground">?</button>
      {open && <span className="mt-1 block max-w-[17rem] text-left text-xs font-normal text-muted-foreground">{text}</span>}
    </span>
  );
}
