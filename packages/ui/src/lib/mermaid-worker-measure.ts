const MEASURE_FONT = '16px "trebuchet ms", verdana, arial, sans-serif';
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

const SKIP_TAGS = new Set(["style", "script", "defs", "title", "desc", "clippath", "mask"]);
const CONTAINER_TAGS = new Set([
  "g",
  "svg",
  "a",
  "marker",
  "symbol",
  "switch",
  "div",
  "span",
  "foreignobject",
]);

export type MermaidMeasureNode = {
  tagName?: string;
  nodeName?: string;
  nodeType?: number;
  data?: string;
  textContent?: string | null;
  childNodes?: ArrayLike<MermaidMeasureNode | null | undefined>;
  children?: ArrayLike<MermaidMeasureNode | null | undefined>;
  getAttribute?: (name: string) => string | null;
};

export type MermaidMeasureBox = {
  x: number;
  y: number;
  width: number;
  height: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
  toJSON: () => MermaidMeasureBox;
};

function tagNameOf(node: MermaidMeasureNode): string {
  return String(node.tagName ?? node.nodeName ?? "").toLowerCase();
}

function attrNumber(node: MermaidMeasureNode, name: string): number {
  const raw = node.getAttribute?.(name);
  const value = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(value) ? value : 0;
}

function ownCharacterData(node: MermaidMeasureNode): string {
  const kids = node.childNodes;
  if (!kids) return "";
  let text = "";
  for (let i = 0; i < kids.length; i += 1) {
    const child = kids[i];
    if (child && child.nodeType === TEXT_NODE) text += child.data ?? "";
  }
  return text;
}

export function measureMermaidTextWidth(text: string): number {
  const value = text ?? "";
  try {
    const holder = measureMermaidTextWidth as { canvas?: OffscreenCanvas };
    holder.canvas ??= new OffscreenCanvas(1, 1);
    const context = holder.canvas.getContext("2d");
    if (context) {
      context.font = MEASURE_FONT;
      const width = context.measureText(value).width;
      if (Number.isFinite(width) && width > 0) return width;
    }
  } catch {
    // Worker environments without OffscreenCanvas fall back to an estimate.
  }
  return Math.max(1, Array.from(value).length) * 7.2;
}

export function box(width: number, height: number, x = 0, y = 0): MermaidMeasureBox {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const result: MermaidMeasureBox = {
    x,
    y,
    width: w,
    height: h,
    top: y,
    left: x,
    bottom: y + h,
    right: x + w,
    toJSON() {
      return result;
    },
  };
  return result;
}

function isElementNode(node: MermaidMeasureNode): boolean {
  if (node.nodeType != null) return node.nodeType === ELEMENT_NODE;
  const name = String(node.tagName ?? node.nodeName ?? "").toLowerCase();
  return Boolean(name) && name !== "#text" && name !== "#comment";
}

function childElements(node: MermaidMeasureNode): MermaidMeasureNode[] {
  const fromChildren = node.children;
  if (fromChildren && fromChildren.length > 0) {
    const items: MermaidMeasureNode[] = [];
    for (let i = 0; i < fromChildren.length; i += 1) {
      const child = fromChildren[i];
      if (child && isElementNode(child)) items.push(child);
    }
    return items;
  }
  const kids = node.childNodes;
  if (!kids) return [];
  const items: MermaidMeasureNode[] = [];
  for (let i = 0; i < kids.length; i += 1) {
    const child = kids[i];
    if (child && isElementNode(child)) items.push(child);
  }
  return items;
}

function unionBoxes(nodes: MermaidMeasureNode[], seen: Set<MermaidMeasureNode>): MermaidMeasureBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of nodes) {
    const next = mermaidShimBBox(child, seen);
    if (next.width <= 0 && next.height <= 0) continue;
    minX = Math.min(minX, next.x);
    minY = Math.min(minY, next.y);
    maxX = Math.max(maxX, next.x + next.width);
    maxY = Math.max(maxY, next.y + next.height);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return box(0, 0);
  return box(maxX - minX, maxY - minY, minX, minY);
}

export function mermaidShimTextLength(node: MermaidMeasureNode): number {
  const tag = tagNameOf(node);
  if (SKIP_TAGS.has(tag) || CONTAINER_TAGS.has(tag)) return 0;
  if (tag === "text" || tag === "tspan") {
    const own = ownCharacterData(node);
    return measureMermaidTextWidth(own || (node.textContent ?? ""));
  }
  return 0;
}

export function mermaidShimBBox(
  node: MermaidMeasureNode,
  seen: Set<MermaidMeasureNode> = new Set(),
): MermaidMeasureBox {
  if (seen.has(node)) return box(0, 0);
  seen.add(node);
  const tag = tagNameOf(node);
  if (!tag || SKIP_TAGS.has(tag)) return box(0, 0);

  if (tag === "text" || tag === "tspan") {
    const content = ownCharacterData(node);
    if (content) {
      return box(measureMermaidTextWidth(content), 16, attrNumber(node, "x"), attrNumber(node, "y") - 12);
    }
    return unionBoxes(childElements(node), seen);
  }

  if (tag === "rect" || tag === "image" || tag === "use") {
    const width = attrNumber(node, "width");
    const height = attrNumber(node, "height");
    if (width > 0 || height > 0) {
      return box(width, height || 16, attrNumber(node, "x"), attrNumber(node, "y"));
    }
  }

  if (tag === "circle") {
    const r = attrNumber(node, "r");
    return box(r * 2, r * 2, attrNumber(node, "cx") - r, attrNumber(node, "cy") - r);
  }

  if (tag === "ellipse") {
    const rx = attrNumber(node, "rx");
    const ry = attrNumber(node, "ry");
    return box(rx * 2, ry * 2, attrNumber(node, "cx") - rx, attrNumber(node, "cy") - ry);
  }

  if (tag === "line") {
    const x1 = attrNumber(node, "x1");
    const y1 = attrNumber(node, "y1");
    const x2 = attrNumber(node, "x2");
    const y2 = attrNumber(node, "y2");
    return box(Math.abs(x2 - x1), Math.abs(y2 - y1), Math.min(x1, x2), Math.min(y1, y2));
  }

  if (CONTAINER_TAGS.has(tag) || tag === "foreignobject") {
    const width = attrNumber(node, "width");
    const height = attrNumber(node, "height");
    if (width > 0 && height > 0) {
      return box(width, height, attrNumber(node, "x"), attrNumber(node, "y"));
    }
    return unionBoxes(childElements(node), seen);
  }

  return box(0, 0);
}
