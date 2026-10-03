import {
  CENTER_SPACE_OVERVIEW_EASE,
  CENTER_SPACE_OVERVIEW_MS,
  centerSpaceOverviewTransform,
  centerSpacePoseRingWidth,
  type CenterSpaceBox,
} from "@/app-shell/center-space/center-space-overview-motion";

const IDENTITY_TRANSFORM = "translate3d(0px, 0px, 0px) scale(1)";
const POSE_TRANSITION = `transform ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}, border-radius ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}, opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;
const RING_TRANSITION = `opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;

type SavedStyle = {
  transform: string;
  transition: string;
  opacity: string;
  borderRadius: string;
  overflow: string;
  zIndex: string;
  willChange: string;
  transformOrigin: string;
  backgroundColor: string;
};

function poseRing(el: HTMLElement): HTMLElement | null {
  const node = el.querySelector(":scope > [data-center-space-pose-ring]");
  return node instanceof HTMLElement ? node : null;
}

function paintPoseRing(ring: HTMLElement, scale: number, opacity: string) {
  // A child border sits above the editor, chat, and terminal. An outline or
  // inset shadow on the frame itself is clipped or covered by those panes.
  ring.style.borderStyle = "solid";
  ring.style.borderColor = "var(--foreground)";
  ring.style.borderWidth = centerSpacePoseRingWidth(scale);
  ring.style.opacity = opacity;
}

function resetPoseRing(el: HTMLElement) {
  const ring = poseRing(el);
  if (!ring) return;
  ring.style.transition = "none";
  ring.style.opacity = "";
  ring.style.borderStyle = "";
  ring.style.borderColor = "";
  ring.style.borderWidth = "";
}

function scaleFromTransform(transform: string): number {
  const match = /scale\(([^)]+)\)/.exec(transform);
  const value = match ? Number(match[1]) : 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function elementLayoutBox(el: HTMLElement, allowHostFallback = true): CenterSpaceBox | null {
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  const collapsed = width < 2 || height < 2;
  // A collapsed frame still paints keep-alive panels that overflow it in
  // panel-host coordinates. Scale that host box, or the tabs move and the
  // surface stays full size on top of the gallery.
  if (collapsed && allowHostFallback && el.hasAttribute("data-workspace-frame")) {
    const host = el.closest("[data-center-panel-host]");
    if (host instanceof HTMLElement && host !== el) {
      const hostBox = elementLayoutBox(host, false);
      if (hostBox) return hostBox;
    }
  }
  if (collapsed) return null;
  const parent = el.offsetParent instanceof HTMLElement ? el.offsetParent : el.parentElement;
  if (!parent) return null;
  const parentRect = parent.getBoundingClientRect();
  const style = getComputedStyle(parent);
  const borderLeft = Number.parseFloat(style.borderLeftWidth) || 0;
  const borderTop = Number.parseFloat(style.borderTopWidth) || 0;
  return {
    left: parentRect.left + borderLeft + el.offsetLeft,
    top: parentRect.top + borderTop + el.offsetTop,
    width,
    height,
  };
}

function slotInnerRadius(slot: HTMLElement): number {
  const shell = slot.closest("button");
  const node = shell instanceof HTMLElement ? shell : slot;
  const style = getComputedStyle(node);
  const radius = Number.parseFloat(style.borderTopLeftRadius) || 0;
  const border = Number.parseFloat(style.borderTopWidth) || 0;
  return Math.max(0, radius - border);
}

function slotPose(
  el: HTMLElement,
  slot: HTMLElement,
): { transform: string; radius: string; scale: number } | null {
  const from = elementLayoutBox(el);
  if (!from) return null;
  const to = slot.getBoundingClientRect();
  if (to.width < 2 || to.height < 2) return null;
  const pose = centerSpaceOverviewTransform(from, to);
  if (!Number.isFinite(pose.scale) || pose.scale <= 0) return null;
  return {
    transform: `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`,
    radius: `${(slotInnerRadius(slot) / pose.scale).toFixed(2)}px`,
    scale: pose.scale,
  };
}

/**
 * Scales live center frames into overview slots.
 * Screenshots are not used — the mounted workspace frame is the preview.
 */
export function createCenterSpaceOverviewPose() {
  const saved = new Map<HTMLElement, SavedStyle>();

  const remember = (el: HTMLElement) => {
    if (saved.has(el)) return;
    saved.set(el, {
      transform: el.style.transform,
      transition: el.style.transition,
      opacity: el.style.opacity,
      borderRadius: el.style.borderRadius,
      overflow: el.style.overflow,
      zIndex: el.style.zIndex,
      willChange: el.style.willChange,
      transformOrigin: el.style.transformOrigin,
      backgroundColor: el.style.backgroundColor,
    });
  };

  const clear = () => {
    for (const [el, prev] of saved) {
      // `scale(1)` does not interpolate to `none`. Clearing the pose while
      // the zoom transition is still set snaps the settled page in.
      resetPoseRing(el);
      el.style.transition = "none";
      el.style.transform = prev.transform;
      el.style.opacity = prev.opacity;
      el.style.borderRadius = prev.borderRadius;
      el.style.overflow = prev.overflow;
      el.style.zIndex = prev.zIndex;
      el.style.willChange = prev.willChange;
      el.style.transformOrigin = prev.transformOrigin;
      el.style.backgroundColor = prev.backgroundColor;
      el.style.transition = prev.transition;
      el.removeAttribute("data-center-space-posed");
    }
    saved.clear();
  };

  const place = (
    el: HTMLElement,
    slot: HTMLElement,
    animate: boolean,
    fadeIn: boolean,
    showRing = false,
  ) => {
    const pose = slotPose(el, slot);
    if (!pose) return;
    remember(el);
    el.setAttribute("data-center-space-posed", "");
    el.style.transformOrigin = "0 0";
    el.style.willChange = "transform, opacity";
    // A 0-height frame clips its overflowing panels to nothing. Only clip
    // once the border box actually covers the surface.
    el.style.overflow = el.offsetWidth >= 2 && el.offsetHeight >= 2 ? "hidden" : "visible";
    el.style.zIndex = el.hasAttribute("data-center-stage-mosaic") ? "1" : "2";
    if (fadeIn) {
      el.style.backgroundColor = "var(--background)";
      el.style.transition = "none";
      el.style.transform = pose.transform;
      el.style.borderRadius = pose.radius;
      el.style.opacity = "0";
      void el.offsetWidth;
      // Other spaces are already card-sized. Fade them in on the pose clock
      // so they arrive with the active surface instead of popping in late.
      el.style.transition = `opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;
      el.style.opacity = "1";
      return;
    }
    if (!animate) {
      el.style.transition = "none";
      el.style.transform = pose.transform;
      el.style.borderRadius = pose.radius;
      el.style.opacity = "1";
      const settled = poseRing(el);
      if (settled) {
        settled.style.transition = "none";
        if (showRing) paintPoseRing(settled, pose.scale, "1");
        else resetPoseRing(el);
      }
      return;
    }
    // Commit the current box, then transition. Setting both in one frame
    // skips the interpolation and the shrink / zoom looks like a cut.
    el.style.transition = "none";
    const ring = showRing ? poseRing(el) : null;
    if (ring) {
      ring.style.transition = "none";
      paintPoseRing(ring, pose.scale, "0");
    }
    void el.offsetWidth;
    el.style.opacity = "1";
    el.style.transition = POSE_TRANSITION;
    el.style.transform = pose.transform;
    el.style.borderRadius = pose.radius;
    if (ring) {
      ring.style.transition = RING_TRANSITION;
      ring.style.opacity = "1";
    }
  };

  const applySlots = (
    stage: HTMLElement,
    slots: ReadonlyMap<string, HTMLElement>,
    activePaintId: string,
    animateActive: boolean,
    missingOnly = false,
  ) => {
    const frames = stage.querySelectorAll<HTMLElement>("[data-workspace-frame]");
    for (const frame of frames) {
      const paintId = frame.getAttribute("data-workspace-frame");
      if (!paintId || paintId === activePaintId) continue;
      const slot = slots.get(paintId);
      if (!slot) continue;
      const already = frame.hasAttribute("data-center-space-posed");
      if (missingOnly && already) continue;
      place(frame, slot, false, !already);
    }
    if (missingOnly) return;
    const activeSlot = activePaintId ? slots.get(activePaintId) : undefined;
    if (!activeSlot) return;
    const mosaic = stage.querySelector<HTMLElement>("[data-center-stage-mosaic]");
    if (mosaic) place(mosaic, activeSlot, animateActive, false);
    // The mosaic is a sibling of the panel host. Its pane leaf is an opaque
    // bg-background, and z-index on a frame stays trapped inside the host.
    // Lift the host above the mosaic or that leaf covers the scaled surface
    // and the preview is only the tab strip again.
    const host = stage.querySelector<HTMLElement>("[data-center-panel-host]");
    if (host) {
      remember(host);
      host.style.zIndex = "3";
    }
    const overlay = stage.querySelector<HTMLElement>("[data-launchpad-center-overlay]");
    if (overlay) place(overlay, activeSlot, animateActive, false);
    const active = stage.querySelector<HTMLElement>(
      `[data-workspace-frame="${CSS.escape(activePaintId)}"]`,
    );
    // The ring lives on the scaling frame, so it shrinks and grows with the
    // surface instead of sitting on the static card.
    if (active) place(active, activeSlot, animateActive, false, true);
  };

  const animateToIdentity = (el: HTMLElement) => {
    // Keep the authored translate/scale list. Swapping in the computed matrix
    // and targeting `none` does not interpolate, so the zoom back cuts.
    const inline = el.style.transform;
    if (inline && inline !== "none") el.style.transform = inline;
    const ring = el.hasAttribute("data-workspace-frame") ? poseRing(el) : null;
    el.style.transition = "none";
    // A destination that was not the selected card has no ring yet. Commit
    // one before the zoom so it fades out across the scale instead of
    // flashing on the static card and vanishing.
    if (ring && !ring.style.borderWidth) {
      ring.style.transition = "none";
      paintPoseRing(ring, scaleFromTransform(inline), "1");
    }
    void el.offsetWidth;
    el.style.transition = POSE_TRANSITION;
    el.style.transform = IDENTITY_TRANSFORM;
    el.style.borderRadius = "0px";
    if (ring) {
      ring.style.transition = RING_TRANSITION;
      ring.style.opacity = "0";
    }
  };

  const isActivePiece = (el: HTMLElement, activePaintId: string) =>
    el.hasAttribute("data-center-stage-mosaic") ||
    el.hasAttribute("data-launchpad-center-overlay") ||
    el.getAttribute("data-workspace-frame") === activePaintId;

  const poseHome = (stage: HTMLElement, activePaintId: string, animate: boolean) => {
    if (!animate) {
      clear();
      return;
    }
    for (const el of saved.keys()) {
      if (!stage.contains(el)) continue;
      // The panel host is only lifted for stacking. Fading it hides the live
      // surface (it wraps the frame) and the zoom reads as a black frame.
      if (!el.hasAttribute("data-center-space-posed")) continue;
      if (isActivePiece(el, activePaintId)) {
        animateToIdentity(el);
        continue;
      }
      el.style.transition = `opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;
      el.style.opacity = "0";
    }
  };

  const zoomHome = (stage: HTMLElement, paintId: string): boolean => {
    const frame = stage.querySelector<HTMLElement>(
      `[data-workspace-frame="${CSS.escape(paintId)}"]`,
    );
    if (!frame || frame.getAttribute("data-center-space-posed") == null) return false;
    // Grow the tab chrome with the surface. Fading the mosaic and revealing
    // it after the scale reads as the real page popping in at the end.
    const grow = (el: HTMLElement | null) => {
      if (!el || el.getAttribute("data-center-space-posed") == null) return;
      el.style.opacity = "1";
      animateToIdentity(el);
    };
    const mosaic = stage.querySelector<HTMLElement>("[data-center-stage-mosaic]");
    grow(mosaic);
    grow(stage.querySelector<HTMLElement>("[data-launchpad-center-overlay]"));
    frame.style.zIndex = "6";
    frame.style.opacity = "1";
    animateToIdentity(frame);
    const frames = stage.querySelectorAll<HTMLElement>("[data-workspace-frame]");
    for (const other of frames) {
      if (other === frame) continue;
      remember(other);
      other.style.transition = `opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;
      other.style.opacity = "0";
    }
    return true;
  };

  return { applySlots, poseHome, zoomHome, clear };
}

export type CenterSpaceOverviewPose = ReturnType<typeof createCenterSpaceOverviewPose>;
