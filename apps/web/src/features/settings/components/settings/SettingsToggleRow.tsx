'use client';

import React from 'react';
import { Switch } from '@workspace/ui';

interface SettingsToggleRowProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  trailing?: React.ReactNode;
  onCheckedChange: (checked: boolean) => void;
}

/**
 * Shared row primitive for boolean settings toggles (layout / header sections).
 */
export function SettingsToggleRow({
  icon,
  title,
  description,
  checked,
  disabled,
  trailing,
  onCheckedChange,
}: SettingsToggleRowProps) {
  return (
    <div className="border-b border-border/60 px-2 py-3 last:border-b-0">
      <div
        className={
          trailing
            ? 'grid grid-cols-[minmax(0,1fr)_auto] gap-6'
            : 'grid grid-cols-[minmax(0,1fr)_100px] gap-6'
        }
      >
        <div className={icon ? 'flex gap-3' : undefined}>
          {icon ? <span className="mt-0.5 size-4 shrink-0 text-muted-foreground">{icon}</span> : null}
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {trailing}
          <Switch
            checked={checked}
            disabled={disabled}
            onCheckedChange={(value) => onCheckedChange(!!value)}
          />
        </div>
      </div>
    </div>
  );
}
