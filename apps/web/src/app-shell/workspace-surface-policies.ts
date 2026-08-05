/**
 * APP-043 pure surface-cache policies (budget, protect, mount plan, frame tab).
 * Keep free of React so unit tests can drive shipped logic.
 */

export type MountKey = string;

export type EvictReason =
  | "lru_warm_cap"
  | "ttl"
  | "global_terminal_cap"
  | "global_editor_cap"
  | "global_browser_cap"
  | "hard_cap_protected"
  | "memory_pressure"
  | "computer_switch"
  | "manual";

export type BudgetRunReason =
  | "switch"
  | "surface_change"
  | "settings"
  | "ttl"
  | "memory_pressure"
  | "clear";

export interface SurfaceBudgets {
  maxWarmWorkspaces: number;
  maxGlobalTerminalPanes: number;
  maxGlobalMountedEditors: number;
  maxMountedEditorsPerWorkspace: number;
  maxGlobalBrowsers: number;
  warmTtlMs: number;
}

export const DEFAULT_SURFACE_BUDGETS: SurfaceBudgets = {
  maxWarmWorkspaces: 8,
  maxGlobalTerminalPanes: 16,
  maxGlobalMountedEditors: 10,
  maxMountedEditorsPerWorkspace: 5,
  maxGlobalBrowsers: 2,
  warmTtlMs: 60 * 60 * 1000,
};

export interface WarmEntry {
  contextId: string;
  lastAccessed: number;
  pinned?: boolean;
}

export interface MountPlan {
  /** Keys allowed to keep React heavy trees mounted. */
  mounted: string[];
}

export function terminalMountKey(contextId: string, tabId: string): MountKey {
  return `terminal:${contextId}:${tabId}`;
}

export function editorMountKey(contextId: string, filePath: string): MountKey {
  return `editor:${contextId}:${filePath}`;
}

export function browserMountKey(contextId: string, tabValue: string): MountKey {
  return `browser:${contextId}:${tabValue}`;
}

export function lightMountKey(contextId: string, lightId: string): MountKey {
  return `light:${contextId}:${lightId}`;
}

export function namedTerminalMountKey(
  contextId: string,
  kind: "project-wiki" | "code-review",
): MountKey {
  return `named-terminal:${contextId}:${kind}`;
}

export function parseMountKey(
  key: string,
): { kind: string; contextId: string; rest: string } | null {
  const first = key.indexOf(":");
  if (first < 0) return null;
  const kind = key.slice(0, first);
  const restAll = key.slice(first + 1);
  const second = restAll.indexOf(":");
  if (second < 0) return { kind, contextId: restAll, rest: "" };
  return {
    kind,
    contextId: restAll.slice(0, second),
    rest: restAll.slice(second + 1),
  };
}

/**
 * Active frame: URL/editor when it is a valid tab for this context; otherwise lastCenterTab
 * (avoids one-frame flash when URL still reflects the previous workspace).
 * Warm frame: lastCenterTab only — never global URL.
 */
export function resolveFrameActiveTab(input: {
  isActiveFrame: boolean;
  urlOrEditorTab: string | null | undefined;
  lastCenterTab: string | null | undefined;
  fallbackTab: string;
  /** Known tab ids for this context (terminals, files, github, browser, fixed). */
  validTabs?: Iterable<string>;
}): string {
  if (input.isActiveFrame) {
    const url = input.urlOrEditorTab;
    if (url) {
      if (!input.validTabs) {
        return url;
      }
      const valid = input.validTabs instanceof Set ? input.validTabs : new Set(input.validTabs);
      if (valid.has(url)) {
        return url;
      }
      // Stale URL from another context — prefer local last tab.
      return input.lastCenterTab || input.fallbackTab;
    }
    return input.lastCenterTab || input.fallbackTab;
  }
  return input.lastCenterTab || input.fallbackTab;
}

/**
 * Whether a panel for `panelTabId` should stay layout-ready inside its frame.
 *
 * Only the outer workspace frame is toggled for Active/Warm paint (`data-tier`
 * visibility / DOM flip). Last-tab panels inside Warm frames stay layout-ready
 * so a hop only needs to flip the frame shell — no React rebuild of panel trees
 * to reveal the retained surface (IMP-010).
 *
 * Focus / polling / “surface active” still gate on `isActiveFrame` at call sites.
 */
export function isFramePanelVisible(input: {
  isActiveFrame: boolean;
  frameActiveTab: string;
  panelTabId: string;
}): boolean {
  void input.isActiveFrame;
  return input.frameActiveTab === input.panelTabId;
}

/**
 * Class list for terminal-like keep-alive panels (xterm WebGL).
 *
 * Prefer visibility stacking over Tailwind `hidden` (`display:none`), which
 * blanks the terminal canvas on every tab hop.
 */
export function terminalKeepAlivePanelClass(visible: boolean): string {
  return visible ? "atmos-terminal-panel-active" : "atmos-terminal-panel-keepalive";
}

/**
 * Context ids that must keep their center-stage frames mounted.
 *
 * `warm` is updated in an effect after `effectiveContextId` changes. Without a
 * one-frame sticky leave id, the previous workspace unmounts immediately (WS
 * disconnect) and remounts as warm → full "Connecting to terminal..." flash.
 */
export function resolveContextIdsToRender(input: {
  effectiveContextId: string | null | undefined;
  warmIds: string[];
  /** Contexts that just left Active and are not yet in `warmIds`. */
  stickyLeavingIds?: string[];
}): string[] {
  const ids = new Set<string>();
  if (input.effectiveContextId) ids.add(input.effectiveContextId);
  for (const id of input.warmIds) {
    if (id) ids.add(id);
  }
  for (const id of input.stickyLeavingIds ?? []) {
    if (id && id !== input.effectiveContextId) ids.add(id);
  }
  return Array.from(ids);
}

/** Merge a leaving context into the sticky list (newest last, de-duped). */
export function pushStickyLeavingContext(
  stickyLeavingIds: string[],
  leavingContextId: string | null | undefined,
  nextActiveContextId: string | null | undefined,
): string[] {
  if (!leavingContextId || leavingContextId === nextActiveContextId) {
    return stickyLeavingIds;
  }
  return [
    ...stickyLeavingIds.filter((id) => id !== leavingContextId),
    leavingContextId,
  ];
}

/** Drop sticky ids once the warm store (or active) owns them. */
export function pruneStickyLeavingContexts(
  stickyLeavingIds: string[],
  input: {
    effectiveContextId: string | null | undefined;
    warmIds: string[];
  },
): string[] {
  const warm = new Set(input.warmIds);
  return stickyLeavingIds.filter(
    (id) => id && id !== input.effectiveContextId && !warm.has(id),
  );
}

export interface ProtectSignals {
  activeContextId: string | null;
  dirtyContextIds: Set<string> | string[];
  liveAgentContextIds: Set<string> | string[];
  pinnedContextIds?: Set<string> | string[];
}

function asSet(ids: Set<string> | string[] | undefined): Set<string> {
  if (!ids) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

export function isProtected(contextId: string, signals: ProtectSignals): boolean {
  if (signals.activeContextId && contextId === signals.activeContextId) return true;
  if (asSet(signals.dirtyContextIds).has(contextId)) return true;
  if (asSet(signals.liveAgentContextIds).has(contextId)) return true;
  if (asSet(signals.pinnedContextIds).has(contextId)) return true;
  return false;
}

/** Snapshot shape for building protect signals without React. */
export interface ProtectInputSnapshot {
  activeContextId: string | null;
  /** editor workspaceStates-like map: contextId → { openFiles } */
  editorWorkspaceStates: Record<
    string,
    { openFiles?: Array<{ isDirty?: boolean }> | null } | null | undefined
  >;
  /**
   * terminal workspacePanes keys are `workspaceId` or `workspaceId::tabId`.
   * Any pane with `agent` marks that workspace as live-agent protected.
   */
  terminalPanesByScope: Record<
    string,
    Record<string, { agent?: unknown } | null | undefined> | null | undefined
  >;
  pinnedContextIds?: string[];
}

/**
 * Build protect signals from editor dirty flags + terminal pane agent indicators.
 * Pure: tests can drive with plain objects; runtime passes live store snapshots.
 */
export function buildProtectSignals(input: ProtectInputSnapshot): ProtectSignals {
  const dirtyContextIds: string[] = [];
  for (const [contextId, ws] of Object.entries(input.editorWorkspaceStates ?? {})) {
    const files = ws?.openFiles ?? [];
    if (files.some((f) => f?.isDirty)) {
      dirtyContextIds.push(contextId);
    }
  }

  const liveAgentContextIds = new Set<string>();
  for (const [scopeKey, panes] of Object.entries(input.terminalPanesByScope ?? {})) {
    if (!panes) continue;
    const contextId = scopeKey.includes("::") ? scopeKey.split("::")[0]! : scopeKey;
    for (const pane of Object.values(panes)) {
      if (pane?.agent) {
        liveAgentContextIds.add(contextId);
        break;
      }
    }
  }

  return {
    activeContextId: input.activeContextId,
    dirtyContextIds,
    liveAgentContextIds: [...liveAgentContextIds],
    pinnedContextIds: input.pinnedContextIds,
  };
}

/** Sweep warm entries older than ttl (unprotected only). Pure helper for tests + store. */
export function sweepWarmByTtl(input: {
  warm: WarmEntry[];
  now: number;
  warmTtlMs: number;
  protect: ProtectSignals;
}): { kept: WarmEntry[]; expired: string[] } {
  const kept: WarmEntry[] = [];
  const expired: string[] = [];
  for (const w of input.warm) {
    if (
      input.now - w.lastAccessed > input.warmTtlMs &&
      !isProtected(w.contextId, input.protect)
    ) {
      expired.push(w.contextId);
    } else {
      kept.push(w);
    }
  }
  return { kept, expired };
}

export interface ContextSurfaceSnapshot {
  contextId: string;
  /** Terminal tab ids currently candidates for mount (usually active + previously open). */
  terminalTabIds: string[];
  /**
   * Mosaic pane counts per terminal tab id. Defaults to 1 when omitted.
   * Used so `max_global_terminal_panes` tracks real xterm instances, not only tabs.
   */
  terminalPaneCountByTabId?: Record<string, number>;
  /** Open file paths ordered most-recent-first after active. */
  editorPathsRecent: string[];
  browserTabValues: string[];
  /** Light surfaces to consider (last tab / session-opened). */
  lightIds: string[];
  namedTerminals?: Array<"project-wiki" | "code-review">;
  /** Which surface is the frame's active tab (for prefer-keep). */
  frameActiveTab?: string | null;
}

export interface ComputeMountPlanInput {
  activeContextId: string | null;
  warm: WarmEntry[];
  contexts: ContextSurfaceSnapshot[];
  budgets: SurfaceBudgets;
}

function terminalPaneUnits(snap: ContextSurfaceSnapshot, tabId: string): number {
  const raw = snap.terminalPaneCountByTabId?.[tabId];
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return 1;
}

/**
 * Build a mount plan for Active ∪ Warm frames under global/per-ws budgets.
 *
 * Terminal allocation (TECH §4.3):
 * 1. Active frameActiveTab terminal (always, even if it alone exceeds the pane cap)
 * 2. Warm frameActiveTab terminals (newest → oldest) — prefer-keep for M6 continuity
 * 3. Remaining secondary terminal tabs (active first, then warm)
 *
 * Editors/browsers/lights follow context order: active first, then warm newest → oldest.
 */
export function computeMountPlan(input: ComputeMountPlanInput): MountPlan {
  const liveIds = new Set<string>();
  if (input.activeContextId) liveIds.add(input.activeContextId);
  for (const w of input.warm) liveIds.add(w.contextId);

  const contexts = input.contexts.filter((c) => liveIds.has(c.contextId));
  const byId = new Map(contexts.map((c) => [c.contextId, c]));

  // Order: active first, then warm newest → oldest
  const order: string[] = [];
  if (input.activeContextId && byId.has(input.activeContextId)) {
    order.push(input.activeContextId);
  }
  for (let i = input.warm.length - 1; i >= 0; i--) {
    const id = input.warm[i].contextId;
    if (id !== input.activeContextId && byId.has(id)) order.push(id);
  }

  const mounted: string[] = [];
  let terminalCount = 0;
  let editorCount = 0;
  let browserCount = 0;

  const tryAdd = (
    key: string,
    kind: "terminal" | "editor" | "browser" | "light" | "named",
    opts?: { units?: number; force?: boolean },
  ) => {
    if (mounted.includes(key)) return;
    const units = opts?.units ?? 1;
    // Named terminals (project-wiki / code-review) are real TerminalGrids and
    // must consume the same global pane budget as regular terminal tabs.
    if (kind === "terminal" || kind === "named") {
      if (!opts?.force && terminalCount + units > input.budgets.maxGlobalTerminalPanes) return;
      terminalCount += units;
    } else if (kind === "editor") {
      if (editorCount >= input.budgets.maxGlobalMountedEditors) return;
      editorCount += 1;
    } else if (kind === "browser") {
      if (browserCount >= input.budgets.maxGlobalBrowsers) return;
      browserCount += 1;
    }
    mounted.push(key);
  };

  // --- Terminals: two-pass so warm frameActiveTabs beat active secondaries ---
  const isTerminalTab = (snap: ContextSurfaceSnapshot, tabId: string | null | undefined) =>
    Boolean(tabId && snap.terminalTabIds.includes(tabId));

  // Pass 1a: Active frameActiveTab (never demount — TECH hard rule)
  if (input.activeContextId) {
    const snap = byId.get(input.activeContextId);
    const activeTab = snap?.frameActiveTab ?? null;
    if (snap && isTerminalTab(snap, activeTab)) {
      tryAdd(terminalMountKey(input.activeContextId, activeTab!), "terminal", {
        units: terminalPaneUnits(snap, activeTab!),
        force: true,
      });
    }
  }

  // Pass 1b: Warm frameActiveTabs (newest → oldest already in `order` after active)
  for (const contextId of order) {
    if (contextId === input.activeContextId) continue;
    const snap = byId.get(contextId)!;
    const activeTab = snap.frameActiveTab ?? null;
    if (isTerminalTab(snap, activeTab)) {
      tryAdd(terminalMountKey(contextId, activeTab!), "terminal", {
        units: terminalPaneUnits(snap, activeTab!),
      });
    }
  }

  // Pass 2: secondary terminal tabs (active first, then warm)
  for (const contextId of order) {
    const snap = byId.get(contextId)!;
    const activeTab = snap.frameActiveTab ?? null;
    for (const tabId of snap.terminalTabIds) {
      if (tabId === activeTab) continue;
      tryAdd(terminalMountKey(contextId, tabId), "terminal", {
        units: terminalPaneUnits(snap, tabId),
      });
    }
  }

  // --- Non-terminal surfaces: context order ---
  for (const contextId of order) {
    const snap = byId.get(contextId)!;
    const isActive = contextId === input.activeContextId;
    const activeTab = snap.frameActiveTab ?? null;

    // Editors: per-workspace cap then global
    let perWsEditors = 0;
    for (const path of snap.editorPathsRecent) {
      if (perWsEditors >= input.budgets.maxMountedEditorsPerWorkspace) break;
      const before = mounted.length;
      tryAdd(editorMountKey(contextId, path), "editor");
      if (mounted.length > before) perWsEditors += 1;
    }

    for (const tabValue of snap.browserTabValues) {
      // Prefer active browser tab
      if (activeTab === tabValue || isActive || snap.browserTabValues.length === 1) {
        tryAdd(browserMountKey(contextId, tabValue), "browser");
      }
    }
    // Fill remaining browsers oldest contexts already ordered
    for (const tabValue of snap.browserTabValues) {
      tryAdd(browserMountKey(contextId, tabValue), "browser");
    }

    // Light: only last tab / listed light ids (narrow default)
    for (const lightId of snap.lightIds) {
      if (activeTab === lightId || snap.lightIds.includes(lightId)) {
        tryAdd(lightMountKey(contextId, lightId), "light");
      }
    }

    for (const kind of snap.namedTerminals ?? []) {
      if (activeTab === kind || isActive) {
        tryAdd(namedTerminalMountKey(contextId, kind), "named", {
          // Force only when this named surface is the active frame's last tab.
          force: isActive && activeTab === kind,
        });
      }
    }
  }

  return { mounted };
}

export interface ApplyWarmTouchInput {
  activeContextId: string | null;
  warm: WarmEntry[];
  touchContextId: string;
  now: number;
  maxWarmWorkspaces: number;
  protect: ProtectSignals;
  warmTtlMs?: number;
}

export interface ApplyWarmTouchResult {
  warm: WarmEntry[];
  frozen: Array<{ contextId: string; reason: EvictReason }>;
}

/**
 * Move leaving context into warm LRU; freeze oldest unprotected over cap.
 */
export function applyWarmTouch(input: ApplyWarmTouchInput): ApplyWarmTouchResult {
  const { touchContextId, activeContextId, now, maxWarmWorkspaces } = input;
  if (!touchContextId || touchContextId === activeContextId) {
    return { warm: input.warm, frozen: [] };
  }

  let warm = input.warm.filter((w) => w.contextId !== touchContextId);
  warm.push({ contextId: touchContextId, lastAccessed: now });

  // Drop expired
  const frozen: Array<{ contextId: string; reason: EvictReason }> = [];
  if (input.warmTtlMs != null) {
    const kept: WarmEntry[] = [];
    for (const w of warm) {
      if (now - w.lastAccessed > input.warmTtlMs && !isProtected(w.contextId, input.protect)) {
        frozen.push({ contextId: w.contextId, reason: "ttl" });
      } else {
        kept.push(w);
      }
    }
    warm = kept;
  }

  while (warm.length > maxWarmWorkspaces) {
    // Oldest at front
    let victimIndex = -1;
    for (let i = 0; i < warm.length; i++) {
      if (!isProtected(warm[i].contextId, input.protect)) {
        victimIndex = i;
        break;
      }
    }
    if (victimIndex === -1) {
      // hard cap: freeze oldest protected
      victimIndex = 0;
      frozen.push({ contextId: warm[0].contextId, reason: "hard_cap_protected" });
    } else {
      frozen.push({ contextId: warm[victimIndex].contextId, reason: "lru_warm_cap" });
    }
    warm = warm.filter((_, i) => i !== victimIndex);
  }

  return { warm, frozen };
}

export function selectEditorMountSet(input: {
  openPathsRecent: string[];
  activePath: string | null | undefined;
  maxMounted: number;
}): string[] {
  const result: string[] = [];
  if (input.activePath) result.push(input.activePath);
  for (const p of input.openPathsRecent) {
    if (result.length >= input.maxMounted) break;
    if (!result.includes(p)) result.push(p);
  }
  return result.slice(0, input.maxMounted);
}

export function mountedKeysForContext(plan: MountPlan, contextId: string): string[] {
  return plan.mounted.filter((k) => {
    const parsed = parseMountKey(k);
    return parsed?.contextId === contextId;
  });
}

export function isKeyMounted(plan: MountPlan, key: string): boolean {
  return plan.mounted.includes(key);
}
