/**
 * Global, context-agnostic center layout snapshots.
 *
 * A snapshot stores every center-tab kind (from `CENTER_TAB_KINDS`) plus grid
 * geometry. Document tabs opened by a second click (editor files, PR/issue/diff
 * pages, commits) are not saved — a layout is the set of surfaces, and those
 * ids are specific to one project. Concrete tab ids are resolved against the
 * current project/workspace when the layout is applied.
 */

import {
  createEmptyPane,
  DEFAULT_PANE_ID,
  OVERVIEW_TAB_ID,
  pinOverviewFront,
  normalizeCenterPaneLayout,
  type CenterPane,
  type CenterPaneLayout,
  type CenterPaneTree,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  CENTER_TAB_KINDS,
  type CenterTabKind,
} from "@/app-shell/center-stage-tab-model";
import {
  isCenterToolTabValue,
  type CenterToolTabValue,
} from "@/app-shell/center-tool-tabs";
import {
  FIXED_TERMINAL_TAB_VALUE,
  TERMINAL_TAB_VALUE_PREFIX,
} from "@/features/terminal/store/use-terminal-store";

/**
 * Document tabs. Their ids are paths or record keys, not a reusable surface.
 * Every other `CenterTabKind` is stored. A new center tab is saved automatically.
 */
const EPHEMERAL_LAYOUT_TAB_KINDS = [
  "file",
  "diff",
  "diff-group",
  "review-diff",
  "conflict",
  "github-pr",
  "github-issue",
  "github-action",
  "git-commit",
] as const satisfies readonly CenterTabKind[];

type EphemeralLayoutTabKind = (typeof EPHEMERAL_LAYOUT_TAB_KINDS)[number];

export type LayoutCenterSurfaceKind = Exclude<CenterTabKind, EphemeralLayoutTabKind>;

/**
 * Portable surfaces a snapshot may store.
 * `"wiki"` is the legacy name of `project-wiki` in older snapshots.
 */
export type CenterSurfaceKind = LayoutCenterSurfaceKind | "wiki";

const EPHEMERAL_LAYOUT_TAB_KIND_SET = new Set<string>(EPHEMERAL_LAYOUT_TAB_KINDS);

export const LAYOUT_CENTER_SURFACE_KINDS: readonly LayoutCenterSurfaceKind[] =
  CENTER_TAB_KINDS.filter(
    (kind): kind is LayoutCenterSurfaceKind => !EPHEMERAL_LAYOUT_TAB_KIND_SET.has(kind),
  );

const LAYOUT_SURFACE_KIND_SET = new Set<string>(LAYOUT_CENTER_SURFACE_KINDS);
const CENTER_TAB_KIND_SET = new Set<string>(CENTER_TAB_KINDS);

/** @deprecated Use {@link LAYOUT_CENTER_SURFACE_KINDS}. */
export const PLUS_MENU_CENTER_SURFACE_KINDS = LAYOUT_CENTER_SURFACE_KINDS;

export function isLayoutSurfaceKind(kind: string): kind is CenterSurfaceKind {
  return kind === "wiki" || LAYOUT_SURFACE_KIND_SET.has(kind);
}

/** @deprecated Use {@link isLayoutSurfaceKind}. */
export function isPlusMenuSurfaceKind(
  kind: string,
): kind is LayoutCenterSurfaceKind {
  return LAYOUT_SURFACE_KIND_SET.has(kind);
}

function prefixesForKind(kind: CenterTabKind): readonly string[] {
  if (kind === "terminal") return [TERMINAL_TAB_VALUE_PREFIX, `${kind}:`];
  return [`${kind}:`];
}

/** Map a live tab id onto a center-tab kind, including prefixed instances. */
export function centerTabKindFromTabId(tabId: string): CenterTabKind | null {
  if (CENTER_TAB_KIND_SET.has(tabId)) return tabId as CenterTabKind;
  let best: CenterTabKind | null = null;
  let bestLen = 0;
  for (const kind of CENTER_TAB_KINDS) {
    for (const prefix of prefixesForKind(kind)) {
      if (tabId.startsWith(prefix) && prefix.length > bestLen) {
        best = kind;
        bestLen = prefix.length;
      }
    }
  }
  return best;
}

function canonicalLayoutSurface(surface: string): LayoutCenterSurfaceKind | null {
  if (surface === "wiki") return "project-wiki";
  if (LAYOUT_SURFACE_KIND_SET.has(surface)) return surface as LayoutCenterSurfaceKind;
  return null;
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

/** Cap shared by localStorage cache and ~/.atmos/data/center-layout disk store. */
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
 * Map a live center tab id to a portable surface kind.
 * Returns null for document tabs (editor files, PR/issue/diff pages, commits).
 * Every other center-tab kind is recognized from its id or `${kind}:` prefix.
 */
export function tabIdToSurfaceKind(tabId: string): CenterSurfaceKind | null {
  if (!tabId) return null;
  const kind = centerTabKindFromTabId(tabId);
  if (!kind || EPHEMERAL_LAYOUT_TAB_KIND_SET.has(kind)) return null;
  return kind;
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
  opts: { browserTabId?: string | null; agentChatTabId?: string | null },
): string {
  switch (kind) {
    case "terminal":
      return FIXED_TERMINAL_TAB_VALUE;
    case "browser":
      return opts.browserTabId || "browser";
    case "agent-chat":
      return opts.agentChatTabId || "agent-chat";
    case "wiki":
      return "project-wiki";
    default:
      return kind;
  }
}

/** Convert a saved snapshot into a live CenterPaneLayout for the current context. */
export function materializeSavedLayout(
  saved: SavedCenterLayout,
  resolveTabId: (kind: CenterSurfaceKind, paneId: string) => string,
): CenterPaneLayout {
  const panes: CenterPane[] = saved.panes.map((pane) => {
    const isPrimary = pane.id === DEFAULT_PANE_ID || pane.id === saved.order[0];
    const tabIds: string[] = [];
    const seen = new Set<string>();
    for (const raw of pane.surfaces) {
      const surface = canonicalLayoutSurface(raw);
      if (!surface) continue;
      const tabId = resolveTabId(surface, pane.id);
      if (!tabId || seen.has(tabId)) continue;
      // Overview only on primary.
      if (surface === "overview" && !isPrimary) {
        continue;
      }
      seen.add(tabId);
      tabIds.push(tabId);
    }
    const pinnedTabIds = pinOverviewFront(tabIds);
    if (pinnedTabIds.length === 0) {
      return createEmptyPane(pane.id);
    }
    const activeSurface = canonicalLayoutSurface(pane.activeSurface) ?? pane.activeSurface;
    const activeTabId = resolveTabId(activeSurface, pane.id);
    return {
      id: pane.id,
      tabIds: pinnedTabIds,
      activeTabId: pinnedTabIds.includes(activeTabId) ? activeTabId : pinnedTabIds[0]!,
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
  const add = (surface: string) => {
    const kind = canonicalLayoutSurface(surface);
    if (!kind || seen.has(kind)) return;
    seen.add(kind);
    out.push(kind);
  };
  for (const pane of saved.panes) {
    for (const surface of pane.surfaces) add(surface);
    if (pane.surfaces.length > 0) add(pane.activeSurface);
  }
  return out;
}
