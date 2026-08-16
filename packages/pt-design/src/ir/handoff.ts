import type { DesignIR } from "./schema";

export const HANDOFF_INSTRUCTIONS =
  "This is a PT Design wireframe prototype, not production UI. Implement using real components in the target project (prefer shadcn/ui if the repo already uses it). Use componentType, props, frames, and relative bbox/containment for structure and hierarchy — do not pixel-chase absolute coordinates with absolute CSS. Do not invent major sections absent from the IR. Visual wireframes are approximate. Prefer Design IR over screenshots; image is optional aid only.";

export type HandoffPayload = {
  version: 1;
  prompt?: string;
  ir: DesignIR;
  catalogVersion: string;
  sceneSubset?: unknown;
  image?: { mime: string; base64: string } | null;
  instructions: string;
};

export function buildHandoffPayload(input: {
  ir: DesignIR;
  prompt?: string;
  includeImage?: boolean;
}): HandoffPayload {
  return {
    version: 1,
    prompt: input.prompt,
    ir: input.ir,
    catalogVersion: input.ir.catalogVersion,
    image: input.includeImage ? null : undefined,
    instructions: HANDOFF_INSTRUCTIONS,
  };
}
