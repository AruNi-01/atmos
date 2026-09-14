import { REQUIRED_BLOCKS, SHADCN_BASIC_IDS } from "../catalog/shadcn-list";
import { PtDesignError } from "../protocol";
import type { PtNode, PtNodeType } from "../protocol";
import { BLOCK_MODULES } from "./groups/blocks";
import { DISPLAY_MODULES } from "./groups/display";
import { FORM_MODULES } from "./groups/form";
import { OVERLAY_MODULES } from "./groups/overlay";
import type { PtComponentModule } from "./types";

export const PT_COMPONENT_MODULES: readonly PtComponentModule[] = [
  ...FORM_MODULES,
  ...OVERLAY_MODULES,
  ...DISPLAY_MODULES,
  ...BLOCK_MODULES,
];

const BY_TYPE = new Map<string, PtComponentModule>();

for (const mod of PT_COMPONENT_MODULES) {
  if (BY_TYPE.has(mod.type)) {
    throw new Error(`Duplicate component type: ${mod.type}`);
  }
  BY_TYPE.set(mod.type, mod);
}

export function getComponentModule(type: string): PtComponentModule {
  const mod = BY_TYPE.get(type);
  if (!mod) {
    throw new PtDesignError("unknown_type", `Unknown component type: ${type}`);
  }
  return mod;
}

export function listComponentTypes(): PtNodeType[] {
  return [...SHADCN_BASIC_IDS, ...REQUIRED_BLOCKS];
}

export function defaultNodeFor(type: string, id: string): PtNode {
  return getComponentModule(type).defaultNode(id);
}
