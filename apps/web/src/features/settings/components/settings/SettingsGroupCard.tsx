'use client';

import * as React from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  cn,
} from '@workspace/ui';
import { ChevronDown, FlaskConical } from 'lucide-react';

export const SETTINGS_SECTION_DOM_ID_PREFIX = 'settings-section-';

export function settingsSectionDomId(anchor: string): string {
  return `${SETTINGS_SECTION_DOM_ID_PREFIX}${anchor}`;
}

/** In-page heading sitting above a settings group. */
export function SettingsSection({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title?: string;
  /** Accepted so existing call sites keep type-checking. Group headings no longer show it. */
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id ? settingsSectionDomId(id) : undefined}
      className="scroll-mt-8 space-y-3"
    >
      {title || action ? (
        <div className="flex items-center justify-between gap-4 px-0.5">
          {title ? (
            <h3 className="min-w-0 text-sm font-medium text-foreground">{title}</h3>
          ) : null}
          {action ? <div className="ml-auto shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Muted rounded group that holds settings rows. */
export function SettingsGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl bg-muted/40', className)}>
      <div className="px-3">{children}</div>
    </div>
  );
}

export function SettingsPageStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-8">{children}</div>;
}

/** Amber flask notice for settings pages that are still in active development. */
export function SettingsExperimentalNotice({ children }: { children: React.ReactNode }) {
  return (
    <SettingsGroup className="bg-amber-500/10">
      <div className="flex items-start gap-2 px-2 py-3">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="min-w-0 text-xs leading-5 text-muted-foreground">
          {children}
        </p>
      </div>
    </SettingsGroup>
  );
}

/** Shared settings row used by Editor / Terminal (and similar) sections. */
export function SettingsGroupRow({
  title,
  description,
  children,
  wide = false,
  footer,
}: {
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 px-2 py-3 last:border-b-0">
      <div
        className={cn(
          'grid gap-6',
          wide
            ? 'grid-cols-[minmax(0,1fr)_auto]'
            : 'grid-cols-[minmax(0,1fr)_100px]',
        )}
      >
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground">{title}</div>
          {description ? (
            <div className="mt-1 text-xs leading-5 text-muted-foreground">
              {description}
            </div>
          ) : null}
          {footer}
        </div>
        <div className="flex items-center justify-end">{children}</div>
      </div>
    </div>
  );
}

/** Title of a collapsible settings heading: quiet at rest, foreground on hover. */
export const settingsCollapsibleTitleClassName =
  'text-sm font-medium text-muted-foreground group-hover:text-foreground';

/** Chevron next to a collapsible settings heading. */
export const settingsCollapsibleChevronTriggerClassName =
  'cursor-pointer text-muted-foreground hover:text-foreground';

/** Group with a heading outside the muted card; optional collapse. */
export function SettingsGroupCard({
  id,
  open,
  onOpenChange,
  title,
  headerEnd,
  children,
}: {
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  /** Accepted so existing call sites keep type-checking. Group headings no longer show it. */
  description?: React.ReactNode;
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
}) {
  const collapsible = typeof open === 'boolean' && typeof onOpenChange === 'function';

  const titleBlock = (
    <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{title}</p>
  );

  if (!collapsible) {
    return (
      <section
        id={id ? settingsSectionDomId(id) : undefined}
        className="scroll-mt-8 space-y-3"
      >
        <div className="flex items-center justify-between gap-4 px-0.5">
          {titleBlock}
          {headerEnd ? <div className="shrink-0 self-center">{headerEnd}</div> : null}
        </div>
        <SettingsGroup>{children}</SettingsGroup>
      </section>
    );
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={onOpenChange}
      className="scroll-mt-8 space-y-3"
    >
      <section id={id ? settingsSectionDomId(id) : undefined} className="space-y-3">
        <div className="flex items-center gap-2 px-0.5">
          <CollapsibleTrigger className="group flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left">
            <ChevronDown
              className={cn(
                settingsCollapsibleChevronTriggerClassName,
                'size-4 shrink-0 transition-transform duration-150 group-hover:text-foreground',
                !open && '-rotate-90',
              )}
            />
            <p
              className={cn(
                'min-w-0 flex-1',
                open
                  ? 'text-sm font-medium text-foreground'
                  : settingsCollapsibleTitleClassName,
              )}
            >
              {title}
            </p>
          </CollapsibleTrigger>
          {headerEnd ? <div className="shrink-0">{headerEnd}</div> : null}
        </div>
        <CollapsibleContent>
          <SettingsGroup>{children}</SettingsGroup>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
