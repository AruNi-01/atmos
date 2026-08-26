import type { CenterLayoutDocument as CenterLayoutWire } from "@atmos/api-types/ws/dto/center-layout";
import {
  normalizeCenterPaneLayout,
  type CenterPaneLayout,
} from "@/app-shell/center-pane/center-pane-layout";
import {
  MAX_SAVED_CENTER_LAYOUTS,
  normalizeSavedCenterLayouts,
  type SavedCenterLayout,
} from "@/app-shell/center-pane/center-pane-saved-layout";
import {
  MAX_CENTER_SPACES_PER_HOST,
  normalizeCenterSpacesByHost,
  omitCenterSpaceThumbnails,
  parseCenterSpaceKey,
  type HostCenterSpaces,
} from "@/app-shell/center-space/center-space";
import type { PersistedTerminalWorkspaceLayoutDocument } from "@/features/terminal/lib/terminal-layout-document";

export const CENTER_LAYOUT_VERSION = 1;

export type CenterLayoutDocument = {
  version: number;
  updatedAt: number;
  spaces: Record<string, HostCenterSpaces>;
  mosaics: Record<string, CenterPaneLayout>;
  savedLayouts: SavedCenterLayout[];
  overviewTabs: Record<string, boolean>;
  terminals: Record<string, PersistedTerminalWorkspaceLayoutDocument>;
};

export function emptyCenterLayoutDocument(): CenterLayoutDocument {
  return {
    version: CENTER_LAYOUT_VERSION,
    updatedAt: 0,
    spaces: {},
    mosaics: {},
    savedLayouts: [],
    overviewTabs: {},
    terminals: {},
  };
}

export function centerLayoutDocumentHasData(doc: CenterLayoutDocument): boolean {
  return (
    Object.keys(doc.spaces).length > 0 ||
    Object.keys(doc.mosaics).length > 0 ||
    doc.savedLayouts.length > 0 ||
    Object.keys(doc.overviewTabs).length > 0 ||
    Object.keys(doc.terminals).length > 0
  );
}

export function normalizeCenterLayoutDocument(
  raw: Partial<CenterLayoutDocument> | null | undefined,
): CenterLayoutDocument {
  const empty = emptyCenterLayoutDocument();
  if (!raw || typeof raw !== "object") return empty;
  return {
    version: CENTER_LAYOUT_VERSION,
    updatedAt: typeof raw.updatedAt === "number" && raw.updatedAt > 0 ? raw.updatedAt : 0,
    spaces: normalizeCenterSpacesByHost(raw.spaces ?? {}),
    mosaics: normalizeMosaics(raw.mosaics ?? {}),
    savedLayouts: normalizeSavedCenterLayouts(raw.savedLayouts ?? []).slice(
      0,
      MAX_SAVED_CENTER_LAYOUTS,
    ),
    overviewTabs: normalizeOverviewTabs(raw.overviewTabs ?? {}),
    terminals: normalizeSpaceTerminals(raw.terminals ?? {}),
  };
}

export function trimCenterLayoutForDisk(
  doc: CenterLayoutDocument,
): CenterLayoutDocument {
  return {
    ...doc,
    spaces: omitCenterSpaceThumbnails(doc.spaces),
  };
}

export function mergeCenterSpaceThumbnails(
  incoming: Record<string, HostCenterSpaces>,
  current: Record<string, HostCenterSpaces>,
): Record<string, HostCenterSpaces> {
  const next: Record<string, HostCenterSpaces> = {};
  for (const [hostId, host] of Object.entries(incoming)) {
    const prev = current[hostId];
    if (!prev) {
      next[hostId] = host;
      continue;
    }
    const thumbs = new Map(
      prev.spaces.map((space) => [space.id, space.thumbnailDataUrl]),
    );
    next[hostId] = {
      ...host,
      spaces: host.spaces.map((space) => {
        const keep = thumbs.get(space.id);
        if (space.thumbnailDataUrl || !keep) return space;
        return { ...space, thumbnailDataUrl: keep };
      }),
    };
  }
  return next;
}

export function toCenterLayoutWire(doc: CenterLayoutDocument): CenterLayoutWire {
  const disk = trimCenterLayoutForDisk(doc);
  return {
    version: disk.version,
    updated_at: disk.updatedAt,
    spaces: disk.spaces,
    mosaics: disk.mosaics,
    saved_layouts: disk.savedLayouts,
    overview_tabs: disk.overviewTabs,
    terminals: disk.terminals,
  };
}

export function fromCenterLayoutWire(
  raw: CenterLayoutWire | null | undefined,
): CenterLayoutDocument {
  if (!raw || typeof raw !== "object") return emptyCenterLayoutDocument();
  return normalizeCenterLayoutDocument({
    version: raw.version,
    updatedAt: raw.updated_at,
    spaces: (raw.spaces ?? {}) as Record<string, HostCenterSpaces>,
    mosaics: (raw.mosaics ?? {}) as Record<string, CenterPaneLayout>,
    savedLayouts: raw.saved_layouts as SavedCenterLayout[],
    overviewTabs: raw.overview_tabs,
    terminals: (raw.terminals ?? {}) as Record<
      string,
      PersistedTerminalWorkspaceLayoutDocument
    >,
  });
}

function normalizeMosaics(
  raw: Record<string, CenterPaneLayout>,
): Record<string, CenterPaneLayout> {
  const byHost = new Map<string, Array<[string, CenterPaneLayout]>>();
  for (const [contextId, layout] of Object.entries(raw)) {
    if (!contextId || !layout || typeof layout !== "object" || !Array.isArray(layout.panes)) {
      continue;
    }
    const hostId = parseCenterSpaceKey(contextId).hostId;
    const list = byHost.get(hostId) ?? [];
    list.push([contextId, layout]);
    byHost.set(hostId, list);
  }
  const next: Record<string, CenterPaneLayout> = {};
  for (const list of byHost.values()) {
    const kept =
      list.length <= MAX_CENTER_SPACES_PER_HOST
        ? list
        : list.slice(list.length - MAX_CENTER_SPACES_PER_HOST);
    for (const [contextId, layout] of kept) {
      next[contextId] = normalizeCenterPaneLayout(layout);
    }
  }
  return next;
}

function normalizeSpaceTerminals(
  raw: Record<string, PersistedTerminalWorkspaceLayoutDocument>,
): Record<string, PersistedTerminalWorkspaceLayoutDocument> {
  const next: Record<string, PersistedTerminalWorkspaceLayoutDocument> = {};
  for (const [contextId, layout] of Object.entries(raw)) {
    if (!contextId || !layout || typeof layout !== "object") continue;
    if (!Array.isArray(layout.tabs)) continue;
    next[contextId] = layout;
  }
  return next;
}

function normalizeOverviewTabs(raw: Record<string, boolean>): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const [contextId, open] of Object.entries(raw)) {
    if (open) next[contextId] = true;
  }
  return next;
}
