/**
 * Global, context-agnostic center layout snapshots.
 *
 * A snapshot stores plus-menu surfaces (files, terminal, GitHub hub, …) plus
 * grid geometry. Ephemeral tabs opened by a second click (files in the editor,
 * PR/issue/diff pages, previews) are not saved. Concrete tab ids are resolved
 * against the current project/workspace when the layout is applied.
 */

import {
  createEmptyPane,
  DEFAULT_PANE_ID,
  OVERVIEW_TAB_ID,
  normalizeCenterPaneLayout,
  type CenterPane,
  type CenterPaneLayout,
  type CenterPaneTree,
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

function isTerminalSurfaceTabId(tabId: string): boolean {
  return (
    tabId === FIXED_TERMINAL_TAB_VALUE ||
    tabId.startsWith(TERMINAL_TAB_VALUE_PREFIX)
  );
}

function isBrowserSurfaceTabId(tabId: string): boolean {
  return tabId.startsWith("browser:") || tabId === "browser";
}

/**
 * Plus-menu surfaces that may be stored in a layout. Kept as a union so older
 * snapshots that still mention overview/wiki/git-history can materialize.
 */
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
  | "pt-design"
  | "browser";

/** Surfaces created from the center + menu — the only kinds new snapshots store. */
export const PLUS_MENU_CENTER_SURFACE_KINDS = [
  "terminal",
  "browser",
  "files",
  "changes",
  "review",
  "run",
  "github",
  "pt-design",
  "simulator",
] as const satisfies readonly CenterSurfaceKind[];

const PLUS_MENU_SURFACE_KIND_SET = new Set<string>(PLUS_MENU_CENTER_SURFACE_KINDS);

export function isPlusMenuSurfaceKind(
  kind: string,
): kind is (typeof PLUS_MENU_CENTER_SURFACE_KINDS)[number] {
  return PLUS_MENU_SURFACE_KIND_SET.has(kind);
}

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
  tree?: CenterPaneTree;
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
      tree: row.tree,
      panes: row.panes as SavedCenterLayout["panes"],
    });
    if (out.length >= MAX_SAVED_CENTER_LAYOUTS) break;
  }
  return out;
}

/**
 * Map a live center tab id to a portable plus-menu surface kind.
 * Returns null for Overview, wiki, git-history, and second-click content
 * (editor files, PR/issue/diff pages, previews).
 */
export function tabIdToSurfaceKind(tabId: string): CenterSurfaceKind | null {
  if (!tabId) return null;
  if (tabId === SIMULATOR_TAB_VALUE) return "simulator";
  if (isCenterToolTabValue(tabId)) return tabId;
  if (isTerminalSurfaceTabId(tabId)) return "terminal";
  if (isBrowserSurfaceTabId(tabId)) return "browser";
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
    const activeKind =
      tabIdToSurfaceKind(pane.activeTabId) ??
      surfaces[0] ??
      ("overview" as CenterSurfaceKind);
    panes.push({
      id: pane.id,
      surfaces,
      activeSurface: surfaces.includes(activeKind)
        ? activeKind
        : (surfaces[0] ?? "overview"),
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
    tree: layout.tree,
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
    const isPrimary = pane.id === DEFAULT_PANE_ID || pane.id === saved.order[0];
    const tabIds: string[] = [];
    const seen = new Set<string>();
    for (const surface of pane.surfaces) {
      if (!isPlusMenuSurfaceKind(surface) && surface !== "overview") continue;
      const tabId = resolveTabId(surface);
      if (!tabId || seen.has(tabId)) continue;
      // Overview only on primary.
      if (surface === "overview" && !isPrimary) {
        continue;
      }
      seen.add(tabId);
      tabIds.push(tabId);
    }
    if (tabIds.length === 0) {
      return isPrimary
        ? {
            id: pane.id,
            tabIds: [OVERVIEW_TAB_ID],
            activeTabId: OVERVIEW_TAB_ID,
          }
        : createEmptyPane(pane.id);
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

  return normalizeCenterPaneLayout({
    panes,
    order,
    tree: saved.tree,
    columnCount: saved.columnCount,
    columnFractions: [...saved.columnFractions],
    rowFractions: [...saved.rowFractions],
    focusedPaneId,
  });
}

/**
 * Applying a named layout wipes the current mosaic and non-Overview tabs.
 * Prompt when the workspace already has a split or any extra tab.
 */
export function shouldConfirmReplaceCenterLayout(input: {
  paneCount: number;
  openTabIds: readonly string[];
}): boolean {
  if (input.paneCount > 1) return true;
  return input.openTabIds.some((id) => id !== OVERVIEW_TAB_ID);
}

/** Plus-menu surfaces referenced by a saved layout (for open-before-apply). */
export function collectSavedSurfaces(saved: SavedCenterLayout): CenterSurfaceKind[] {
  const out: CenterSurfaceKind[] = [];
  const seen = new Set<CenterSurfaceKind>();
  const add = (surface: CenterSurfaceKind) => {
    if (!isPlusMenuSurfaceKind(surface) || seen.has(surface)) return;
    seen.add(surface);
    out.push(surface);
  };
  for (const pane of saved.panes) {
    for (const surface of pane.surfaces) add(surface);
    if (pane.surfaces.length > 0) add(pane.activeSurface);
  }
  return out;
}
