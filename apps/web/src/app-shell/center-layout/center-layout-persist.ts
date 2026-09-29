"use client";

import { centerLayoutApi } from "@/api/ws/center-layout-api";
import { globalKey, readJson, writeJson } from "@/shared/lib/browser-store";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { useCenterPaneSavedLayoutStore } from "@/app-shell/center-pane/center-pane-saved-layout-store";
import { useOverviewCenterTabStore } from "@/app-shell/center-overview-tab";
import { makeCenterSpaceKey } from "@/app-shell/center-space/center-space";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import {
  buildPersistedTerminalWorkspaceLayout,
  getTerminalWorkspaceScopeKey,
} from "@/features/terminal/store/terminal-store-helpers";
import { useTerminalStore } from "@/features/terminal/store/use-terminal-store";
import {
  centerLayoutDocumentHasData,
  fromCenterLayoutWire,
  mergeCenterSpaceThumbnails,
  normalizeCenterLayoutDocument,
  toCenterLayoutWire,
  type CenterLayoutDocument,
} from "@/app-shell/center-layout/center-layout-document";

const STORAGE_KEY = globalKey("center-layout");
const DISK_PUT_DEBOUNCE_MS = 400;

let hydrated = false;
let diskSynced = false;
let applying = false;
let putTimer: ReturnType<typeof setTimeout> | null = null;
let putChain: Promise<void> = Promise.resolve();
let pageHideBound = false;

function snapshotDocument(updatedAt?: number): CenterLayoutDocument {
  return normalizeCenterLayoutDocument({
    version: 1,
    updatedAt: updatedAt ?? Date.now(),
    spaces: useCenterSpaceStore.getState().byHost,
    mosaics: useCenterPaneLayoutStore.getState().byContext,
    savedLayouts: useCenterPaneSavedLayoutStore.getState().layouts,
    overviewTabs: useOverviewCenterTabStore.getState().visibleByContext,
    terminals: snapshotSpaceTerminals(),
  });
}

function persistLocal(doc: CenterLayoutDocument) {
  writeJson(STORAGE_KEY, doc);
}

function readLocal(): CenterLayoutDocument {
  return normalizeCenterLayoutDocument(
    readJson<CenterLayoutDocument | null>(STORAGE_KEY, null),
  );
}

function applyDocument(doc: CenterLayoutDocument, keepThumbs: boolean) {
  applying = true;
  try {
    const spaces = keepThumbs
      ? mergeCenterSpaceThumbnails(doc.spaces, useCenterSpaceStore.getState().byHost)
      : doc.spaces;
    useCenterPaneLayoutStore.setState({
      byContext: doc.mosaics,
      hydrated: true,
    });
    useCenterSpaceStore.setState({
      byHost: spaces,
      hydrated: true,
    });
    useCenterPaneSavedLayoutStore.setState({
      layouts: doc.savedLayouts,
      hydrated: true,
    });
    useOverviewCenterTabStore.setState({
      visibleByContext: doc.overviewTabs,
      hydrated: true,
    });
    applySpaceTerminals(doc.terminals);
  } finally {
    applying = false;
  }
}

function snapshotSpaceTerminals() {
  const terminalState = useTerminalStore.getState();
  const contextIds = new Set<string>(
    Object.keys(useCenterPaneLayoutStore.getState().byContext),
  );
  for (const [hostId, host] of Object.entries(useCenterSpaceStore.getState().byHost)) {
    contextIds.add(hostId);
    for (const space of host.spaces) {
      contextIds.add(makeCenterSpaceKey(hostId, space.id));
    }
  }
  const terminals: CenterLayoutDocument["terminals"] = {};
  for (const contextId of contextIds) {
    const payload = buildPersistedTerminalWorkspaceLayout(terminalState, contextId);
    if (payload) terminals[contextId] = payload;
  }
  return terminals;
}

function applySpaceTerminals(terminals: CenterLayoutDocument["terminals"]) {
  const nextPersisted = { ...useTerminalStore.getState().persistedTerminalLayouts };
  for (const [contextId, layout] of Object.entries(terminals)) {
    nextPersisted[getTerminalWorkspaceScopeKey(contextId, false)] = layout;
    nextPersisted[getTerminalWorkspaceScopeKey(contextId, true)] = layout;
  }
  useTerminalStore.setState({ persistedTerminalLayouts: nextPersisted });
}

function enqueuePut(task: () => Promise<void>): Promise<void> {
  const run = putChain.then(task, task);
  putChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function flushDiskPut() {
  if (putTimer) {
    clearTimeout(putTimer);
    putTimer = null;
  }
  const local = snapshotDocument();
  persistLocal(local);
  try {
    const result = await centerLayoutApi.put(toCenterLayoutWire(local));
    if (typeof result.updated_at === "number" && result.updated_at > 0) {
      persistLocal({ ...local, updatedAt: result.updated_at });
    }
  } catch {
    // Offline / WS not ready: local cache still holds the latest edit.
  }
}

function scheduleDiskPut() {
  if (!diskSynced) return;
  bindPageHide();
  if (putTimer) clearTimeout(putTimer);
  putTimer = setTimeout(() => {
    putTimer = null;
    void enqueuePut(flushDiskPut);
  }, DISK_PUT_DEBOUNCE_MS);
}

function bindPageHide() {
  if (pageHideBound || typeof window === "undefined") return;
  pageHideBound = true;
  window.addEventListener("pagehide", () => {
    void enqueuePut(flushDiskPut);
  });
}

export function hydrateCenterLayoutCache(): void {
  if (hydrated) return;
  hydrated = true;
  applyDocument(readLocal(), false);
}

export function markCenterLayoutDirty(opts?: { disk?: boolean }): void {
  if (applying) return;
  if (opts?.disk === false) {
    persistLocal(snapshotDocument(readLocal().updatedAt));
    return;
  }
  persistLocal(snapshotDocument());
  scheduleDiskPut();
}

export async function syncCenterLayoutFromDisk(): Promise<void> {
  if (!hydrated) hydrateCenterLayoutCache();
  const local = readLocal();
  try {
    const disk = fromCenterLayoutWire(await centerLayoutApi.get());
    if (centerLayoutDocumentHasData(disk)) {
      // First paint may have seeded an empty mosaic into the cache. Disk is
      // the machine-wide source of truth once the Server answers.
      applyDocument(disk, true);
      persistLocal({
        ...disk,
        spaces: mergeCenterSpaceThumbnails(disk.spaces, local.spaces),
      });
    } else {
      const latest = snapshotDocument(local.updatedAt || Date.now());
      if (centerLayoutDocumentHasData(latest)) {
        persistLocal(latest);
        const result = await centerLayoutApi.put(toCenterLayoutWire(latest));
        if (typeof result.updated_at === "number" && result.updated_at > 0) {
          persistLocal({ ...latest, updatedAt: result.updated_at });
        }
      }
    }
  } catch {
    // Server unavailable — keep the local cache.
  } finally {
    diskSynced = true;
    useCenterSpaceStore.setState({ diskSynced: true });
    useCenterPaneSavedLayoutStore.setState({ diskSynced: true });
  }
}

