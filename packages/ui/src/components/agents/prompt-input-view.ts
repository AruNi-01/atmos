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
  contextLabel?: string;
  thinkingLabel?: string;
  agentLabel?: string;
}): string {
  const model = input.modelLabel?.trim() ?? "";
  const context = input.contextLabel?.trim() ?? "";
  const thinking = input.thinkingLabel?.trim() ?? "";
  const agent = input.agentLabel?.trim() ?? "";
  const withContext = modelLabelWithContext(model, context);
  if (withContext && thinking) return `${withContext} · ${thinking}`;
  return withContext || thinking || agent;
}

/** Only 1M is shown on the model name; the default window stays implicit. */
export function contextModelSuffix(label?: string, value?: string): string {
  const token = (value ?? "").trim().toLowerCase().replace(/[-_]/g, "");
  const text = (label ?? "").trim();
  if (token === "1m" || text.toUpperCase() === "1M") return text || "1M";
  return "";
}

export function modelLabelWithContext(modelLabel: string, contextSuffix: string): string {
  const model = modelLabel.trim();
  const suffix = contextSuffix.trim();
  if (!model || !suffix) return model;
  if (model.endsWith(` ${suffix}`) || /\s1m$/i.test(model)) return model;
  return `${model} ${suffix}`;
}

/** First letter only; leave mixed-case provider names (OpenAI) unchanged. */
export function capitalizeLeading(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** `GPT-5 / Openai` — provider is omitted when empty. */
export function formatModelProviderLabel(
  model: string,
  provider?: string | null,
): string {
  const name = model.trim();
  const group = capitalizeLeading(provider ?? "");
  if (!name) return group;
  if (!group) return name;
  return `${name} / ${group}`;
}

/** One chip: `Low · Fast` when Fast is on, otherwise `Low` or `Fast`. */
export function modelEffortTriggerLabel(input: {
  thinkingLabel?: string;
  fastAvailable?: boolean;
  fastEnabled?: boolean;
  fastLabel?: string;
}): string {
  const thinking = input.thinkingLabel?.trim() ?? "";
  const fast = input.fastLabel?.trim() ?? "";
  if (thinking && input.fastEnabled && fast) return `${thinking} · ${fast}`;
  if (thinking) return thinking;
  if (input.fastAvailable) return fast;
  return "";
}
