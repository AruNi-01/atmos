import { catalogIdToXmlTag } from "./catalog-tags";
import type { PtDocument, PtHandler, PtNode, PtOption } from "./schema";

const ATTR_ORDER = ["id", "label", "value", "checked", "x", "y", "width", "height", "rotation"] as const;

function escAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function escText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
}

function num(value: number): string {
  return String(value);
}

function nodeAttrs(node: PtNode): string {
  const pairs: [string, string][] = [];
  const emit = new Map<string, string>();
  emit.set("id", node.id);
  if (node.props.label != null) emit.set("label", String(node.props.label));
  if (node.value !== undefined) emit.set("value", node.value);
  if (node.checked !== undefined) emit.set("checked", node.checked ? "true" : "false");
  emit.set("x", num(node.x));
  emit.set("y", num(node.y));
  emit.set("width", num(node.width));
  emit.set("height", num(node.height));
  emit.set("rotation", num(node.rotation));

  for (const key of ATTR_ORDER) {
    const value = emit.get(key);
    if (value !== undefined) pairs.push([key, value]);
  }

  const rest = Object.keys(node.props)
    .filter((key) => key !== "label")
    .sort();
  for (const key of rest) {
    const value = node.props[key];
    if (value === null || value === undefined) continue;
    pairs.push([key, String(value)]);
  }

  return pairs.map(([key, value]) => `${key}="${escAttr(value)}"`).join(" ");
}

function writeOptions(options: PtOption[] | undefined, indent: string, lines: string[]): void {
  for (const option of options ?? []) {
    lines.push(`${indent}<option value="${escAttr(option.value)}">${escText(option.label)}</option>`);
  }
}

function writeHandlers(events: PtHandler[] | undefined, indent: string, lines: string[]): void {
  for (const handler of events ?? []) {
    lines.push(`${indent}<on event="${escAttr(handler.event)}">`);
    for (const action of handler.actions) {
      lines.push(`${indent}  <action type="agent" name="${escAttr(action.name)}"/>`);
    }
    lines.push(`${indent}</on>`);
  }
}

function writeNode(node: PtNode, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  const tag = catalogIdToXmlTag(node.type);
  const attrs = nodeAttrs(node);
  const hasOptions = (node.options?.length ?? 0) > 0;
  const hasChildren = (node.children?.length ?? 0) > 0;
  const hasEvents = (node.events?.length ?? 0) > 0;
  if (!hasOptions && !hasChildren && !hasEvents) {
    lines.push(`${indent}<${tag} ${attrs}/>`);
    return;
  }
  lines.push(`${indent}<${tag} ${attrs}>`);
  writeOptions(node.options, `${indent}  `, lines);
  for (const child of node.children ?? []) {
    writeNode(child, depth + 1, lines);
  }
  writeHandlers(node.events, `${indent}  `, lines);
  lines.push(`${indent}</${tag}>`);
}

export function serializePtx(doc: PtDocument): string {
  const page = doc.pages[0];
  const lines = [`<page id="${escAttr(page.id)}">`];
  for (const node of page.nodes) {
    writeNode(node, 1, lines);
  }
  lines.push("</page>");
  return `${lines.join("\n")}\n`;
}
