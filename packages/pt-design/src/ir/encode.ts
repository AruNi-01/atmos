import { CATALOG_VERSION } from "../catalog/shadcn-list";
import type { PtElement, PtMeta, PtScene } from "../core/types";
import { DESIGN_IR_VERSION, type DesignFrame, type DesignIR, type DesignNode } from "./schema";

function rootMeta(el: PtElement): PtMeta | null {
  const pt = el.customData?.pt;
  if (!pt?.instanceId || !pt.componentType || pt.schemaVersion !== 1) return null;
  return {
    schemaVersion: 1,
    instanceId: pt.instanceId,
    componentType: pt.componentType,
    catalogVersion: pt.catalogVersion ?? CATALOG_VERSION,
    variant: pt.variant,
    size: pt.size,
    props: pt.props ?? {},
  };
}

export function encodeDesignIR(scene: PtScene, options?: { title?: string }): DesignIR {
  const frames: DesignFrame[] = [];
  const frameEls = scene.elements.filter((el) => el.type === "frame" && !el.isDeleted);
  const used = new Set<string>();

  for (const frame of frameEls) {
    const nodes: DesignNode[] = [];
    for (const el of scene.elements) {
      if (el.isDeleted || el.frameId !== frame.id) continue;
      const meta = rootMeta(el);
      if (!meta) continue;
      used.add(meta.instanceId);
      nodes.push({
        instanceId: meta.instanceId,
        componentType: meta.componentType,
        variant: meta.variant,
        size: meta.size,
        props: meta.props,
        bbox: { x: el.x, y: el.y, w: el.width, h: el.height },
      });
    }
    frames.push({
      id: frame.id,
      name: frame.name ?? "Frame",
      bbox: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      nodes,
    });
  }

  const freeNodes: DesignNode[] = [];
  for (const el of scene.elements) {
    if (el.isDeleted) continue;
    const meta = rootMeta(el);
    if (!meta || used.has(meta.instanceId)) continue;
    freeNodes.push({
      instanceId: meta.instanceId,
      componentType: meta.componentType,
      variant: meta.variant,
      size: meta.size,
      props: meta.props,
      bbox: { x: el.x, y: el.y, w: el.width, h: el.height },
    });
  }

  return {
    version: DESIGN_IR_VERSION,
    catalogVersion: CATALOG_VERSION,
    meta: {
      title: options?.title,
      exportedAt: new Date().toISOString(),
      source: "pt-design",
    },
    frames,
    freeNodes,
  };
}

export function normalizeIR(ir: DesignIR): DesignIR {
  const sortNodes = (nodes: DesignNode[]) =>
    [...nodes]
      .map((node) => ({
        ...node,
        instanceId: "",
        bbox: {
          x: Math.round(node.bbox.x),
          y: Math.round(node.bbox.y),
          w: Math.round(node.bbox.w),
          h: Math.round(node.bbox.h),
        },
      }))
      .sort((a, b) => {
        const ak = `${a.componentType}|${String(a.props.label ?? a.props.placeholder ?? "")}|${a.bbox.x}|${a.bbox.y}`;
        const bk = `${b.componentType}|${String(b.props.label ?? b.props.placeholder ?? "")}|${b.bbox.x}|${b.bbox.y}`;
        return ak.localeCompare(bk);
      });

  return {
    ...ir,
    meta: { ...ir.meta, exportedAt: "" },
    frames: [...ir.frames]
      .map((frame) => ({
        ...frame,
        id: "",
        bbox: {
          x: Math.round(frame.bbox.x),
          y: Math.round(frame.bbox.y),
          w: Math.round(frame.bbox.w),
          h: Math.round(frame.bbox.h),
        },
        nodes: sortNodes(frame.nodes),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    freeNodes: sortNodes(ir.freeNodes),
  };
}
