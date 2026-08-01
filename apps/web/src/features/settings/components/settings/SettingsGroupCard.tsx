'use client';

import * as React from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from '@workspace/ui';
import { ChevronDown } from 'lucide-react';

/** Shared settings row used by Editor / Terminal (and similar) sections. */
export function SettingsGroupRow({
  title,
  description,
  children,
  wide = false,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border px-2 py-4 last:border-b-0">
      <div
        className={cn(
          'grid gap-8',
          wide
            ? 'grid-cols-[minmax(0,1fr)_320px]'
            : 'grid-cols-[minmax(0,1fr)_100px]',
        )}
      >
        <div>
          <p className="text-base font-medium text-foreground">{title}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {footer}
        </div>
        <div className="flex items-center justify-end">{children}</div>
      </div>
    </div>
  );
}

/** Shared collapsible settings card (Editor / Terminal group chrome). */
export function SettingsGroupCard({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="overflow-hidden rounded-2xl border border-border"
    >
      <div className="flex items-start justify-between gap-4 px-6 py-5">
        <CollapsibleTrigger className="group min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 size-5 shrink-0">
              <Icon className="absolute inset-0 size-5 transition-opacity duration-150 group-hover:opacity-0" />
              <ChevronDown className="absolute inset-0 size-5 opacity-0 transition-all duration-150 group-hover:opacity-100 group-data-[state=closed]:-rotate-90" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{title}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t border-border px-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
