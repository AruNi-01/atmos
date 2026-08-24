import type { PtDesignSession } from "../core/session";
import { PT_ERROR_CODES, PtDesignError } from "./errors";
import type { BBox } from "../core/types";

export type LayoutAlign = "start" | "center" | "end";

function nodesById(session: PtDesignSession) {
  const ir = session.getIR();
  const nodes = [...ir.frames.flatMap((frame) => frame.nodes), ...ir.freeNodes];
  return new Map(nodes.map((node) => [node.instanceId, node]));
}

function requireNodes(session: PtDesignSession, instanceIds: string[]) {
  if (instanceIds.length === 0) {
    throw new PtDesignError(PT_ERROR_CODES.USAGE, "instanceIds required");
  }
  const byId = nodesById(session);
  const items = instanceIds.map((id) => {
    const node = byId.get(id);
    if (!node) throw new PtDesignError(PT_ERROR_CODES.NOT_FOUND, `Instance not found: ${id}`);
    return node;
  });
  return items;
}

function applyBBoxes(session: PtDesignSession, next: Array<{ instanceId: string; bbox: BBox }>) {
  for (const item of next) {
    session.dispatch({
      type: "update",
      instanceId: item.instanceId,
      bbox: { x: item.bbox.x, y: item.bbox.y },
    });
  }
  return { instanceIds: next.map((item) => item.instanceId) };
}

export function layoutRow(
  session: PtDesignSession,
  instanceIds: string[],
  gap = 16,
  align: LayoutAlign = "start",
) {
  const items = requireNodes(session, instanceIds);
  const origin = items[0]!.bbox;
  const maxH = Math.max(...items.map((item) => item.bbox.h));
  let x = origin.x;
  const next = items.map((item) => {
    let y = origin.y;
    if (align === "center") y = origin.y + (maxH - item.bbox.h) / 2;
    if (align === "end") y = origin.y + (maxH - item.bbox.h);
    const bbox = { x, y, w: item.bbox.w, h: item.bbox.h };
    x += item.bbox.w + gap;
    return { instanceId: item.instanceId, bbox };
  });
  return applyBBoxes(session, next);
}

export function layoutColumn(
  session: PtDesignSession,
  instanceIds: string[],
  gap = 16,
  align: LayoutAlign = "start",
) {
  const items = requireNodes(session, instanceIds);
  const origin = items[0]!.bbox;
  const maxW = Math.max(...items.map((item) => item.bbox.w));
  let y = origin.y;
  const next = items.map((item) => {
    let x = origin.x;
    if (align === "center") x = origin.x + (maxW - item.bbox.w) / 2;
    if (align === "end") x = origin.x + (maxW - item.bbox.w);
    const bbox = { x, y, w: item.bbox.w, h: item.bbox.h };
    y += item.bbox.h + gap;
    return { instanceId: item.instanceId, bbox };
  });
  return applyBBoxes(session, next);
}

export function layoutGrid(
  session: PtDesignSession,
  instanceIds: string[],
  columns: number,
  gap = 24,
  rowGap?: number,
) {
  if (!Number.isFinite(columns) || columns < 1) {
    throw new PtDesignError(PT_ERROR_CODES.USAGE, "columns must be >= 1");
  }
  const items = requireNodes(session, instanceIds);
  const origin = items[0]!.bbox;
  const colW = Math.max(...items.map((item) => item.bbox.w));
  const rowH = Math.max(...items.map((item) => item.bbox.h));
  const vGap = rowGap ?? gap;
  const next = items.map((item, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    return {
      instanceId: item.instanceId,
      bbox: {
        x: origin.x + col * (colW + gap),
        y: origin.y + row * (rowH + vGap),
        w: item.bbox.w,
        h: item.bbox.h,
      },
    };
  });
  return applyBBoxes(session, next);
}
