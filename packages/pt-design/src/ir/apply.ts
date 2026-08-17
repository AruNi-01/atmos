import { frameEl } from "../catalog/primitives";
import { getComponentTemplate } from "../catalog/registry";
import type { PtElement, PtScene } from "../core/types";
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

function isPtSemantic(el: PtElement): boolean {
  return Boolean(el.customData?.pt);
}

function upsertFrames(elements: PtElement[], ir: DesignIR): PtElement[] {
  const next = elements.slice();
  const indexById = new Map<string, number>();
  next.forEach((el, index) => {
    if (el.type === "frame" && !el.isDeleted) indexById.set(el.id, index);
  });

  for (const frame of ir.frames) {
    const existingIndex = indexById.get(frame.id);
    if (existingIndex !== undefined) {
      const existing = next[existingIndex]!;
      next[existingIndex] = {
        ...existing,
        name: frame.name,
        x: frame.bbox.x,
        y: frame.bbox.y,
        width: frame.bbox.w,
        height: frame.bbox.h,
        isDeleted: false,
      };
      continue;
    }
    next.push(
      frameEl(frame.bbox.x, frame.bbox.y, frame.bbox.w, frame.bbox.h, frame.name, {
        id: frame.id,
      }),
    );
  }
  return next;
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
  let elements = scene.elements.slice();

  if (mode === "replace") {
    // Roots carry componentType; children only carry instanceId. Drop every PT
    // semantic piece so replace does not leave leftover geometry.
    elements = elements.filter((el) => el.isDeleted || !isPtSemantic(el));
  }

  elements = upsertFrames(elements, ir);

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
      frameId: frameId ?? el.frameId ?? null,
    }));

    if (mode === "merge") {
      elements = elements.filter((el) => el.customData?.pt?.instanceId !== node.instanceId);
    }
    elements.push(...stamped);
  }

  return { ...scene, elements };
}
