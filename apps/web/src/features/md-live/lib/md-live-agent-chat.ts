import { mdLivePopoverAnchorStyle, type MdLiveViewportRect } from "@atmos/md-live";

/** Shared layoutId for hairline ↔ Message Agent capsule ↔ composer. */
export const MD_LIVE_INVITE_LAYOUT_ID = "md-live-invite-shell";
/** Hairline / capsule / composer morph duration (seconds). */
export const MD_LIVE_BAR_MORPH_S = 0.32;
export const MD_LIVE_BAR_COLLAPSE_MORPH_S = 0.28;
/** Snappy ease-out. Collapse uses a monotonic tween so the shell never inflates first. */
export const MD_LIVE_BAR_EXPAND_EASE = [0.22, 1, 0.36, 1] as const;
export const MD_LIVE_BAR_COLLAPSE_EASE = [0.45, 0.05, 0.55, 0.95] as const;
/** Centered short dash. Slightly shorter than the Message Agent capsule. */
export const MD_LIVE_INVITE_HAIRLINE_WIDTH_PX = 104;
export const MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX = 4;
/** Capsule height (`h-9`) the dash expands into. */
export const MD_LIVE_INVITE_PILL_HEIGHT_PX = 36;
/**
 * Shared layoutId shell stays a capsule for every morph frame. Interpolating
 * `rounded-2xl` (16) ↔ `rounded-full` (9999) passes through a near-square.
 */
export const MD_LIVE_INVITE_SHELL_RADIUS_PX = 9999;
/**
 * Shared bottom inset for hairline and pill (viewport/editor bottom → control bottom).
 * Both states use the same edge so the pill contains the dash; height grows upward.
 */
export const MD_LIVE_INVITE_BOTTOM_PX = 16;
/** TranslateY stays 0. A positive y used to shove the dash out of the pill hit box. */
export const MD_LIVE_INVITE_HAIRLINE_Y_PX = 0;
/** Extra hit above the 4px dash only (must stay inside the expanded pill). */
export const MD_LIVE_INVITE_HAIRLINE_HIT_ABOVE_PX = 8;
/** Swallow one-frame leave while the shell morphs; short enough not to feel sticky. */
export const MD_LIVE_INVITE_HOVER_LEAVE_MS = 48;
export const MD_LIVE_INVITE_HOVER_SELECTOR =
  "[data-md-live-invite-hairline], [data-md-live-message-agent], [data-md-live-invite-hit]";
export const MD_LIVE_POPOVER_WIDTH = 420;
export const MD_LIVE_AGENT_CAPABILITY = "md-live.v1";
export const MD_LIVE_AGENT_SKILL_PATH = "~/.atmos/skills/.system/atmos-md-live-agent/SKILL.md";
/** Same slot as automation `"automation"`. Written on Agent Chat create. */
export const MD_LIVE_AGENT_CHAT_SOURCE = "md-live";
/** Bordered card for the message list only — never the empty overlay or the input layer. */
export const MD_LIVE_AGENT_PANEL_CLASS =
  "flex flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg";
/** Transparent overlay stack: thread card (optional) + gap + composer. */
export const MD_LIVE_AGENT_STACK_CLASS = "flex flex-col gap-2";
export const MD_LIVE_AGENT_THREAD_MAX_CLASS = "max-h-[min(70vh,32rem)] overflow-hidden";

/** Overlay container queries (`md-live-agent-overlay.css`). Hide order, wide → narrow. */
export const MD_LIVE_AGENT_CHROME_MAX_THREAD_PX = 576;
export const MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX = 448;
export const MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX = 352;
export const MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX = 288;

export type MdLiveAgentChromeStep =
  | "full"
  | "hide-thread"
  | "model-icon"
  | "mode-icon"
  | "permission-icon";

/** Adaptive chrome for Live overlays. Sidebar is not a named `md-live-agent` container. */
export function mdLiveAgentChromeStep(widthPx: number): MdLiveAgentChromeStep {
  if (widthPx <= MD_LIVE_AGENT_CHROME_MAX_PERMISSION_LABEL_PX) return "permission-icon";
  if (widthPx <= MD_LIVE_AGENT_CHROME_MAX_MODE_LABEL_PX) return "mode-icon";
  if (widthPx <= MD_LIVE_AGENT_CHROME_MAX_MODEL_TEXT_PX) return "model-icon";
  if (widthPx <= MD_LIVE_AGENT_CHROME_MAX_THREAD_PX) return "hide-thread";
  return "full";
}

const MD_LIVE_OVERLAY_TITLE_NOISE =
  /^(You are editing|Rewrite the selected|Summarize the selected|Read ~\/\.atmos\/skills)/i;

export type MdLiveBarMode = "hidden" | "invite" | "collapsed" | "focused" | "expanded";
export type MdLiveBarSurface = "hidden" | "invite" | "status" | "composer";
export type MdLiveAgentPlacement = "popover" | "bottom";

export function mdLiveAgentChatInstanceKey(filePath: string): string {
  return `md-live:${filePath}`;
}

export function mdLiveAgentClientId(filePath: string): string {
  return mdLiveAgentChatInstanceKey(filePath);
}

export function nextMdLiveBarMode(input: {
  popover: boolean;
  hover: boolean;
  focused: boolean;
  hasDraft: boolean;
  expanded: boolean;
  working: boolean;
  hasThread?: boolean;
  reviewPending?: boolean;
}): MdLiveBarMode {
  if (input.popover) return "hidden";
  if (input.expanded) return "expanded";
  if (input.focused || input.hasDraft) return "focused";
  if (input.working || input.hasThread || input.reviewPending) return "collapsed";
  if (input.hover) return "invite";
  return "hidden";
}

/** Hover is the Message Agent pill. Click (focused/expanded) is the composer. Hidden still paints a hairline. */
export function mdLiveBarSurface(mode: MdLiveBarMode, popover: boolean): MdLiveBarSurface {
  if (popover) return "composer";
  if (mode === "invite") return "invite";
  if (mode === "collapsed") return "status";
  if (mode === "focused" || mode === "expanded") return "composer";
  return "hidden";
}

/** Empty-session entry morph: hairline ↔ capsule ↔ composer. Working/thread chrome stays on the layered path. */
export function mdLiveInviteMorphs(
  surface: MdLiveBarSurface,
  input: { showThreadCard: boolean; hasComposerChrome: boolean },
): boolean {
  if (surface === "hidden" || surface === "invite") return true;
  return surface === "composer" && !input.showThreadCard && !input.hasComposerChrome;
}

/** Message card only when there are messages. Working with 0 messages is a pill, not an empty shell. */
export function mdLiveShowThreadCard(input: {
  popover: boolean;
  barExpanded: boolean;
  messageCount: number;
}): boolean {
  return (input.popover || input.barExpanded) && input.messageCount > 0;
}

/** Status pill above the composer when the thread card is minimized. */
export function mdLiveShowWorkingPill(input: {
  showThreadCard: boolean;
  busy: boolean;
  messageCount: number;
}): boolean {
  return !input.showThreadCard && (input.busy || input.messageCount > 0);
}

/** Frozen turn duration for the idle "Worked for …" pill. */
export function mdLiveIdleWorkedMs(
  elapsedMs: number,
  messages: Array<{ role?: string; worked_ms?: number | null }>,
): number {
  if (elapsedMs > 0) return elapsedMs;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const worked = messages[i]?.worked_ms;
    if (messages[i]?.role === "assistant" && worked != null && worked > 0) return worked;
  }
  return 0;
}

const MD_LIVE_OVERLAY_DISMISS_IGNORE = "[data-morph-popover-portal], [role='dialog']";

/** Unpinned popover click-outside. Ignore overlay chrome and portaled pickers. */
export function isMdLiveAgentOverlayDismissTarget(
  target: EventTarget | null,
  host: { contains: (node: Node) => boolean } | null,
): boolean {
  if (!target || typeof target !== "object") return true;
  const node = target as Node;
  if (host?.contains(node)) return false;
  const closest = (target as { closest?: (selector: string) => unknown }).closest;
  if (typeof closest === "function" && closest.call(target, MD_LIVE_OVERLAY_DISMISS_IGNORE)) {
    return false;
  }
  return true;
}

export function mdLiveSelectionPopoverStyle(
  rect: MdLiveViewportRect,
  popoverWidth = MD_LIVE_POPOVER_WIDTH,
  viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth,
): { top: number; left: number } {
  return mdLivePopoverAnchorStyle(rect, popoverWidth, 8, viewportWidth);
}

export function mdLiveOverlayTitle(
  displayTitle: string | null | undefined,
  fallback: string,
): string {
  const title = displayTitle?.trim() ?? "";
  if (!title || MD_LIVE_OVERLAY_TITLE_NOISE.test(title)) return fallback;
  return title;
}

export function transformMdLivePrompt(input: {
  prompt: string;
  filePath: string;
  invokeUrl: string;
  clientId: string;
  selection: string;
}): string {
  const selection = input.selection.trim();
  const body = {
    request_id: "<uuid>",
    tool: "md_live_replace_selection",
    args: { markdown: "<replacement markdown>" },
    client_id: input.clientId,
  };
  const contract = [
    `Read ${MD_LIVE_AGENT_SKILL_PATH} and follow it.`,
    `Path: ${input.filePath}`,
    selection ? `Current selection:\n${selection}` : "No text is selected.",
    `You MUST edit Live by HTTP POST ${input.invokeUrl} with Content-Type: application/json.`,
    `Body: ${JSON.stringify(body)}`,
    "Allowed tools: md_live_get, md_live_replace_selection, md_live_insert, md_live_replace_document, md_live_tools_list.",
    "Do not use fs_write, shell redirects, or file tools on this document path.",
    "Do not only reply with rewritten text in chat. Invoke md_live_replace_selection (or insert / replace_document) first, then a short chat reply.",
  ].join("\n");
  return `${input.prompt}\n\n${contract}`;
}

export function mdLiveRewritePrompt(): string {
  return "Rewrite the selected markdown in place using md_live_replace_selection.";
}

export function mdLiveSummarizePrompt(): string {
  return "Summarize the selected markdown in place using md_live_replace_selection.";
}

/** Invite morph only when the pointer is on the short dash or capsule — never the dock. */
export function isMdLiveInviteHoverTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const closest = (target as { closest?: (selector: string) => unknown }).closest;
  if (typeof closest !== "function") return false;
  return Boolean(closest.call(target, MD_LIVE_INVITE_HOVER_SELECTOR));
}

export type MdLiveInviteShellSurface = "hidden" | "invite";

export type MdLiveInviteBox = {
  width: number;
  height: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Gap from the window/editor bottom to the hairline's bottom edge. */
export function mdLiveInviteHairlineGapFromBottomPx(
  bottomPx = MD_LIVE_INVITE_BOTTOM_PX,
  yPx = MD_LIVE_INVITE_HAIRLINE_Y_PX,
): number {
  return bottomPx - yPx;
}

export function mdLiveInviteShellBox(input: {
  surface: MdLiveInviteShellSurface;
  viewportWidth: number;
  viewportHeight: number;
  pillWidthPx: number;
  bottomPx?: number;
  hairlineYPx?: number;
}): MdLiveInviteBox {
  const bottomPx = input.bottomPx ?? MD_LIVE_INVITE_BOTTOM_PX;
  const yPx = input.surface === "hidden" ? (input.hairlineYPx ?? MD_LIVE_INVITE_HAIRLINE_Y_PX) : 0;
  const width = input.surface === "hidden" ? MD_LIVE_INVITE_HAIRLINE_WIDTH_PX : input.pillWidthPx;
  const height =
    input.surface === "hidden" ? MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX : MD_LIVE_INVITE_PILL_HEIGHT_PX;
  const left = (input.viewportWidth - width) / 2;
  const boxBottom = input.viewportHeight - bottomPx + yPx;
  return { width, height, left, top: boxBottom - height, right: left + width, bottom: boxBottom };
}

export function mdLiveInviteBoxContains(
  box: MdLiveInviteBox,
  point: { x: number; y: number },
): boolean {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

export function mdLiveInviteHairlineHitBox(box: MdLiveInviteBox): MdLiveInviteBox {
  return {
    ...box,
    top: box.top - MD_LIVE_INVITE_HAIRLINE_HIT_ABOVE_PX,
    height: box.height + MD_LIVE_INVITE_HAIRLINE_HIT_ABOVE_PX,
  };
}

/** Hairline (and its above-only slop) must sit inside the pill so a still pointer cannot leave. */
export function mdLiveInviteHoverContainsHairline(pillWidthPx: number): boolean {
  const viewport = { viewportWidth: 800, viewportHeight: 600, pillWidthPx };
  const hairline = mdLiveInviteHairlineHitBox(
    mdLiveInviteShellBox({ surface: "hidden", ...viewport }),
  );
  const pill = mdLiveInviteShellBox({ surface: "invite", ...viewport });
  const points = [
    { x: hairline.left, y: hairline.top },
    { x: hairline.right, y: hairline.top },
    { x: hairline.left, y: hairline.bottom },
    { x: hairline.right, y: hairline.bottom },
    { x: (hairline.left + hairline.right) / 2, y: (hairline.top + hairline.bottom) / 2 },
  ];
  return points.every((point) => mdLiveInviteBoxContains(pill, point));
}

export type MdLiveInviteMorphKind = "expand" | "collapse";

export function mdLiveBarMorphTransition(kind: MdLiveInviteMorphKind): {
  type: "tween";
  duration: number;
  ease: readonly [number, number, number, number];
  layout: { type: "tween"; duration: number; ease: readonly [number, number, number, number] };
  width: { type: "tween"; duration: number; ease: readonly [number, number, number, number] };
  height: { type: "tween"; duration: number; ease: readonly [number, number, number, number] };
  y: { type: "tween"; duration: number; ease: readonly [number, number, number, number] };
  opacity: { type: "tween"; duration: number; ease: readonly [number, number, number, number] };
  scale: { type: "tween"; duration: number; ease: readonly [number, number, number, number] };
} {
  const duration = kind === "collapse" ? MD_LIVE_BAR_COLLAPSE_MORPH_S : MD_LIVE_BAR_MORPH_S;
  const ease = kind === "collapse" ? MD_LIVE_BAR_COLLAPSE_EASE : MD_LIVE_BAR_EXPAND_EASE;
  const axis = { type: "tween" as const, duration, ease };
  return {
    type: "tween",
    duration,
    ease,
    layout: axis,
    width: axis,
    height: axis,
    y: axis,
    opacity: axis,
    scale: axis,
  };
}

/** Label shrinks with the 36→4 shell so it never vanishes on a still-pill box. */
export const MD_LIVE_INVITE_LABEL_COLLAPSE_SCALE =
  MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX / MD_LIVE_INVITE_PILL_HEIGHT_PX;

export function mdLiveInviteCollapseFrame(
  progress: number,
  pillWidthPx: number,
): {
  width: number;
  height: number;
  labelOpacity: number;
  labelScale: number;
  borderRadius: number;
} {
  const p = Math.min(1, Math.max(0, progress));
  return {
    width: pillWidthPx + (MD_LIVE_INVITE_HAIRLINE_WIDTH_PX - pillWidthPx) * p,
    height:
      MD_LIVE_INVITE_PILL_HEIGHT_PX +
      (MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX - MD_LIVE_INVITE_PILL_HEIGHT_PX) * p,
    labelOpacity: 1 - p,
    labelScale: 1 + (MD_LIVE_INVITE_LABEL_COLLAPSE_SCALE - 1) * p,
    borderRadius: MD_LIVE_INVITE_SHELL_RADIUS_PX,
  };
}

/** Capsule as long as radius is at least half the live height. */
export function mdLiveInviteShellRadiusIsCapsule(radiusPx: number, heightPx: number): boolean {
  return radiusPx >= heightPx / 2 - 0.01;
}

/** Empty-capsule flash: label already gone while the shell is still ~pill sized. */
export function mdLiveInviteFrameIsEmptyCapsule(
  frame: { width: number; height: number; labelOpacity: number },
  pillWidthPx: number,
): boolean {
  return frame.labelOpacity < 0.12 && frame.width > pillWidthPx * 0.82 && frame.height > 28;
}

/** Message Agent copy only on the invite pill (and while that pill is collapsing). */
export function mdLiveInviteShowsMessageAgentLabel(
  surface: MdLiveBarSurface,
  collapseFrom: MdLiveBarSurface | null,
): boolean {
  if (surface === "invite") return true;
  return surface === "hidden" && collapseFrom === "invite";
}

/** Keep the composer node mounted so dismiss never remounts the Message Agent pill. */
export function mdLiveInvitePaintComposer(
  surface: MdLiveBarSurface,
  collapseFrom: MdLiveBarSurface | null,
): boolean {
  return surface === "composer" || (surface === "hidden" && collapseFrom === "composer");
}

export function mdLiveInviteComposerCollapseFrame(
  progress: number,
  composerWidthPx: number,
  composerHeightPx: number,
): {
  width: number;
  height: number;
  contentOpacity: number;
  messageAgentLabel: boolean;
  borderRadius: number;
} {
  const p = Math.min(1, Math.max(0, progress));
  return {
    width: composerWidthPx + (MD_LIVE_INVITE_HAIRLINE_WIDTH_PX - composerWidthPx) * p,
    height: composerHeightPx + (MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX - composerHeightPx) * p,
    contentOpacity: 1 - p,
    messageAgentLabel: false,
    borderRadius: MD_LIVE_INVITE_SHELL_RADIUS_PX,
  };
}

/** Click-outside / blur from chat: drop hover so we never land on invite. */
export function mdLiveInviteAfterClickOutside(input: {
  hasDraft: boolean;
  working: boolean;
  hasThread?: boolean;
  reviewPending?: boolean;
}): MdLiveBarMode {
  return nextMdLiveBarMode({
    popover: false,
    hover: false,
    focused: false,
    hasDraft: input.hasDraft,
    expanded: false,
    working: input.working,
    hasThread: input.hasThread,
    reviewPending: input.reviewPending,
  });
}

/** Direct keyframes — composer/pill → hairline must not pass through a larger box. */
export function mdLiveInviteMorphKeyframes(
  from: "hidden" | "invite" | "composer",
  to: "hidden" | "invite" | "composer",
  sizes: { pillWidthPx: number; composerWidthPx: number; composerHeightPx: number },
): Array<{ width: number; height: number }> {
  const sizeOf = (surface: typeof from) => {
    if (surface === "hidden") {
      return { width: MD_LIVE_INVITE_HAIRLINE_WIDTH_PX, height: MD_LIVE_INVITE_HAIRLINE_HEIGHT_PX };
    }
    if (surface === "invite") {
      return { width: sizes.pillWidthPx, height: MD_LIVE_INVITE_PILL_HEIGHT_PX };
    }
    return { width: sizes.composerWidthPx, height: sizes.composerHeightPx };
  };
  return [sizeOf(from), sizeOf(to)];
}

export function mdLiveInviteMorphIsMonotonicShrink(
  from: "invite" | "composer",
  to: "hidden" | "invite",
  sizes: { pillWidthPx: number; composerWidthPx: number; composerHeightPx: number },
): boolean {
  const frames = mdLiveInviteMorphKeyframes(from, to, sizes);
  if (frames.length !== 2) return false;
  const [start, end] = frames;
  return end.width <= start.width && end.height <= start.height;
}
