import { mdLivePopoverAnchorStyle, type MdLiveViewportRect } from "@atmos/md-live";

export const MD_LIVE_BAR_HOVER_PX = 72;
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
export const MD_LIVE_AGENT_THREAD_MAX_CLASS = "max-h-[min(70vh,32rem)] overflow-y-auto";

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

export type MdLiveBarMode = "hidden" | "collapsed" | "focused" | "expanded";
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
}): MdLiveBarMode {
  if (input.popover) return "hidden";
  if (input.expanded) return "expanded";
  if (input.focused || input.hasDraft) return "focused";
  if (input.working || input.hover || input.hasThread) return "collapsed";
  return "hidden";
}

/** Message card only when there are messages. Working with 0 messages is a pill, not an empty shell. */
export function mdLiveShowThreadCard(input: {
  popover: boolean;
  barExpanded: boolean;
  messageCount: number;
}): boolean {
  return (input.popover || input.barExpanded) && input.messageCount > 0;
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

export function isMdLiveBarHoverZone(clientY: number, hostBottom: number): boolean {
  return clientY >= hostBottom - MD_LIVE_BAR_HOVER_PX;
}
