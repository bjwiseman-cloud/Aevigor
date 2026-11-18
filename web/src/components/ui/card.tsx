import * as React from 'react';
import { cn } from '@/lib/utils';
import { HelpButton } from '@/components/Help';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />
));
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 p-5', className)} {...props} />
));
CardHeader.displayName = 'CardHeader';

// help: a Learn topic id (web/src/content/learn.json). Adds the "?" button at the right of the title.
const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { help?: string }>(({ className, help, children, ...props }, ref) => (
  <div ref={ref} className={cn('font-serif text-base font-bold tracking-wide text-foreground', help && 'flex items-center justify-between gap-2', className)} {...props}>
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
