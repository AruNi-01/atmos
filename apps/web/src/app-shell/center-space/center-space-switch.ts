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
  // The slide has already committed. Snapdom walks the center tree on the
  // main thread, so run it when the browser is idle instead of on the click.
  const run = () => {
    void captureActiveCenterSpaceThumbnail(hostId);
  };
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(run, { timeout: 1600 });
    return;
  }
  window.setTimeout(run, CENTER_SPACE_SLIDE_MS);
}

function paintIncomingSpace(incoming: string): void {
  applyWorkspaceFrameVisualDom(incoming);
  useWorkspaceSurfaceCacheStore.getState().beginVisualSwitch(incoming);
}

export type OpenNewCenterSpaceOptions = {
  /** Overview zoom owns the motion, so skip the center slide. */
  animate?: boolean;
};

export async function openNewCenterSpace(
  hostId: string,
  name?: string,
  options?: OpenNewCenterSpaceOptions,
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
  // Drop an in-flight preview. Waiting for snapdom here froze the new-space hop.
  invalidateCenterSpaceThumbnailCapture();
  if (options?.animate === false) {
    clearCenterDeepLinkUrl();
    space = store.createSpace(hostId, name, spaceId);
    if (space) paintIncomingSpace(incoming);
  } else {
    await runCenterSpaceSlide("forward", () => {
      clearCenterDeepLinkUrl();
      space = store.createSpace(hostId, name, spaceId);
      if (space) paintIncomingSpace(incoming);
    });
    if (space) scheduleIncomingSpaceThumbnail(hostId);
  }
  if (!space) return null;
  return space;
}

export type SwitchCenterSpaceOptions = {
  fromCard?: HTMLElement | null;
  onPaint?: () => void;
  /** Keep `tab` / `terminalTmux` / `sideChat` — agent pane jumps own the dest URL. */
  preserveDeepLink?: boolean;
  /** Overview zoom owns the motion, so skip the center slide. */
  animate?: boolean;
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
  // Do not screenshot the outgoing space on this path. snapdom blocks the
  // main thread for a second or two, so the slide cannot start. The overview
  // scales the live frame and skips the shot entirely.
  invalidateCenterSpaceThumbnailCapture();
  if (options?.animate === false) {
    options?.onPaint?.();
    if (!options?.preserveDeepLink) clearCenterDeepLinkUrl();
    store.setActiveSpace(hostId, spaceId);
    paintIncomingSpace(incoming);
  } else {
    await runCenterSpaceSlide(
      direction,
      () => {
        options?.onPaint?.();
        if (!options?.preserveDeepLink) clearCenterDeepLinkUrl();
        store.setActiveSpace(hostId, spaceId);
        paintIncomingSpace(incoming);
      },
      { fromCard: options?.fromCard ?? null },
    );
    scheduleIncomingSpaceThumbnail(hostId);
  }
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
