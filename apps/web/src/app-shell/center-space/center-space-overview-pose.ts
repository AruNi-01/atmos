import {
  engageCenterSpaceLayoutShield,
  releaseCenterSpaceLayoutShield,
} from "@/app-shell/center-space/center-space-layout-shield";
import {
  CENTER_SPACE_OVERVIEW_EASE,
  CENTER_SPACE_OVERVIEW_MS,
  centerSpaceOverviewTransform,
  centerSpacePoseRingWidth,
  type CenterSpaceBox,
} from "@/app-shell/center-space/center-space-overview-motion";

const IDENTITY_TRANSFORM = "translate3d(0px, 0px, 0px) scale(1)";
const POSE_SCALE_VAR = "--center-space-pose-scale";
const POSE_TRANSITION = `transform ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}, ${POSE_SCALE_VAR} ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}, opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;
const RING_TRANSITION = `opacity ${CENTER_SPACE_OVERVIEW_MS}ms ${CENTER_SPACE_OVERVIEW_EASE}`;

let cachedHomeRadiusPx: string | null = null;

/** Used pixel length of the resting center-stage corner (`--radius-xl`). */
function centerStageHomeRadiusPx(): string {
  if (cachedHomeRadiusPx) return cachedHomeRadiusPx;
  const probe = document.createElement("div");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.borderTopLeftRadius = "var(--radius-xl)";
  document.body.appendChild(probe);
  const px = getComputedStyle(probe).borderTopLeftRadius;
  probe.remove();
  cachedHomeRadiusPx = px && px !== "0px" ? px : "14px";
  return cachedHomeRadiusPx;
}

/**
 * Visual radius stays `--radius-xl` at every scale. A fixed pixel radius
 * would shrink with the transform, then a transition to 0 would square the
 * corners until the pose clears.
 */
function poseRadius(): string {
  return `calc(${centerStageHomeRadiusPx()} / var(${POSE_SCALE_VAR}, 1))`;
}

function setPoseScale(el: HTMLElement, scale: number) {
  el.style.setProperty(POSE_SCALE_VAR, String(scale));
  el.style.borderRadius = poseRadius();
}

/**
 * Keep only the chrome outside the content slot. The slot runs to the far
 * edges of the leaf, so this is the tab strip (and a vertical strip when the
 * tabs sit on the side). An empty string means "do not clip".
 */
export function centerSpaceLeafClipPath(top: number, left: number): string {
  const y = top < 1 ? 0 : Math.ceil(top);
  const x = left < 1 ? 0 : Math.ceil(left);
  if (y < 1 && x < 1) return "";
  if (y > 0 && x > 0) {
    return `polygon(0 0, 100% 0, 100% ${y}px, ${x}px ${y}px, ${x}px 100%, 0 100%)`;
  }
  if (y > 0) return `inset(0 0 calc(100% - ${y}px) 0)`;
  return `inset(0 calc(100% - ${x}px) 0 0)`;
}

function offsetWithin(
  child: HTMLElement,
  ancestor: HTMLElement,
  axis: "offsetTop" | "offsetLeft",
): number | null {
  let sum = 0;
  let node: HTMLElement | null = child;
  for (let steps = 0; node && node !== ancestor && steps < 24; steps += 1) {
    sum += node[axis];
    const next: Element | null = node.offsetParent;
    if (!(next instanceof HTMLElement)) return null;
    if (next !== ancestor && !ancestor.contains(next)) return null;
    if (next === ancestor) return sum;
    node = next;
  }
  return node === ancestor ? sum : null;
}

/**
 * The mosaic is stacked above the live panels so the tab strip is not covered
 * by a full-bleed page. Its split leaf is also a `bg-background` plate the
 * size of the whole center. Leave that plate up and the scaled preview is
 * only the tabs, then the page pops in when the pose clears.
 *
 * Punch the plate and clip each leaf to its tab strip. The page underneath
 * is the same live center, just scaled. Empty panes have no content slot;
 * their empty state stays inside the leaf and is not clipped.
 */
function revealLiveSurface(root: ParentNode) {
  const leaves = root.querySelectorAll("[data-center-split-leaf]");
  for (const node of leaves) {
    if (!(node instanceof HTMLElement)) continue;
    node.style.setProperty("background-color", "transparent", "important");
    node.style.setProperty("box-shadow", "none", "important");
    for (const child of node.children) {
      if (!(child instanceof HTMLElement)) continue;
      child.style.setProperty("background-color", "transparent", "important");
    }
    const slot = node.querySelector("[data-center-pane-content-slot]");
    if (!(slot instanceof HTMLElement) || !node.contains(slot)) {
      node.style.clipPath = "";
      continue;
    }
    const top = offsetWithin(slot, node, "offsetTop");
    const left = offsetWithin(slot, node, "offsetLeft");
    node.style.clipPath = top == null || left == null ? "" : centerSpaceLeafClipPath(top, left);
  }
}

function restoreLiveSurface(root: ParentNode) {
  const leaves = root.querySelectorAll("[data-center-split-leaf]");
  for (const node of leaves) {
    if (!(node instanceof HTMLElement)) continue;
    node.style.clipPath = "";
    node.style.removeProperty("background-color");
    node.style.removeProperty("box-shadow");
    for (const child of node.children) {
      if (!(child instanceof HTMLElement)) continue;
      child.style.removeProperty("background-color");
    }
  }
}

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

function slotPose(el: HTMLElement, slot: HTMLElement): { transform: string; scale: number } | null {
  const from = elementLayoutBox(el);
  if (!from) return null;
  const to = slot.getBoundingClientRect();
  if (to.width < 2 || to.height < 2) return null;
  const pose = centerSpaceOverviewTransform(from, to);
  if (!Number.isFinite(pose.scale) || pose.scale <= 0) return null;
  return {
    transform: `translate3d(${pose.x}px, ${pose.y}px, 0) scale(${pose.scale})`,
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
      el.style.removeProperty(POSE_SCALE_VAR);
      el.removeAttribute("data-center-space-posed");
      if (el.hasAttribute("data-center-stage-mosaic")) restoreLiveSurface(el);
    }
    saved.clear();
    // The pose transform is gone. Releasing the shield earlier lets a page
    // read the card box, and ResizeObserver will not measure again.
    releaseCenterSpaceLayoutShield();
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
    // The page under this surface keeps measuring the full center. Which
    // page is open does not matter; a later page uses the same rects.
    engageCenterSpaceLayoutShield();
    el.setAttribute("data-center-space-posed", "");
    el.style.transformOrigin = "0 0";
    el.style.willChange = "transform, opacity";
    // A 0-height frame clips its overflowing panels to nothing. Only clip
    // once the border box actually covers the surface.
    el.style.overflow = el.offsetWidth >= 2 && el.offsetHeight >= 2 ? "hidden" : "visible";
    // The mosaic carries the tab strip. A transform traps that strip inside
    // the mosaic, so the strip has to sit above the panel host or a
    // full-bleed panel covers the tabs. The leaf under those tabs is clipped
    // away — it is not the page. The page is the workspace frame scaled into
    // the same slot.
    const mosaic = el.hasAttribute("data-center-stage-mosaic");
    el.style.zIndex = mosaic ? "4" : "2";
    if (mosaic) revealLiveSurface(el);
    if (fadeIn) {
      el.style.backgroundColor = "var(--background)";
      el.style.transition = "none";
      el.style.transform = pose.transform;
      setPoseScale(el, pose.scale);
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
      setPoseScale(el, pose.scale);
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
    // Scale starts at 1 so the corner matches the resting stage, then tracks
    // the pose. An empty radius is 0 and the shrink opens on a square.
    el.style.transition = "none";
    if (!el.style.getPropertyValue(POSE_SCALE_VAR)) setPoseScale(el, 1);
    const ring = showRing ? poseRing(el) : null;
    if (ring) {
      ring.style.transition = "none";
      paintPoseRing(ring, pose.scale, "0");
    }
    void el.offsetWidth;
    el.style.opacity = "1";
    el.style.transition = POSE_TRANSITION;
    el.style.transform = pose.transform;
    setPoseScale(el, pose.scale);
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
    // The mosaic (z-index 4) stays above this host so the tab strip paints
    // over the full-bleed panel for the whole scale. The leaf background is
    // transparent while the gallery is open.
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
    // One ring, on the mosaic. It is the top scaled surface, so the same edge
    // stays visible over the tab strip, a clipped page, and the empty
    // launcher. A ring on the frame sits under this mosaic and each page
    // covers a different side of it.
    if (mosaic) place(mosaic, activeSlot, animateActive, false, true);
    if (active) place(active, activeSlot, animateActive, false);
  };

  const animateToIdentity = (el: HTMLElement) => {
    // Keep the authored translate/scale list. Swapping in the computed matrix
    // and targeting `none` does not interpolate, so the zoom back cuts.
    const inline = el.style.transform;
    if (inline && inline !== "none") el.style.transform = inline;
    const ring = poseRing(el);
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
    // Back to scale 1. Radius is `home / scale`, so the corner stays the
    // stage's rounded-xl instead of flattening to a square.
    setPoseScale(el, 1);
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
