import { getComponentTemplate } from "../catalog/registry";
import type { PtScene } from "../core/types";
import type { DesignIR, DesignNode } from "./schema";
import { DESIGN_IR_VERSION } from "./schema";
import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";

function flattenNodes(ir: DesignIR): { node: DesignNode; frameId: string | null }[] {
  const out: { node: DesignNode; frameId: string | null }[] = [];
  for (const frame of ir.frames) {
    for (const node of frame.nodes) out.push({ node, frameId: frame.id });
  }
  for (const node of ir.freeNodes) out.push({ node, frameId: null });
  return out;
}

function isPtRoot(el: { customData?: { pt?: { componentType?: string } } }): boolean {
  return Boolean(el.customData?.pt?.componentType);
}

export function applyDesignIR(
  scene: PtScene,
  ir: DesignIR,
  mode: "merge" | "replace",
): PtScene {
  if (ir.version !== DESIGN_IR_VERSION) {
    throw new PtDesignError(PT_ERROR_CODES.INVALID_FILE, `Unsupported IR version: ${ir.version}`);
  }

  const incoming = flattenNodes(ir);
  const existingById = new Map<string, string>();
  for (const el of scene.elements) {
    const id = el.customData?.pt?.instanceId;
    const type = el.customData?.pt?.componentType;
    if (id && type) existingById.set(id, el.id);
  }

  let elements = scene.elements.slice();

  if (mode === "replace") {
    elements = elements.filter((el) => el.isDeleted || !isPtRoot(el));
  }

  for (const { node, frameId } of incoming) {
    const built = getComponentTemplate(node.componentType, {
      x: node.bbox.x,
      y: node.bbox.y,
      variant: node.variant,
      size: node.size,
      props: node.props,
      instanceId: node.instanceId,
    });
    const stamped = built.elements.map((el) => ({
      ...el,
      frameId: frameId ?? el.frameId,
    }));

    if (mode === "merge" && existingById.has(node.instanceId)) {
      const oldRootId = existingById.get(node.instanceId);
      elements = elements.filter((el) => {
        const inst = el.customData?.pt?.instanceId;
        return inst !== node.instanceId && el.id !== oldRootId;
      });
    }
    elements.push(...stamped);
  }

  return { ...scene, elements };
}
