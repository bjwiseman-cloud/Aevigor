import type { ReactNode } from 'react';
import { Brand } from './Layout';

export function Message({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b px-4 py-3"><Brand /></header>
      <main className="mx-auto max-w-lg p-4">
        <h1 className="mb-3 mt-2 font-mono text-xl text-primary">{title}</h1>
        <div className="text-muted-foreground">{children}</div>
      </main>
    </div>
  );
}
