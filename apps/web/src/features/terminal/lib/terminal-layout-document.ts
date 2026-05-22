"use client";

import type { MosaicNode } from "react-mosaic-component";
import type { TerminalPaneProps } from "@/features/terminal/types/index";

export const TERMINAL_LAYOUT_SCHEMA = "terminal-layout.v1";
export const FIXED_TERMINAL_TAB_VALUE = "terminal";

export type PersistedTerminalPane = Omit<TerminalPaneProps, "sessionId" | "dynamicTitle">;

export interface PersistedTerminalTabDocument {
  id: string;
  title: string;
  closable: boolean;
  layout: MosaicNode<string> | null;
  maximizedTerminalId?: string | null;
  panes: Record<string, PersistedTerminalPane>;
}

export interface PersistedTerminalWorkspaceLayoutDocument {
  schema: typeof TERMINAL_LAYOUT_SCHEMA;
  activeTabId?: string | null;
  tabs: PersistedTerminalTabDocument[];
}

type LegacyTerminalTabLike = {
  id: string;
  title: string;
  closable: boolean;
};

type LegacyPersistedTerminalTabState = {
  panes: Record<string, PersistedTerminalPane>;
  layout: MosaicNode<string> | null;
  maximizedTerminalId?: string | null;
};

type LegacyPersistedTerminalWorkspaceLayout = {
  version: 2;
  tabs: LegacyTerminalTabLike[];
  activeTabId?: string | null;
  tabStates: Record<string, LegacyPersistedTerminalTabState>;
};

type NormalizableTerminalTab =
  & LegacyTerminalTabLike
  & Partial<Pick<PersistedTerminalTabDocument, "layout" | "maximizedTerminalId" | "panes">>;

function isPersistedTerminalWorkspaceLayout(
  value: unknown,
): value is PersistedTerminalWorkspaceLayoutDocument {
  return (
    !!value &&
    typeof value === "object" &&
    (value as PersistedTerminalWorkspaceLayoutDocument).schema === TERMINAL_LAYOUT_SCHEMA &&
    Array.isArray((value as PersistedTerminalWorkspaceLayoutDocument).tabs)
  );
}

function isLegacyPersistedTerminalWorkspaceLayout(
  value: unknown,
): value is LegacyPersistedTerminalWorkspaceLayout {
  return !!value && typeof value === "object" && (value as LegacyPersistedTerminalWorkspaceLayout).version === 2;
}

function normalizePersistedTerminalTabs(tabs: NormalizableTerminalTab[]): PersistedTerminalTabDocument[] {
  return tabs.map((tab) => ({
    ...tab,
    title: tab.id === FIXED_TERMINAL_TAB_VALUE ? "Term" : tab.title,
    closable: tab.id !== FIXED_TERMINAL_TAB_VALUE,
    panes: tab.panes ?? {},
    layout: tab.layout ?? null,
    maximizedTerminalId: tab.maximizedTerminalId ?? null,
  }));
}

export function migrateTerminalLayoutDocument(
  value: unknown,
): { layout: PersistedTerminalWorkspaceLayoutDocument; migrated: boolean } | null {
  if (isPersistedTerminalWorkspaceLayout(value)) {
    return {
      layout: {
        schema: TERMINAL_LAYOUT_SCHEMA,
        activeTabId: value.activeTabId ?? null,
        tabs: normalizePersistedTerminalTabs(value.tabs),
      },
      migrated: false,
    };
  }

  if (isLegacyPersistedTerminalWorkspaceLayout(value)) {
    const tabs = normalizePersistedTerminalTabs(value.tabs).map((tab) => {
      const tabState = value.tabStates[tab.id];
      return {
        ...tab,
        panes: tabState?.panes ?? {},
        layout: tabState?.layout ?? null,
        maximizedTerminalId: tabState?.maximizedTerminalId ?? null,
      };
    });

    return {
      layout: {
        schema: TERMINAL_LAYOUT_SCHEMA,
        activeTabId: value.activeTabId ?? null,
        tabs,
      },
      migrated: true,
    };
  }

  const legacyValue = value as {
    panes?: Record<string, PersistedTerminalPane>;
    layout?: MosaicNode<string> | null;
  } | null;

  if (legacyValue?.panes) {
    return {
      layout: {
        schema: TERMINAL_LAYOUT_SCHEMA,
        activeTabId: FIXED_TERMINAL_TAB_VALUE,
        tabs: [
          {
            id: FIXED_TERMINAL_TAB_VALUE,
            title: "Term",
            closable: false,
            panes: legacyValue.panes,
            layout: legacyValue.layout ?? null,
            maximizedTerminalId: null,
          },
        ],
      },
      migrated: true,
    };
  }

  return null;
}

export function parseTerminalLayoutDocument(
  value: string | null | undefined,
): { layout: PersistedTerminalWorkspaceLayoutDocument; migrated: boolean } | null {
  if (!value) {
    return null;
  }

  try {
    return migrateTerminalLayoutDocument(JSON.parse(value) as unknown);
  } catch {
    return null;
  }
}
