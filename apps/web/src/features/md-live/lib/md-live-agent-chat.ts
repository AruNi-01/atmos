import { mdLivePopoverAnchorStyle, type MdLiveViewportRect } from "@atmos/md-live";

export const MD_LIVE_BAR_HOVER_PX = 72;
export const MD_LIVE_POPOVER_WIDTH = 420;
export const MD_LIVE_AGENT_CAPABILITY = "md-live.v1";

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
}): MdLiveBarMode {
  if (input.popover) return "hidden";
  if (input.expanded) return "expanded";
  if (input.focused || input.hasDraft) return "focused";
  if (input.working || input.hover) return "collapsed";
  return "hidden";
}

export function mdLiveSelectionPopoverStyle(
  rect: MdLiveViewportRect,
  popoverWidth = MD_LIVE_POPOVER_WIDTH,
  viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth,
): { top: number; left: number } {
  return mdLivePopoverAnchorStyle(rect, popoverWidth, 8, viewportWidth);
}

export function transformMdLivePrompt(input: {
  prompt: string;
  filePath: string;
  invokeUrl: string;
  clientId: string;
  selection: string;
}): string {
  const selection = input.selection.trim();
  const header = [
    "You are editing the open Atmos Live markdown document.",
    `Path: ${input.filePath}`,
    selection ? `Current selection:\n${selection}` : "No text is selected.",
    `Document-edit invoke: POST ${input.invokeUrl} with JSON { request_id, tool, args, client_id: "${input.clientId}" }.`,
    "Allowed tools: md_live_get, md_live_replace_selection, md_live_insert, md_live_replace_document, md_live_tools_list.",
    "Do not use fs_write, shell, or file tools on this document path. Thoughts and tool traces stay in chat.",
    "Use md_live_replace_selection / md_live_insert / md_live_replace_document to change Live. Then reply in chat.",
  ].join("\n");
  return `${header}\n\n${input.prompt}`;
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
