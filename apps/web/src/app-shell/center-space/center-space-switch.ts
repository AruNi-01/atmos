import { applyWorkspaceFrameVisualDom } from "@/app-shell/workspace-surface-switch";
import { useWorkspaceSurfaceCacheStore } from "@/features/workspace/store/use-workspace-surface-cache-store";
import {
  centerSpaceSlideDirection,
  createCenterSpaceId,
  makeCenterSpaceKey,
  MAX_CENTER_SPACES_PER_HOST,
  neighborSpaceIdAfterDelete,
  type CenterSpaceRecord,
} from "@/app-shell/center-space/center-space";
import { useCenterSpaceStore } from "@/app-shell/center-space/center-space-store";
import { createEmptyCenterLayout } from "@/app-shell/center-pane/center-pane-layout";
import { useCenterPaneLayoutStore } from "@/app-shell/center-pane/center-pane-layout-store";
import {
  captureCenterSpaceThumbnail,
  decodeCenterSpaceThumbnail,
  invalidateCenterSpaceThumbnailCapture,
  snapshotMountedCenterSpaceThumbnails,
} from "@/app-shell/center-space/center-space-thumbnail";
import { cleanupCenterSpaceContext } from "@/app-shell/center-space/center-space-cleanup";
import {
  CENTER_SPACE_SLIDE_MS,
  runCenterSpaceSlide,
} from "@/app-shell/center-space/center-space-slide";
import { clearCenterDeepLinkUrl } from "@/app-shell/center-space/center-space-url";

function applyThumbnails(
  hostId: string,
  thumbs: ReadonlyArray<{ spaceId: string; dataUrl: string }>,
): void {
  if (!hostId || thumbs.length === 0) return;
  useCenterSpaceStore.getState().setThumbnails(
    hostId,
    thumbs.map((thumb) => ({
      spaceId: thumb.spaceId,
      thumbnailDataUrl: thumb.dataUrl,
    })),
  );
}

async function rememberMountedThumbnails(hostId: string): Promise<void> {
  if (!hostId) return;
  const thumbs = await snapshotMountedCenterSpaceThumbnails(hostId);
  applyThumbnails(hostId, thumbs);
}

export async function captureActiveCenterSpaceThumbnail(hostId: string): Promise<void> {
  if (!hostId) return;
  const thumbs = await snapshotMountedCenterSpaceThumbnails(hostId);
  applyThumbnails(hostId, thumbs);
  const store = useCenterSpaceStore.getState();
  const spaceId = store.getActiveSpaceId(hostId);
  if (store.list(hostId).some((space) => space.id === spaceId && space.thumbnailDataUrl)) {
    return;
  }
  const thumb = await captureCenterSpaceThumbnail();
  if (thumb) store.setThumbnail(hostId, spaceId, thumb);
}

/** Screenshot the live frame and decode stored JPEGs so the fan has pixels ready. */
export async function refreshActiveCenterSpacePreview(hostId: string): Promise<void> {
  if (!hostId) return;
  await captureActiveCenterSpaceThumbnail(hostId);
  const spaces = useCenterSpaceStore.getState().list(hostId);
  await Promise.all(
    spaces.map((space) => decodeCenterSpaceThumbnail(space.thumbnailDataUrl)),
  );
}

function scheduleIncomingSpaceThumbnail(hostId: string): void {
  if (typeof window === "undefined" || !hostId) return;
  window.setTimeout(() => {
    void captureActiveCenterSpaceThumbnail(hostId);
  }, CENTER_SPACE_SLIDE_MS);
}

function paintIncomingSpace(incoming: string): void {
  applyWorkspaceFrameVisualDom(incoming);
  useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(incoming);
}

export async function openNewCenterSpace(
  hostId: string,
  name?: string,
): Promise<CenterSpaceRecord | null> {
  if (!hostId) return null;
  const store = useCenterSpaceStore.getState();
  const current = store.ensureHost(hostId);
  if (current.spaces.length >= MAX_CENTER_SPACES_PER_HOST) return null;
  const spaceId = createCenterSpaceId();
  const incoming = makeCenterSpaceKey(hostId, spaceId);
  // Seed the empty mosaic before activating so the first extra-space render
  // cannot inherit the host's open tabs / URL tool tab.
  useCenterPaneLayoutStore.getState().setLayout(incoming, createEmptyCenterLayout());
  let space: CenterSpaceRecord | null = null;
  await rememberMountedThumbnails(hostId);
  invalidateCenterSpaceThumbnailCapture();
  await runCenterSpaceSlide("forward", () => {
    clearCenterDeepLinkUrl();
    space = store.createSpace(hostId, name, spaceId);
    if (space) paintIncomingSpace(incoming);
  });
  if (!space) return null;
  scheduleIncomingSpaceThumbnail(hostId);
  return space;
}

export type SwitchCenterSpaceOptions = {
  fromCard?: HTMLElement | null;
  onPaint?: () => void;
};

export async function switchCenterSpace(
  hostId: string,
  spaceId: string,
  options?: SwitchCenterSpaceOptions,
): Promise<void> {
  if (!hostId) return;
  const store = useCenterSpaceStore.getState();
  const current = store.ensureHost(hostId);
  if (!current.spaces.some((space) => space.id === spaceId)) return;
  const currentId = store.getActiveSpaceId(hostId);
  if (currentId === spaceId) return;
  const incoming = makeCenterSpaceKey(hostId, spaceId);
  const direction = centerSpaceSlideDirection(current.spaces, currentId, spaceId);
  await rememberMountedThumbnails(hostId);
  invalidateCenterSpaceThumbnailCapture();
  await runCenterSpaceSlide(
    direction,
    () => {
      options?.onPaint?.();
      clearCenterDeepLinkUrl();
      store.setActiveSpace(hostId, spaceId);
      paintIncomingSpace(incoming);
    },
    { fromCard: options?.fromCard ?? null },
  );
  scheduleIncomingSpaceThumbnail(hostId);
}

export async function deleteCenterSpace(hostId: string, spaceId: string): Promise<void> {
  if (!hostId) return;
  const store = useCenterSpaceStore.getState();
  const current = store.ensureHost(hostId);
  const wasActive = current.activeSpaceId === spaceId;
  if (!wasActive) {
    const paintId = store.removeSpace(hostId, spaceId);
    if (paintId) cleanupCenterSpaceContext(paintId);
    return;
  }
  const nextId = neighborSpaceIdAfterDelete(current.spaces, spaceId);
  const incoming = makeCenterSpaceKey(hostId, nextId);
  invalidateCenterSpaceThumbnailCapture();
  await runCenterSpaceSlide("back", () => {
    clearCenterDeepLinkUrl();
    store.setActiveSpace(hostId, nextId);
    paintIncomingSpace(incoming);
  });
  const paintId = store.removeSpace(hostId, spaceId);
  if (paintId) cleanupCenterSpaceContext(paintId);
}
