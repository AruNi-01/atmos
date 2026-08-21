"use client";

import { create } from "zustand";
import { globalKey, readJson, writeJson } from "@/shared/lib/browser-store";
import { functionSettingsApi } from "@/api/ws/settings-api";
import {
  createCenterSpaceId,
  DEFAULT_CENTER_SPACE_ID,
  defaultHostSpaces,
  MAX_CENTER_SPACES_PER_HOST,
  makeCenterSpaceKey,
  nextSpaceName,
  normalizeCenterSpacesByHost,
  normalizeHostCenterSpaces,
  type CenterSpaceRecord,
  type HostCenterSpaces,
} from "@/app-shell/center-space/center-space";

/**
 * Fast cache. Durable copy: function_settings.json → center_stage.spaces
 */
const STORAGE_KEY = globalKey("center-spaces");
const EMPTY_SPACES: CenterSpaceRecord[] = [];

type CenterSpaceStore = {
  byHost: Record<string, HostCenterSpaces>;
  hydrated: boolean;
  diskSynced: boolean;
  hydrate: () => void;
  syncFromDisk: () => Promise<void>;
  ensureHost: (hostId: string) => HostCenterSpaces;
  list: (hostId: string) => CenterSpaceRecord[];
  getActiveSpaceId: (hostId: string) => string;
  getPaintContextId: (hostId: string) => string;
  createSpace: (
    hostId: string,
    name?: string,
    spaceId?: string,
  ) => CenterSpaceRecord | null;
  setActiveSpace: (hostId: string, spaceId: string) => void;
  setThumbnail: (hostId: string, spaceId: string, thumbnailDataUrl: string | null) => void;
  renameSpace: (hostId: string, spaceId: string, name: string) => void;
  removeSpace: (hostId: string, spaceId: string) => string | null;
};

function persistLocal(byHost: Record<string, HostCenterSpaces>) {
  writeJson(STORAGE_KEY, byHost);
}

function readLocal(): Record<string, HostCenterSpaces> {
  return normalizeCenterSpacesByHost(
    readJson<Record<string, HostCenterSpaces> | null>(STORAGE_KEY, null),
  );
}

async function persistDisk(byHost: Record<string, HostCenterSpaces>): Promise<void> {
  await functionSettingsApi.update("center_stage", "spaces", byHost);
}

async function readDiskSpaces(): Promise<Record<string, HostCenterSpaces>> {
  const settings = await functionSettingsApi.get();
  const centerStage = settings.center_stage as { spaces?: unknown } | undefined;
  return normalizeCenterSpacesByHost(centerStage?.spaces);
}

function commit(
  set: (partial: Partial<CenterSpaceStore>) => void,
  byHost: Record<string, HostCenterSpaces>,
) {
  persistLocal(byHost);
  set({ byHost, hydrated: true });
  void persistDisk(byHost).catch(() => {
    // Offline / WS not ready: local cache still holds the latest edit.
  });
}

export const useCenterSpaceStore = create<CenterSpaceStore>((set, get) => ({
  byHost: {},
  hydrated: false,
  diskSynced: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ byHost: readLocal(), hydrated: true });
  },

  syncFromDisk: async () => {
    if (!get().hydrated) get().hydrate();
    try {
      const disk = await readDiskSpaces();
      const local = get().byHost;
      if (Object.keys(local).length === 0 && Object.keys(disk).length > 0) {
        persistLocal(disk);
        set({ byHost: disk, diskSynced: true });
        return;
      }
      if (Object.keys(local).length > 0 && Object.keys(disk).length === 0) {
        await persistDisk(local);
        set({ diskSynced: true });
        return;
      }
      set({ diskSynced: true });
    } catch {
      set({ diskSynced: true });
    }
  },

  ensureHost: (hostId) => {
    if (!hostId) return defaultHostSpaces();
    if (!get().hydrated) get().hydrate();
    const existing = get().byHost[hostId];
    if (existing) {
      const next = normalizeHostCenterSpaces(existing);
      if (next.spaces[0]?.name !== existing.spaces[0]?.name) {
        commit(set, { ...get().byHost, [hostId]: next });
        return next;
      }
      return existing;
    }
    const next = defaultHostSpaces();
    commit(set, { ...get().byHost, [hostId]: next });
    return next;
  },

  list: (hostId) => {
    if (!hostId) return EMPTY_SPACES;
    return get().byHost[hostId]?.spaces ?? EMPTY_SPACES;
  },

  getActiveSpaceId: (hostId) => {
    if (!hostId) return DEFAULT_CENTER_SPACE_ID;
    return get().byHost[hostId]?.activeSpaceId ?? DEFAULT_CENTER_SPACE_ID;
  },

  getPaintContextId: (hostId) => {
    if (!hostId) return "";
    return makeCenterSpaceKey(hostId, get().getActiveSpaceId(hostId));
  },

  createSpace: (hostId, name, spaceId) => {
    if (!hostId) return null;
    const current = get().ensureHost(hostId);
    if (current.spaces.length >= MAX_CENTER_SPACES_PER_HOST) return null;
    const id = spaceId?.trim() || createCenterSpaceId();
    if (current.spaces.some((space) => space.id === id)) return null;
    const now = Date.now();
    const space: CenterSpaceRecord = {
      id,
      name: (name?.trim() || nextSpaceName(current.spaces)),
      createdAt: now,
      updatedAt: now,
      thumbnailDataUrl: null,
    };
    const next: HostCenterSpaces = {
      spaces: [...current.spaces, space],
      activeSpaceId: space.id,
    };
    commit(set, { ...get().byHost, [hostId]: next });
    return space;
  },

  setActiveSpace: (hostId, spaceId) => {
    if (!hostId) return;
    const current = get().ensureHost(hostId);
    if (!current.spaces.some((space) => space.id === spaceId)) return;
    if (current.activeSpaceId === spaceId) return;
    commit(set, {
      ...get().byHost,
      [hostId]: { ...current, activeSpaceId: spaceId },
    });
  },

  setThumbnail: (hostId, spaceId, thumbnailDataUrl) => {
    if (!hostId) return;
    const current = get().ensureHost(hostId);
    const spaces = current.spaces.map((space) =>
      space.id === spaceId
        ? { ...space, thumbnailDataUrl, updatedAt: Date.now() }
        : space,
    );
    commit(set, { ...get().byHost, [hostId]: { ...current, spaces } });
  },

  renameSpace: (hostId, spaceId, name) => {
    const trimmed = name.trim();
    if (!hostId || !trimmed) return;
    const current = get().ensureHost(hostId);
    const spaces = current.spaces.map((space) =>
      space.id === spaceId ? { ...space, name: trimmed, updatedAt: Date.now() } : space,
    );
    commit(set, { ...get().byHost, [hostId]: { ...current, spaces } });
  },

  removeSpace: (hostId, spaceId) => {
    if (!hostId || spaceId === DEFAULT_CENTER_SPACE_ID) return null;
    const current = get().ensureHost(hostId);
    if (current.spaces.length <= 1) return null;
    if (!current.spaces.some((space) => space.id === spaceId)) return null;
    const spaces = current.spaces.filter((space) => space.id !== spaceId);
    const activeSpaceId =
      current.activeSpaceId === spaceId
        ? (spaces[0]?.id ?? DEFAULT_CENTER_SPACE_ID)
        : current.activeSpaceId;
    commit(set, { ...get().byHost, [hostId]: { spaces, activeSpaceId } });
    return makeCenterSpaceKey(hostId, spaceId);
  },
}));
