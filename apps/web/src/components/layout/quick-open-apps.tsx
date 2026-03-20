'use client';

import React, { useMemo } from 'react';
import { useTheme } from 'next-themes';

type QuickOpenAppGroup = 'system' | 'editors' | 'terminals' | 'vscode' | 'jetbrains';

export interface QuickOpenAppOption {
  name: string;
  label: string;
  iconName: string;
  themed?: boolean;
  group: QuickOpenAppGroup;
}

export const QUICK_OPEN_APP_OPTIONS = [
  { name: 'Finder', label: 'Finder', iconName: 'finder', themed: false, group: 'system' },
  { name: 'Terminal', label: 'Terminal', iconName: 'terminal', themed: false, group: 'system' },
  { name: 'Cursor', label: 'Cursor', iconName: 'Cursor', themed: true, group: 'editors' },
  { name: 'Antigravity', label: 'Antigravity', iconName: 'antigravity', themed: false, group: 'editors' },
  { name: 'Zed', label: 'Zed', iconName: 'zed', themed: true, group: 'editors' },
  { name: 'Sublime Text', label: 'Sublime Text', iconName: 'sublime-text', themed: false, group: 'editors' },
  { name: 'Xcode', label: 'Xcode', iconName: 'xcode', themed: false, group: 'editors' },
  { name: 'iTerm', label: 'iTerm', iconName: 'iterm2', themed: true, group: 'terminals' },
  { name: 'Warp', label: 'Warp', iconName: 'warp', themed: false, group: 'terminals' },
  { name: 'Ghostty', label: 'Ghostty', iconName: 'ghostty', themed: false, group: 'terminals' },
  { name: 'VS Code', label: 'VS Code', iconName: 'vscode', themed: false, group: 'vscode' },
  { name: 'VS Code Insiders', label: 'VS Code Insiders', iconName: 'vscode-insiders', themed: false, group: 'vscode' },
  { name: 'IntelliJ IDEA', label: 'IntelliJ IDEA', iconName: 'intellij-idea', themed: false, group: 'jetbrains' },
  { name: 'WebStorm', label: 'WebStorm', iconName: 'webstorm', themed: false, group: 'jetbrains' },
  { name: 'PyCharm', label: 'PyCharm', iconName: 'pycharm', themed: false, group: 'jetbrains' },
  { name: 'GoLand', label: 'GoLand', iconName: 'goland', themed: false, group: 'jetbrains' },
  { name: 'CLion', label: 'CLion', iconName: 'clion', themed: false, group: 'jetbrains' },
  { name: 'Rider', label: 'Rider', iconName: 'rider', themed: false, group: 'jetbrains' },
  { name: 'RustRover', label: 'RustRover', iconName: 'rustrover', themed: false, group: 'jetbrains' },
] as const satisfies readonly QuickOpenAppOption[];

export type QuickOpenAppName = (typeof QUICK_OPEN_APP_OPTIONS)[number]['name'];

export const QUICK_OPEN_APP_NAMES = QUICK_OPEN_APP_OPTIONS.map((option) => option.name) as QuickOpenAppName[];

export const QUICK_OPEN_APP_MAP = Object.fromEntries(
  QUICK_OPEN_APP_OPTIONS.map((option) => [option.name, option])
) as Record<QuickOpenAppName, QuickOpenAppOption>;

export function isQuickOpenAppName(value: unknown): value is QuickOpenAppName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(QUICK_OPEN_APP_MAP, value);
}

export function getQuickOpenAppsByGroup(group: QuickOpenAppGroup) {
  return QUICK_OPEN_APP_OPTIONS.filter((option) => option.group === group);
}

export const QuickOpenAppIcon = ({
  iconName,
  className,
  themed,
}: {
  iconName: string;
  className?: string;
  themed?: boolean;
}) => {
  const { resolvedTheme } = useTheme();
  const themeSuffix = themed ? `_${resolvedTheme === 'dark' ? 'dark' : 'light'}` : '';
  const iconPath = useMemo(() => `/quick_open_app/${iconName}${themeSuffix}.svg`, [iconName, themeSuffix]);
  return <img src={iconPath} alt="" className={className} />;
};
