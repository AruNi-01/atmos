export type AgentConfigFlyout = "agent" | "model";

/** Secondary menus stay closed until Agent or Model is hovered. */
export function initialAgentConfigFlyout(_input?: {
  skipAgentList: boolean;
  agent?: string;
}): AgentConfigFlyout | null {
  return null;
}

const FLYOUT_WIDTH_PX = 16.5 * 16;
const FLYOUT_GAP_PX = 6;
const FLYOUT_VIEWPORT_PAD_PX = 8;

export function agentConfigFlyoutSide(input: {
  menuRight: number;
  viewportWidth: number;
  flyoutWidth?: number;
}): "right" | "left" {
  const flyoutWidth = input.flyoutWidth ?? FLYOUT_WIDTH_PX;
  const needed = flyoutWidth + FLYOUT_GAP_PX + FLYOUT_VIEWPORT_PAD_PX;
  return input.menuRight + needed <= input.viewportWidth ? "right" : "left";
}

export function agentConfigFlyoutOffsetTop(input: {
  menuTop: number;
  flyoutHeight: number;
  viewportHeight: number;
  padding?: number;
}): number {
  const padding = input.padding ?? FLYOUT_VIEWPORT_PAD_PX;
  if (input.menuTop + input.flyoutHeight <= input.viewportHeight - padding) return 0;
  const shiftedTop = input.viewportHeight - padding - input.flyoutHeight;
  return Math.max(padding, shiftedTop) - input.menuTop;
}

export function agentConfigTriggerText(input: {
  modelLabel?: string;
  thinkingLabel?: string;
  agentLabel?: string;
}): string {
  const model = input.modelLabel?.trim() ?? "";
  const thinking = input.thinkingLabel?.trim() ?? "";
  const agent = input.agentLabel?.trim() ?? "";
  if (model && thinking) return `${model} · ${thinking}`;
  return model || thinking || agent;
}
