"use client";

/* eslint-disable @next/next/no-img-element */

import React, { useMemo } from "react";
import { useTheme } from "next-themes";
import {
  Bot,
  BrainCircuit,
  CommandItem,
  CommandShortcut,
  Gauge,
  getFileIconProps,
  Layers,
  cn,
} from "@workspace/ui";
import type { SearchMatch } from "@/api/ws-api";

export type SearchTab = "app" | "files" | "code";

export interface AppSearchItem {
  id: string;
  type: "workspace" | "theme" | "project" | "new-workspace" | "quick-open" | "management" | "modal" | "todo" | "usage";
  title: string;
  description?: string;
  keywords: string[];
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

const AppIcon = ({ name, className, themed }: { name: string; className?: string; themed?: boolean }) => {
  const { resolvedTheme } = useTheme();
  const themeSuffix = themed ? `_${resolvedTheme === "dark" ? "dark" : "light"}` : "";
  const iconPath = useMemo(() => `/quick_open_app/${name}${themeSuffix}.svg`, [name, themeSuffix]);
  return <img src={iconPath} alt="" className={className} />;
};

export const APP_MAP: Record<string, { icon: React.ReactNode; label: string }> = {
  Finder: { icon: <AppIcon name="finder" className="size-4" />, label: "Finder" },
  Terminal: { icon: <AppIcon name="terminal" className="size-4" />, label: "Terminal" },
  Cursor: { icon: <AppIcon name="Cursor" className="size-4" themed />, label: "Cursor" },
  Zed: { icon: <AppIcon name="zed" className="size-4" themed />, label: "Zed" },
  "Sublime Text": { icon: <AppIcon name="sublime-text" className="size-4" />, label: "Sublime Text" },
  Xcode: { icon: <AppIcon name="xcode" className="size-4" />, label: "Xcode" },
  iTerm: { icon: <AppIcon name="iterm2" className="size-4" themed />, label: "iTerm" },
  Warp: { icon: <AppIcon name="warp" className="size-4" />, label: "Warp" },
  Ghostty: { icon: <AppIcon name="ghostty" className="size-4" />, label: "Ghostty" },
  "VS Code": { icon: <AppIcon name="vscode" className="size-4" />, label: "VS Code" },
  "VS Code Insiders": { icon: <AppIcon name="vscode-insiders" className="size-4" />, label: "VS Code Insiders" },
  "IntelliJ IDEA": { icon: <AppIcon name="intellij-idea" className="size-4" />, label: "IntelliJ IDEA" },
  WebStorm: { icon: <AppIcon name="webstorm" className="size-4" />, label: "WebStorm" },
  PyCharm: { icon: <AppIcon name="pycharm" className="size-4" />, label: "PyCharm" },
  GoLand: { icon: <AppIcon name="goland" className="size-4" />, label: "GoLand" },
  CLion: { icon: <AppIcon name="clion" className="size-4" />, label: "CLion" },
  Rider: { icon: <AppIcon name="rider" className="size-4" />, label: "Rider" },
  RustRover: { icon: <AppIcon name="rustrover" className="size-4" />, label: "RustRover" },
  Antigravity: { icon: <AppIcon name="antigravity" className="size-4" />, label: "Antigravity" },
};

interface SearchItemProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  shortcut?: string;
  onSelect: () => void;
  value: string;
  className?: string;
  isDir?: boolean;
}

export function SearchItem({
  icon,
  title,
  description,
  shortcut,
  onSelect,
  value,
  className,
  isDir = false,
}: SearchItemProps) {
  const iconToRender = useMemo(() => {
    if (icon) return icon;
    const props = getFileIconProps({ name: title, isDir });
    return <img {...props} alt="" className={cn("size-4", props.className)} />;
  }, [icon, title, isDir]);

  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className={cn("group", className)}
    >
      <div className="flex flex-1 items-center gap-3 overflow-hidden">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[selected=true]:bg-background group-data-[selected=true]:text-primary">
          {iconToRender}
        </div>
        <div className="flex min-w-0 flex-col pr-2">
          <span className="truncate font-medium">{title}</span>
          {description ? (
            <span className="truncate text-xs text-muted-foreground opacity-80">{description}</span>
          ) : null}
        </div>
      </div>
      {shortcut ? (
        <CommandShortcut className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">
          {shortcut}
        </CommandShortcut>
      ) : null}
    </CommandItem>
  );
}

interface CodeSearchResultItemProps {
  match: SearchMatch;
  onHover: (value: string | null) => void;
  onSelect: () => void;
}

export function CodeSearchResultItem({ match, onHover, onSelect }: CodeSearchResultItemProps) {
  const fileName = match.file_path.split("/").pop() || match.file_path;
  const iconProps = getFileIconProps({ name: fileName, isDir: false });
  const value = `${match.file_path}:${match.line_number}`;

  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      onMouseEnter={() => onHover(value)}
      onMouseLeave={() => onHover(null)}
      className="group flex-col items-start gap-2.5 py-3"
    >
      <div className="flex w-full items-center gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground transition-colors group-data-[selected=true]:bg-background group-data-[selected=true]:text-primary">
          <img {...iconProps} alt="" className="size-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium">{match.file_path}</span>
        </div>
        <span className="shrink-0 font-mono text-[10px] font-bold uppercase tabular-nums text-muted-foreground/60 group-data-[selected=true]:text-muted-foreground">
          Line {match.line_number}
        </span>
      </div>
      <div className="w-full pl-10">
        <pre className="truncate rounded-sm border border-border/20 bg-muted/30 p-1.5 font-mono text-[11px] text-muted-foreground/90 group-data-[selected=true]:bg-muted/10">
          {match.line_content.trim()}
        </pre>
      </div>
    </CommandItem>
  );
}

interface CodePreviewTooltipProps {
  codeSearchResults: SearchMatch[];
  globalSearchTab: SearchTab;
  hoveredValue: string | null;
  selectedValue: string;
}

export function CodePreviewTooltip({
  codeSearchResults,
  globalSearchTab,
  hoveredValue,
  selectedValue,
}: CodePreviewTooltipProps) {
  const activeValue = hoveredValue || selectedValue;
  const match = codeSearchResults.find((item) => `${item.file_path}:${item.line_number}` === activeValue);

  if (globalSearchTab !== "code" || !match) return null;

  const fileName = match.file_path.split("/").pop() || match.file_path;
  const iconProps = getFileIconProps({ name: fileName, isDir: false });

  return (
    <div className="pointer-events-none absolute bottom-0 left-[calc(100%+8px)] z-50 w-[440px] origin-bottom-left animate-in rounded-xl border border-border bg-popover p-4 shadow-2xl duration-150 fade-in zoom-in-95">
      <div className="mb-3 flex items-center gap-2 border-b border-border/60 pb-2">
        <img {...iconProps} alt="" className="size-4" />
        <span className="flex-1 truncate text-xs font-bold text-foreground">{match.file_path}</span>
        <span className="rounded border border-border/20 bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          L{match.line_number}
        </span>
      </div>
      <div className="space-y-1 overflow-hidden font-mono text-[11px] leading-relaxed">
        {match.context_before.map((line, i) => (
          <div key={i} className="truncate overflow-hidden whitespace-pre text-muted-foreground/70">{line}</div>
        ))}
        <div className="-mx-2 break-all whitespace-pre-wrap rounded-md border-l-4 border-primary bg-primary/20 px-2 py-1.5 font-medium text-foreground shadow-sm">
          {match.line_content}
        </div>
        {match.context_after.map((line, i) => (
          <div key={i} className="truncate overflow-hidden whitespace-pre text-muted-foreground/70">{line}</div>
        ))}
      </div>
    </div>
  );
}

export const GLOBAL_SEARCH_FALLBACK_ICON = <Layers className="size-4 text-muted-foreground" />;
export const GLOBAL_SEARCH_AGENT_ICON = <Bot className="size-4 text-muted-foreground" />;
export const GLOBAL_SEARCH_LLM_ICON = <BrainCircuit className="size-4 text-muted-foreground" />;
export const GLOBAL_SEARCH_USAGE_ICON = <Gauge className="size-4 text-muted-foreground" />;
