import type { DesignIR } from "./schema";

export const HANDOFF_INSTRUCTIONS =
  "This is a PT Design wireframe prototype, not production UI. Implement using real components in the target project (prefer shadcn/ui if the repo already uses it). Use componentType, props, frames, and relative bbox/containment for structure and hierarchy — do not pixel-chase absolute coordinates with absolute CSS. Do not invent major sections absent from the IR. Visual wireframes are approximate. Prefer Design IR over screenshots; image is optional aid only.";

export const LIVE_COLLAB_INSTRUCTIONS =
  "The live board is the collaboration room, not a separate .ptdesign.json copy. Join PT_DESIGN_COLLAB_ROOM=id,key from collab before mutating. Pull the live scene first, then publish. The user should see your cursor as Agent. Do not overwrite the room from a stale file.";

export type HandoffPayload = {
  version: 1;
  prompt?: string;
  ir: DesignIR;
  catalogVersion: string;
  sceneSubset?: unknown;
  image?: { mime: string; base64: string } | null;
  instructions: string;
  collab?: { roomId: string; roomKey: string; shareUrl: string };
};

export function buildHandoffPayload(input: {
  ir: DesignIR;
  prompt?: string;
  includeImage?: boolean;
  collab?: { roomId: string; roomKey: string; shareUrl: string };
}): HandoffPayload {
  return {
    version: 1,
    prompt: input.prompt,
    ir: input.ir,
    catalogVersion: input.ir.catalogVersion,
    image: input.includeImage ? null : undefined,
    instructions: input.collab ? `${HANDOFF_INSTRUCTIONS} ${LIVE_COLLAB_INSTRUCTIONS}` : HANDOFF_INSTRUCTIONS,
    collab: input.collab,
  };
}
