const MEASURE_FONT =
  '16px "trebuchet ms", verdana, arial, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;
const LINE_HEIGHT = 16;
const TEXT_ASCENT = 12;
const LATIN_CHAR_WIDTH = 8.4;
const WIDE_CHAR_WIDTH = 16;
const SPACE_CHAR_WIDTH = 4.5;

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
  if (!raw || /%/.test(raw)) return 0;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : 0;
}

function attrLength(node: MermaidMeasureNode, name: string): number {
  const raw = node.getAttribute?.(name);
  if (!raw || /%/.test(raw)) return 0;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  if (/em/i.test(raw)) return value * LINE_HEIGHT;
  return value;
}

function isWideChar(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    code === 0x2329 ||
    code === 0x232a ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe10 && code <= 0xfe19) ||
    (code >= 0xfe30 && code <= 0xfe6f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

function estimateMermaidTextWidth(text: string): number {
  let width = 0;
  let wide = false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code == null || code < 32) continue;
    if (isWideChar(code)) {
      width += WIDE_CHAR_WIDTH;
      wide = true;
    } else if (code === 32) {
      width += SPACE_CHAR_WIDTH;
    } else {
      width += LATIN_CHAR_WIDTH;
    }
  }
  if (width > 0) return width;
  return wide || text.length > 0 ? 1 : 0;
}

type SvgMatrix = { a: number; b: number; c: number; d: number; e: number; f: number };

const IDENTITY: SvgMatrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function multiplyMatrix(left: SvgMatrix, right: SvgMatrix): SvgMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function parseTransformArgs(value: string): number[] {
  const args: number[] = [];
  for (const part of value.trim().split(/[\s,]+/)) {
    if (!part) continue;
    const next = Number.parseFloat(part);
    if (Number.isFinite(next)) args.push(next);
  }
  return args;
}

function transformFromFunction(name: string, args: number[]): SvgMatrix | null {
  switch (name) {
    case "translate":
      return { ...IDENTITY, e: args[0] ?? 0, f: args[1] ?? 0 };
    case "scale":
      return { ...IDENTITY, a: args[0] ?? 1, d: args[1] ?? args[0] ?? 1 };
    case "matrix":
      if (args.length < 6) return null;
      return { a: args[0], b: args[1], c: args[2], d: args[3], e: args[4], f: args[5] };
    case "rotate": {
      const rad = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const rotation = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
      if (args.length < 3) return rotation;
      return multiplyMatrix(
        multiplyMatrix({ ...IDENTITY, e: args[1], f: args[2] }, rotation),
        { ...IDENTITY, e: -args[1], f: -args[2] },
      );
    }
    default:
      return null;
  }
}

function parseSvgTransform(value: string | null | undefined): SvgMatrix {
  if (!value) return IDENTITY;
  let matrix = IDENTITY;
  const matches = value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g);
  for (const match of matches) {
    const next = transformFromFunction(match[1].toLowerCase(), parseTransformArgs(match[2]));
    if (next) matrix = multiplyMatrix(matrix, next);
  }
  return matrix;
}

function applyTransformToBox(bounds: MermaidMeasureBox, matrix: SvgMatrix): MermaidMeasureBox {
  if (matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1 && matrix.e === 0 && matrix.f === 0) {
    return bounds;
  }
  if (matrix.a === 1 && matrix.b === 0 && matrix.c === 0 && matrix.d === 1) {
    return box(bounds.width, bounds.height, bounds.x + matrix.e, bounds.y + matrix.f);
  }
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of corners) {
    const tx = matrix.a * x + matrix.c * y + matrix.e;
    const ty = matrix.b * x + matrix.d * y + matrix.f;
    minX = Math.min(minX, tx);
    minY = Math.min(minY, ty);
    maxX = Math.max(maxX, tx);
    maxY = Math.max(maxY, ty);
  }
  return box(maxX - minX, maxY - minY, minX, minY);
}

function numbersBox(values: number[]): MermaidMeasureBox {
  if (values.length < 2) return box(0, 0);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < values.length; i += 2) {
    const x = values[i];
    const y = values[i + 1];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return box(0, 0);
  return box(Math.max(0, maxX - minX), Math.max(0, maxY - minY), minX, minY);
}

function pathDataBox(data: string): MermaidMeasureBox {
  return numbersBox(parseTransformArgs(data.replace(/[a-zA-Z]/g, " ")));
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
  const estimated = estimateMermaidTextWidth(value);
  try {
    const holder = measureMermaidTextWidth as { canvas?: OffscreenCanvas };
    holder.canvas ??= new OffscreenCanvas(1, 1);
    const context = holder.canvas.getContext("2d");
    if (context) {
      context.font = MEASURE_FONT;
      const width = context.measureText(value).width;
      if (Number.isFinite(width) && width > 0) {
        if (estimated > 0 && width < estimated * 0.75) return estimated;
        return width;
      }
    }
  } catch {
    // Worker environments without OffscreenCanvas fall back to an estimate.
  }
  return estimated || (value ? 1 : 0);
}

function textAnchorOf(node: MermaidMeasureNode): "start" | "middle" | "end" {
  const value = node.getAttribute?.("text-anchor");
  if (value === "middle" || value === "end" || value === "start") return value;
  return "start";
}

function anchoredTextBox(
  width: number,
  height: number,
  x: number,
  baselineY: number,
  anchor: "start" | "middle" | "end",
): MermaidMeasureBox {
  let left = x;
  if (anchor === "middle") left = x - width / 2;
  else if (anchor === "end") left = x - width;
  return box(width, height, left, baselineY - TEXT_ASCENT);
}

function isTextRowTspan(node: MermaidMeasureNode): boolean {
  if (tagNameOf(node) !== "tspan") return false;
  const cls = node.getAttribute?.("class") ?? "";
  if (/\brow\b/.test(cls)) return true;
  return node.getAttribute?.("x") != null;
}

function layoutTextBox(node: MermaidMeasureNode, seen: Set<MermaidMeasureNode>): MermaidMeasureBox {
  const kids = childElements(node).filter((child) => {
    const tag = tagNameOf(child);
    return tag === "tspan" || tag === "text";
  });
  const originX = attrLength(node, "x");
  const originY = attrLength(node, "y");
  const anchor = textAnchorOf(node);

  if (kids.length === 0) {
    const width = measureMermaidTextWidth(ownCharacterData(node) || (node.textContent ?? ""));
    return anchoredTextBox(width, LINE_HEIGHT, originX, originY, anchor);
  }

  const rows = kids.filter(isTextRowTspan);
  if (rows.length > 0) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const row of rows) {
      const next = mermaidShimBBox(row, seen);
      if (next.width <= 0 && next.height <= 0) continue;
      minX = Math.min(minX, next.x);
      minY = Math.min(minY, next.y);
      maxX = Math.max(maxX, next.x + next.width);
      maxY = Math.max(maxY, next.y + next.height);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return box(0, 0);
    return box(maxX - minX, maxY - minY, minX, minY);
  }

  let totalWidth = measureMermaidTextWidth(ownCharacterData(node));
  let height = LINE_HEIGHT;
  for (const kid of kids) {
    const next = mermaidShimBBox(kid, seen);
    totalWidth += next.width;
    height = Math.max(height, next.height);
  }
  return anchoredTextBox(totalWidth, height, originX, originY, anchor);
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
    const local = mermaidShimBBox(child, seen);
    if (local.width <= 0 && local.height <= 0) continue;
    const next = applyTransformToBox(local, parseSvgTransform(child.getAttribute?.("transform")));
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
    return layoutTextBox(node, seen);
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

  if (tag === "path") {
    return pathDataBox(node.getAttribute?.("d") ?? "");
  }

  if (tag === "polygon" || tag === "polyline") {
    return pathDataBox(node.getAttribute?.("points") ?? "");
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
