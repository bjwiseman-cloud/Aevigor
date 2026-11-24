import * as React from 'react';
import { cn } from '@/lib/utils';
import { HelpButton } from '@/components/Help';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  // Race Day card: orange-to-pink speed stripe down the left edge, soft navy gradient in dark mode
  <div ref={ref} className={cn('relative overflow-hidden rounded-lg border bg-gradient-to-br from-card to-card-to text-card-foreground shadow-[0_6px_18px_rgba(27,71,201,0.08)] dark:shadow-[0_6px_20px_rgba(0,0,0,0.4)] before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:z-[1] before:w-1 before:bg-gradient-to-b before:from-[#FF6B00] before:to-[#FF2E63]', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

// help: a Learn topic id (web/src/content/learn.json). Adds the "?" button at the right of the title.
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { help?: string }>(({ className, help, children, ...props }, ref) => (
  <div ref={ref} className={cn('font-display text-lg font-extrabold uppercase italic leading-tight tracking-wide text-heading', help && 'flex items-center justify-between gap-2', className)} {...props}>
    {help ? <><span className="min-w-0">{children}</span><HelpButton topic={help} /></> : children}
  </div>
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-5 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex items-center p-5 pt-0', className)} {...props} />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
