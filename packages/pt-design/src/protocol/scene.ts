import type { HandleElement, PtDocument, PtNode, PtNodePayload } from "./schema";

function payloadFromNode(node: PtNode): PtNodePayload {
  const payload: PtNodePayload = {
    id: node.id,
    type: node.type,
    props: node.props,
  };
  if (node.value !== undefined) payload.value = node.value;
  if (node.checked !== undefined) payload.checked = node.checked;
  if (node.options !== undefined) payload.options = node.options;
  if (node.events !== undefined) payload.events = node.events;
  if (node.children !== undefined) payload.children = node.children;
  return payload;
}

function nodeFromHandle(el: HandleElement, pt: PtNodePayload): PtNode {
  const node: PtNode = {
    id: pt.id,
    type: pt.type,
    props: pt.props ?? {},
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    rotation: (el.angle * 180) / Math.PI,
  };
  if (pt.value !== undefined) node.value = pt.value;
  if (pt.checked !== undefined) node.checked = pt.checked;
  if (pt.options !== undefined) node.options = pt.options;
  if (pt.events !== undefined) node.events = pt.events;
  if (pt.children !== undefined) node.children = pt.children;
  return node;
}

export function extractDocument(elements: readonly HandleElement[]): PtDocument {
  const nodes: PtNode[] = [];
  for (const el of elements) {
    if (el.isDeleted) continue;
    const pt = el.customData?.pt;
    if (!pt) continue;
    nodes.push(nodeFromHandle(el, pt));
  }
  return { version: "ptx/1", pages: [{ id: "page", nodes }] };
}

function newHandle(node: PtNode): HandleElement {
  return {
    id: `el_${node.id}`,
    type: "rectangle",
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    angle: (node.rotation * Math.PI) / 180,
    backgroundColor: "transparent",
    strokeWidth: 1,
    customData: { pt: payloadFromNode(node) },
  };
}

export function projectDocument(doc: PtDocument, existing: readonly HandleElement[]): HandleElement[] {
  const byPtId = new Map<string, HandleElement>();
  for (const el of existing) {
    if (el.isDeleted) continue;
    const ptId = el.customData?.pt?.id;
    if (ptId === undefined) continue;
    if (!byPtId.has(ptId)) byPtId.set(ptId, el);
  }

  const handles: HandleElement[] = [];
  for (const node of doc.pages[0]?.nodes ?? []) {
    const found = byPtId.get(node.id);
    if (found) {
      handles.push({
        ...found,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        angle: (node.rotation * Math.PI) / 180,
        customData: { ...found.customData, pt: payloadFromNode(node) },
      });
    } else {
      handles.push(newHandle(node));
    }
  }

  const freehand = existing.filter((el) => el.customData?.pt == null);
  return [...handles, ...freehand];
}
