import { estimateTextWidth } from "../catalog/primitives";
import type { DesignIR, DesignNode } from "../ir/schema";
import type { BBox } from "../core/types";

export type LintIssue = {
  code: string;
  message: string;
  instanceIds?: string[];
  frameId?: string;
};

function intersects(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function contained(inner: BBox, outer: BBox, pad = 0): boolean {
  return (
    inner.x >= outer.x - pad &&
    inner.y >= outer.y - pad &&
    inner.x + inner.w <= outer.x + outer.w + pad &&
    inner.y + inner.h <= outer.y + outer.h + pad
  );
}

function textClip(node: DesignNode): boolean {
  const title = typeof node.props.title === "string" ? node.props.title : "";
  const label = typeof node.props.label === "string" ? node.props.label : "";
  const sample = title || label;
  if (!sample) return false;
  return estimateTextWidth(sample) + 24 > node.bbox.w;
}

export function lintDesignIR(ir: DesignIR, frameId?: string): { issues: LintIssue[]; count: number } {
  const issues: LintIssue[] = [];
  const frames = frameId ? ir.frames.filter((f) => f.id === frameId || f.name === frameId) : ir.frames;

  if (!frameId) {
    for (const node of ir.freeNodes) {
      issues.push({
        code: "FREE_NODE",
        message: `${node.componentType} ${node.instanceId} is not in a frame`,
        instanceIds: [node.instanceId],
      });
      if (textClip(node)) {
        issues.push({
          code: "TEXT_CLIP",
          message: `${node.componentType} ${node.instanceId} text is wider than its box`,
          instanceIds: [node.instanceId],
        });
      }
    }
    for (let i = 0; i < ir.freeNodes.length; i++) {
      for (let j = i + 1; j < ir.freeNodes.length; j++) {
        const a = ir.freeNodes[i]!;
        const b = ir.freeNodes[j]!;
        if (intersects(a.bbox, b.bbox)) {
          issues.push({
            code: "OVERLAP",
            message: `${a.componentType} overlaps ${b.componentType}`,
            instanceIds: [a.instanceId, b.instanceId],
          });
        }
      }
    }
  }

  for (const frame of frames) {
    if (frame.nodes.length === 0) {
      issues.push({
        code: "EMPTY_FRAME",
        message: `Frame ${frame.name} has no instances`,
        frameId: frame.id,
      });
    }
    for (const node of frame.nodes) {
      if (!contained(node.bbox, frame.bbox)) {
        issues.push({
          code: "OUTSIDE_FRAME",
          message: `${node.componentType} ${node.instanceId} sits outside ${frame.name}`,
          instanceIds: [node.instanceId],
          frameId: frame.id,
        });
      }
      if (textClip(node)) {
        issues.push({
          code: "TEXT_CLIP",
          message: `${node.componentType} ${node.instanceId} text is wider than its box`,
          instanceIds: [node.instanceId],
          frameId: frame.id,
        });
      }
    }
    for (let i = 0; i < frame.nodes.length; i++) {
      for (let j = i + 1; j < frame.nodes.length; j++) {
        const a = frame.nodes[i]!;
        const b = frame.nodes[j]!;
        if (intersects(a.bbox, b.bbox)) {
          issues.push({
            code: "OVERLAP",
            message: `${a.componentType} overlaps ${b.componentType}`,
            instanceIds: [a.instanceId, b.instanceId],
            frameId: frame.id,
          });
        }
      }
    }
  }

  return { issues, count: issues.length };
}
