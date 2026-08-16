/**
 * Global, context-agnostic center layout snapshots.
 *
 * A snapshot stores functional surface kinds (files, terminal, …) plus grid
 * geometry (column/row fractions). Concrete tab ids and content are resolved
 * against the current project/workspace when the layout is applied.
 */

import {
  DEFAULT_PANE_ID,
  FALLBACK_SECONDARY_TAB_ID,
  OVERVIEW_TAB_ID,
  syncFractionsToPaneCount,
  type CenterPane,
  type CenterPaneLayout,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  isCenterToolTabValue,
  type CenterToolTabValue,
} from "@/app-shell/center-tool-tabs";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
} from "@/features/terminal/store/use-terminal-store";

const SIMULATOR_TAB_VALUE = "simulator";
const GIT_HISTORY_TAB_VALUE = "git-history";

function isTerminalSurfaceTabId(tabId: string): boolean {
  return (
    tabId === FIXED_TERMINAL_TAB_VALUE ||
    tabId.startsWith(TERMINAL_TAB_VALUE_PREFIX)
  );
}

function isBrowserSurfaceTabId(tabId: string): boolean {
  return tabId.startsWith("browser:") || tabId === "browser";
}

function isGithubSurfaceTabId(tabId: string): boolean {
  return tabId === "github" || tabId.startsWith("github:");
}

/** Functional center surfaces that can be saved in a layout (not path/context ids). */
export type CenterSurfaceKind =
  | "overview"
  | "terminal"
  | "wiki"
  | "simulator"
  | "git-history"
  | "changes"
  | "review"
  | "run"
  | "github"
  | "files"
  | "browser";

export type SavedCenterPaneSpec = {
  id: string;
  surfaces: CenterSurfaceKind[];
  activeSurface: CenterSurfaceKind;
};

export type SavedCenterLayout = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  columnCount: number;
  columnFractions: number[];
  rowFractions: number[];
  order: string[];
  panes: SavedCenterPaneSpec[];
};

export function createSavedLayoutId(): string {
  return `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Cap shared by localStorage cache and ~/.atmos function_settings disk store. */
export const MAX_SAVED_CENTER_LAYOUTS = 40;

/** Accept only well-shaped layout snapshots from cache or disk. */
export function normalizeSavedCenterLayouts(raw: unknown): SavedCenterLayout[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedCenterLayout[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<SavedCenterLayout>;
    if (typeof row.id !== "string" || !row.id) continue;
    if (typeof row.name !== "string") continue;
    if (!Array.isArray(row.panes)) continue;
    out.push({
      id: row.id,
      name: row.name,
      createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
      updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : Date.now(),
      columnCount:
        typeof row.columnCount === "number" && row.columnCount > 0
          ? row.columnCount
          : 1,
      columnFractions: Array.isArray(row.columnFractions)
        ? row.columnFractions.filter((n): n is number => typeof n === "number")
        : [1],
      rowFractions: Array.isArray(row.rowFractions)
        ? row.rowFractions.filter((n): n is number => typeof n === "number")
        : [1],
      order: Array.isArray(row.order)
        ? row.order.filter((id): id is string => typeof id === "string")
        : [],
      panes: row.panes as SavedCenterLayout["panes"],
    });
    if (out.length >= MAX_SAVED_CENTER_LAYOUTS) break;
  }
  return out;
}

/**
 * Map a live center tab id to a portable surface kind.
 * Returns null for context-bound content (open files, named terminals, …).
 */
export function tabIdToSurfaceKind(tabId: string): CenterSurfaceKind | null {
  if (!tabId) return null;
  if (tabId === OVERVIEW_TAB_ID) return "overview";
  if (tabId === "wiki") return "wiki";
  if (tabId === SIMULATOR_TAB_VALUE) return "simulator";
  if (tabId === GIT_HISTORY_TAB_VALUE) return "git-history";
  if (isCenterToolTabValue(tabId)) return tabId;
  if (isTerminalSurfaceTabId(tabId)) return "terminal";
  if (isBrowserSurfaceTabId(tabId)) return "browser";
  if (isGithubSurfaceTabId(tabId)) return "github";
  return null;
}

export function isToolSurfaceKind(
  kind: CenterSurfaceKind,
): kind is CenterToolTabValue {
  return isCenterToolTabValue(kind);
}

/** Build a portable snapshot from the live multi-pane layout. */
export function snapshotCenterLayout(
  layout: CenterPaneLayout,
  name: string,
  existingId?: string,
): SavedCenterLayout | null {
  const panes: SavedCenterPaneSpec[] = [];
  for (const pane of layout.panes) {
    const surfaces: CenterSurfaceKind[] = [];
    const seen = new Set<CenterSurfaceKind>();
    for (const tabId of pane.tabIds) {
      const kind = tabIdToSurfaceKind(tabId);
      if (!kind || seen.has(kind)) continue;
      seen.add(kind);
      surfaces.push(kind);
    }
    if (surfaces.length === 0) {
      // Primary pane with only context-bound tabs still needs a residual surface.
      if (pane.id === DEFAULT_PANE_ID || panes.length === 0) {
        surfaces.push(OVERVIEW_TAB_ID);
      } else {
        surfaces.push(FALLBACK_SECONDARY_TAB_ID as CenterSurfaceKind);
      }
    }
    const activeKind =
      tabIdToSurfaceKind(pane.activeTabId) ??
      surfaces[0] ??
      ("overview" as CenterSurfaceKind);
    panes.push({
      id: pane.id,
      surfaces,
      activeSurface: surfaces.includes(activeKind) ? activeKind : surfaces[0]!,
    });
  }

  if (panes.length === 0) return null;

  const order = layout.order.filter((id) => panes.some((p) => p.id === id));
  for (const pane of panes) {
    if (!order.includes(pane.id)) order.push(pane.id);
  }

  const now = Date.now();
  return {
    id: existingId ?? createSavedLayoutId(),
    name: name.trim() || "Layout",
    createdAt: now,
    updatedAt: now,
    columnCount: layout.columnCount,
    columnFractions: [...layout.columnFractions],
    rowFractions: [...layout.rowFractions],
    order,
    panes,
  };
}

/**
 * Resolve a surface kind to a concrete tab id for the current context.
 * Caller supplies browser tab factory when kind === "browser".
 */
export function resolveSurfaceTabId(
  kind: CenterSurfaceKind,
  opts: { browserTabId?: string | null },
): string {
  switch (kind) {
    case "terminal":
      return FIXED_TERMINAL_TAB_VALUE;
    case "browser":
      return opts.browserTabId || "browser";
    default:
      return kind;
  }
}

/** Convert a saved snapshot into a live CenterPaneLayout for the current context. */
export function materializeSavedLayout(
  saved: SavedCenterLayout,
  resolveTabId: (kind: CenterSurfaceKind) => string,
): CenterPaneLayout {
  const panes: CenterPane[] = saved.panes.map((pane) => {
    const tabIds: string[] = [];
    const seen = new Set<string>();
    for (const surface of pane.surfaces) {
      const tabId = resolveTabId(surface);
      if (!tabId || seen.has(tabId)) continue;
      // Overview only on primary.
      if (surface === "overview" && pane.id !== DEFAULT_PANE_ID && pane.id !== saved.order[0]) {
        continue;
      }
      seen.add(tabId);
      tabIds.push(tabId);
    }
    if (tabIds.length === 0) {
      tabIds.push(
        pane.id === DEFAULT_PANE_ID || pane.id === saved.order[0]
          ? OVERVIEW_TAB_ID
          : FIXED_TERMINAL_TAB_VALUE,
      );
    }
    const activeTabId = resolveTabId(pane.activeSurface);
    return {
      id: pane.id,
      tabIds,
      activeTabId: tabIds.includes(activeTabId) ? activeTabId : tabIds[0]!,
    };
  });

  const order = saved.order.filter((id) => panes.some((p) => p.id === id));
  for (const pane of panes) {
    if (!order.includes(pane.id)) order.push(pane.id);
  }

  const focusedPaneId = order[0] ?? DEFAULT_PANE_ID;

  return syncFractionsToPaneCount({
    panes,
    order,
    columnCount: saved.columnCount,
    columnFractions: [...saved.columnFractions],
    rowFractions: [...saved.rowFractions],
    focusedPaneId,
  });
}

/** All unique surface kinds referenced by a saved layout (for open-before-apply). */
export function collectSavedSurfaces(saved: SavedCenterLayout): CenterSurfaceKind[] {
  const out: CenterSurfaceKind[] = [];
  const seen = new Set<CenterSurfaceKind>();
  for (const pane of saved.panes) {
    for (const surface of pane.surfaces) {
      if (seen.has(surface)) continue;
      seen.add(surface);
      out.push(surface);
    }
    if (!seen.has(pane.activeSurface)) {
      seen.add(pane.activeSurface);
      out.push(pane.activeSurface);
    }
  }
  return out;
}
