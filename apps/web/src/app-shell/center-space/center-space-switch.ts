import { PUSH_PAGE_DURATION_MS } from "@workspace/ui";
import { applyWorkspaceFrameVisualDom } from "@/app-shell/workspace-surface-switch";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import {
  createCenterSpaceId,
  makeCenterSpaceKey,
  MAX_CENTER_SPACES_PER_HOST,
  type CenterSpaceRecord,
} from "@/app-shell/center-space/center-space";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import { createEmptyCenterLayout } from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import { captureCenterSpaceThumbnail } from "@/app-shell/center-space/center-space-thumbnail";
import { cleanupCenterSpaceContext } from "@/app-shell/center-space/center-space-cleanup";
import { create } from "zustand";

type SpaceSlideState = {
  outgoingId: string | null;
  incomingId: string | null;
  nonce: number;
  play: (outgoingId: string, incomingId: string) => void;
  clear: () => void;
};

export const useCenterSpaceSlideStore = create<SpaceSlideState>((set) => ({
  outgoingId: null,
  incomingId: null,
  nonce: 0,
  play: (outgoingId, incomingId) => {
    set((state) => ({ outgoingId, incomingId, nonce: state.nonce + 1 }));
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      useCenterSpaceSlideStore.getState().clear();
    }, PUSH_PAGE_DURATION_MS);
  },
  clear: () => set({ outgoingId: null, incomingId: null }),
}));

export async function captureActiveCenterSpaceThumbnail(hostId: string): Promise<void> {
  if (!hostId) return;
  const store = useCenterSpaceStore.getState();
  const spaceId = store.getActiveSpaceId(hostId);
  const thumb = await captureCenterSpaceThumbnail();
  if (thumb) store.setThumbnail(hostId, spaceId, thumb);
}

function scheduleIncomingSpaceThumbnail(hostId: string): void {
  if (typeof window === "undefined" || !hostId) return;
  window.setTimeout(() => {
    void captureActiveCenterSpaceThumbnail(hostId);
  }, PUSH_PAGE_DURATION_MS);
}

export async function openNewCenterSpace(
  hostId: string,
  name?: string,
): Promise<CenterSpaceRecord | null> {
  if (!hostId) return null;
  await captureActiveCenterSpaceThumbnail(hostId);
  const store = useCenterSpaceStore.getState();
  const current = store.ensureHost(hostId);
  if (current.spaces.length >= MAX_CENTER_SPACES_PER_HOST) return null;
  const currentId = store.getActiveSpaceId(hostId);
  const spaceId = createCenterSpaceId();
  const outgoing = makeCenterSpaceKey(hostId, currentId);
  const incoming = makeCenterSpaceKey(hostId, spaceId);
  // Seed the empty mosaic before activating so the first extra-space render
  // cannot inherit the host's open tabs / URL tool tab.
  useCenterPaneLayoutStore.getState().setLayout(incoming, createEmptyCenterLayout());
  const space = store.createSpace(hostId, name, spaceId);
  if (!space) return null;
  useCenterSpaceSlideStore.getState().play(outgoing, incoming);
  applyWorkspaceFrameVisualDom(incoming);
  useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(incoming);
  scheduleIncomingSpaceThumbnail(hostId);
  return space;
}

export async function switchCenterSpace(hostId: string, spaceId: string): Promise<void> {
  if (!hostId) return;
  const store = useCenterSpaceStore.getState();
  const currentId = store.getActiveSpaceId(hostId);
  if (currentId === spaceId) return;
  await captureActiveCenterSpaceThumbnail(hostId);
  const outgoing = makeCenterSpaceKey(hostId, currentId);
  const incoming = makeCenterSpaceKey(hostId, spaceId);
  store.setActiveSpace(hostId, spaceId);
  useCenterSpaceSlideStore.getState().play(outgoing, incoming);
  applyWorkspaceFrameVisualDom(incoming);
  useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(incoming);
  scheduleIncomingSpaceThumbnail(hostId);
}

export async function deleteCenterSpace(hostId: string, spaceId: string): Promise<void> {
  if (!hostId) return;
  const paintId = useCenterSpaceStore.getState().removeSpace(hostId, spaceId);
  if (!paintId) return;
  cleanupCenterSpaceContext(paintId);
  const nextPaint = useCenterSpaceStore.getState().getPaintContextId(hostId);
  applyWorkspaceFrameVisualDom(nextPaint);
  useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(nextPaint);
}
