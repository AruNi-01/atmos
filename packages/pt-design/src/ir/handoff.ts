import type { DesignIR } from "./schema";

export const HANDOFF_INSTRUCTIONS =
  "This is a PT Design wireframe prototype, not production UI. Implement using real components in the target project (prefer shadcn/ui if the repo already uses it). Use componentType, props, frames, and relative bbox/containment for structure and hierarchy — do not pixel-chase absolute coordinates with absolute CSS. Do not invent major sections absent from the IR. Visual wireframes are approximate. Prefer Design IR over screenshots; image is optional aid only.";

export const LIVE_BOARD_INSTRUCTIONS =
  "The live board is the open Prototype Design tab, not a .ptdesign.json file. POST the invoke URL with client_id. Read ~/.atmos/skills/.system/atmos-pt-design-agent/SKILL.md and follow it. Do not start MCP, do not join a collaboration room, and do not write a separate file.";

export type HandoffPayload = {
  version: 1;
  prompt?: string;
  ir: DesignIR;
  catalogVersion: string;
  sceneSubset?: unknown;
  image?: { mime: string; base64: string } | null;
  instructions: string;
  clientId?: string;
  invokeUrl?: string;
  collab?: { roomId: string; roomKey: string; shareUrl: string };
};

export function buildHandoffPayload(input: {
  ir: DesignIR;
  prompt?: string;
  includeImage?: boolean;
  clientId?: string;
  invokeUrl?: string;
  collab?: { roomId: string; roomKey: string; shareUrl: string };
}): HandoffPayload {
  const live = Boolean(input.clientId || input.invokeUrl);
  return {
    version: 1,
    prompt: input.prompt,
    ir: input.ir,
    catalogVersion: input.ir.catalogVersion,
    image: input.includeImage ? null : undefined,
    instructions: live ? `${HANDOFF_INSTRUCTIONS} ${LIVE_BOARD_INSTRUCTIONS}` : HANDOFF_INSTRUCTIONS,
    clientId: input.clientId,
    invokeUrl: input.invokeUrl,
    collab: input.collab,
  };
}
