import { getComponentModule } from "../../components/registry";
import { SKETCH_FONT } from "../../components/sketch";
import type { PtNode } from "../../protocol";

const EXTRA_TEXT_KEYS = ["label", "title", "description", "placeholder", "footer"] as const;
const FIELD_LIKE = new Set([
  "input",
  "textarea",
  "select",
  "combobox",
  "native-select",
  "slider",
  "progress",
  "calendar",
  "input-otp",
  "input-group",
]);

export const TEXT_LEAF_SELECTOR =
  "button, span, p, h1, h2, h3, h4, h5, label, li, legend, a, [data-pt-text]";

export type TextHit = {
  nodeId: string;
  key: string;
  kind: "prop" | "option";
  optionValue?: string;
};

export function textFieldsOf(node: PtNode): { key: string; value: string }[] {
  const keys = new Set<string>(EXTRA_TEXT_KEYS);
  try {
    for (const field of getComponentModule(node.type).inspectorFields) {
      if (field.kind === "text") keys.add(field.key);
    }
  } catch {
    /* unknown nested type — still read common keys */
  }
  const fields: { key: string; value: string }[] = [];
  for (const key of keys) {
    const raw = node.props[key];
    if (raw === null || raw === undefined) continue;
    const value = String(raw);
    if (value.length === 0 && key !== "placeholder") continue;
    fields.push({ key, value });
  }
  return fields;
}

export function findNodeInTree(node: PtNode, id: string): PtNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNodeInTree(child, id);
    if (found) return found;
  }
  return null;
}

export function patchNodeTree(node: PtNode, id: string, patch: Partial<PtNode>): PtNode {
  if (node.id === id) {
    return {
      ...node,
      ...patch,
      props: patch.props ? { ...node.props, ...patch.props } : node.props,
    };
  }
  if (!node.children?.length) return node;
  return { ...node, children: node.children.map((child) => patchNodeTree(child, id, patch)) };
}

export function growAncestorsToFit(node: PtNode, pad = 16): PtNode {
  if (!node.children?.length) return node;
  const children = node.children.map((child) => growAncestorsToFit(child, pad));
  let width = node.width;
  let height = node.height;
  for (const child of children) {
    width = Math.max(width, child.x + child.width + pad);
    height = Math.max(height, child.y + child.height + pad);
  }
  return { ...node, children, width, height };
}

export function isChartType(type: string): boolean {
  return type === "chart" || type.startsWith("chart.");
}

export function hugsText(type: string): boolean {
  if (type.startsWith("block.")) return false;
  if (isChartType(type)) return false;
  return !FIELD_LIKE.has(type);
}

export function fittedTextWidth(text: string, minWidth: number, padX = 24): number {
  const sample = text.length > 0 ? text : " ";
  const width = Math.ceil(measureLabel(sample) + padX);
  return Math.max(minWidth, width);
}

function measureLabel(text: string): number {
  if (typeof document === "undefined") return text.length * 8;
  const canvas = measureCanvas();
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 8;
  ctx.font = `500 14px ${SKETCH_FONT}`;
  return ctx.measureText(text).width;
}

function measureCanvas(): HTMLCanvasElement {
  const existing = measureCanvas.current;
  if (existing) return existing;
  const canvas = document.createElement("canvas");
  measureCanvas.current = canvas;
  return canvas;
}
measureCanvas.current = null as HTMLCanvasElement | null;

export function hitTextAtPoint(layer: Element, clientX: number, clientY: number, root: PtNode): TextHit | null {
  const hosts = [...layer.querySelectorAll<HTMLElement>("[data-pt-id]")];
  const containing = hosts.filter((el) => {
    const box = el.getBoundingClientRect();
    return clientX >= box.left && clientX <= box.right && clientY >= box.top && clientY <= box.bottom;
  });
  containing.sort((a, b) => areaOf(a) - areaOf(b));
  for (const host of containing) {
    const nodeId = host.getAttribute("data-pt-id");
    if (!nodeId) continue;
    const node = findNodeInTree(root, nodeId);
    if (!node) continue;
    const hit = matchTextInHost(host, clientX, clientY, node);
    if (hit) return hit;
  }
  const fallback = matchTextInHost(layer, clientX, clientY, root);
  if (fallback) return fallback;
  if (!isChartType(root.type) && containsPoint(layer, clientX, clientY)) {
    const fields = textFieldsOf(root);
    if (fields[0]) return { nodeId: root.id, key: fields[0].key, kind: "prop" };
  }
  return null;
}

function areaOf(el: Element): number {
  const box = el.getBoundingClientRect();
  return Math.max(1, box.width * box.height);
}

function matchTextInHost(host: Element, clientX: number, clientY: number, node: PtNode): TextHit | null {
  const fields = textFieldsOf(node);
  const keyed = [...host.querySelectorAll<HTMLElement>("[data-pt-text]")].filter(
    (el) => !el.closest("svg") && containsPoint(el, clientX, clientY),
  );
  keyed.sort((a, b) => areaOf(a) - areaOf(b));
  for (const el of keyed) {
    const key = el.getAttribute("data-pt-text");
    if (key && fields.some((field) => field.key === key)) {
      return { nodeId: node.id, key, kind: "prop" };
    }
  }
  const leaves = textLeaves(host).filter((el) => containsPoint(el, clientX, clientY));
  leaves.sort((a, b) => areaOf(a) - areaOf(b));
  for (const el of leaves) {
    const raw = visibleText(el);
    for (const field of fields) {
      if (raw === field.value) return { nodeId: node.id, key: field.key, kind: "prop" };
    }
    if (isChartType(node.type)) continue;
    for (const option of node.options ?? []) {
      if (raw === option.label) return { nodeId: node.id, key: "label", kind: "option", optionValue: option.value };
    }
  }
  if (!isChartType(node.type) && fields.length === 1 && containsPoint(host, clientX, clientY)) {
    return { nodeId: node.id, key: fields[0]!.key, kind: "prop" };
  }
  return null;
}

function textLeaves(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(TEXT_LEAF_SELECTOR)].filter(
    (el) => !el.closest("svg") && (el.textContent ?? "").trim().length > 0,
  );
}

function visibleText(el: HTMLElement): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function containsPoint(el: Element, x: number, y: number): boolean {
  const box = el.getBoundingClientRect();
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

export function applyTextHit(root: PtNode, hit: TextHit, next: string): PtNode {
  const target = findNodeInTree(root, hit.nodeId);
  if (!target) return root;
  const committed = sanitizeCollectedCopy(target, hit, next);
  if (committed === null) return root;
  if (hit.kind === "option" && hit.optionValue !== undefined) {
    const options = (target.options ?? []).map((option) =>
      option.value === hit.optionValue ? { ...option, label: committed } : option,
    );
    return growAncestorsToFit(patchNodeTree(root, hit.nodeId, { options }));
  }
  const patched = patchNodeTree(root, hit.nodeId, { props: { [hit.key]: committed } });
  const after = findNodeInTree(patched, hit.nodeId);
  if (!after) return patched;
  if (isChartType(after.type)) return patched;
  const min = hugsText(after.type) ? 36 : after.width;
  const width = hugsText(after.type)
    ? fittedTextWidth(committed, min)
    : Math.max(after.width, fittedTextWidth(committed, min));
  return growAncestorsToFit(patchNodeTree(patched, hit.nodeId, { width }));
}

export function findEditableHost(layer: Element, hit: TextHit, original: string): HTMLElement | null {
  const scope = layer.querySelector(`[data-pt-id="${hit.nodeId}"]`) ?? layer;
  const keyed = [...scope.querySelectorAll<HTMLElement>(`[data-pt-text="${hit.key}"]`)].filter(
    (el) => !el.closest("svg"),
  );
  if (keyed[0]) return keyed[0];
  const candidates = [...scope.querySelectorAll<HTMLElement>(TEXT_LEAF_SELECTOR)].filter(
    (el) => !el.closest("svg"),
  );
  const match = candidates.find((el) => visibleText(el) === original);
  if (match) return match;
  if (scope instanceof HTMLElement && !scope.querySelector("svg") && visibleText(scope) === original) {
    return scope;
  }
  return null;
}

export function readPlainText(el: HTMLElement): string {
  return (el.innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function sanitizeCollectedCopy(node: PtNode, hit: TextHit, next: string): string | null {
  if (!isFlattenedCopy(node, hit, next)) return next;
  return null;
}

export function isFlattenedCopy(node: PtNode, hit: TextHit, next: string): boolean {
  const original =
    hit.kind === "option"
      ? (node.options?.find((option) => option.value === hit.optionValue)?.label ?? "")
      : String(node.props[hit.key] ?? "");
  if (next === original) return false;
  const foreign = [
    ...textFieldsOf(node).filter((field) => field.key !== hit.key).map((field) => field.value),
    ...(node.options ?? []).map((option) => option.label),
  ].filter((value) => value.length > 0 && !original.includes(value));
  return foreign.filter((value) => next.includes(value)).length >= 2;
}

export function copyHostTextFromMarkup(html: string, key: string): string | null {
  const token = `data-pt-text="${key}"`;
  const start = html.indexOf(token);
  if (start < 0) return null;
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const close = html.indexOf("<", openEnd + 1);
  if (close < 0) return null;
  return html.slice(openEnd + 1, close).replace(/\s+/g, " ").trim();
}

export function flattenedMarkupText(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function stripInert(layer: Element): void {
  if (layer instanceof HTMLElement) layer.removeAttribute("inert");
  for (const el of layer.querySelectorAll("[inert]")) {
    el.removeAttribute("inert");
  }
}
