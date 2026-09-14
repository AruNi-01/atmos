import { xmlTagToCatalogId } from "./catalog-tags";
import { fail } from "./error";
import { validatePtx } from "./ptx-validate";
import type { PtAction, PtDocument, PtHandler, PtNode, PtOption } from "./schema";

const RESERVED = new Set(["id", "x", "y", "width", "height", "rotation", "value", "checked", "label"]);

type AttrValue = string | true;
type XmlAttrs = Record<string, AttrValue>;
type XmlChild = XmlElem | string;
type XmlElem = { tag: string; attrs: XmlAttrs; children: XmlChild[] };

function unescapeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function rejectUnsafe(xml: string): void {
  if (/<!DOCTYPE/i.test(xml) || /<!ENTITY/i.test(xml)) {
    fail("invalid_ptx", "DOCTYPE and ENTITY are not allowed");
  }
  if (/%[A-Za-z_:][\w:.-]*;/.test(xml)) {
    fail("invalid_ptx", "Parameter entities are not allowed");
  }
}

class PtxReader {
  private readonly xml: string;
  private i = 0;

  constructor(xml: string) {
    this.xml = xml;
  }

  parseDocument(): XmlElem {
    this.skipBom();
    this.skipWs();
    this.skipXmlDeclaration();
    this.skipWs();
    const root = this.parseElement();
    this.skipWs();
    if (!this.eof()) fail("invalid_ptx", "Unexpected content after root element");
    return root;
  }

  private eof(): boolean {
    return this.i >= this.xml.length;
  }

  private peek(): string {
    return this.xml[this.i] ?? "";
  }

  private startsWith(value: string): boolean {
    return this.xml.startsWith(value, this.i);
  }

  private skipBom(): void {
    if (this.startsWith("\uFEFF")) this.i += 1;
  }

  private skipWs(): void {
    while (this.i < this.xml.length && /[\s]/.test(this.xml[this.i]!)) this.i += 1;
  }

  private skipXmlDeclaration(): void {
    if (!this.startsWith("<?xml")) return;
    const end = this.xml.indexOf("?>", this.i);
    if (end < 0) fail("invalid_ptx", "Unterminated XML declaration");
    this.i = end + 2;
  }

  private parseName(): string {
    const start = this.i;
    const first = this.xml[this.i];
    if (!first || !/[A-Za-z_]/.test(first)) fail("invalid_ptx", "Expected tag or attribute name");
    this.i += 1;
    while (this.i < this.xml.length && /[\w.-]/.test(this.xml[this.i]!)) this.i += 1;
    return this.xml.slice(start, this.i);
  }

  private parseAttrs(): XmlAttrs {
    const attrs: XmlAttrs = {};
    while (true) {
      this.skipWs();
      const ch = this.peek();
      if (ch === "/" || ch === ">" || ch === "") break;
      const name = this.parseName();
      this.skipWs();
      if (this.peek() !== "=") {
        attrs[name] = true;
        continue;
      }
      this.i += 1;
      this.skipWs();
      const quote = this.peek();
      if (quote !== '"' && quote !== "'") fail("invalid_ptx", `Attribute ${name} is missing quotes`);
      this.i += 1;
      const end = this.xml.indexOf(quote, this.i);
      if (end < 0) fail("invalid_ptx", `Unterminated attribute ${name}`);
      attrs[name] = unescapeXml(this.xml.slice(this.i, end));
      this.i = end + 1;
    }
    return attrs;
  }

  private parseElement(): XmlElem {
    if (this.peek() !== "<") fail("invalid_ptx", "Expected element");
    if (this.startsWith("</")) fail("invalid_ptx", "Unexpected closing tag");
    if (this.startsWith("<!")) fail("invalid_ptx", "Invalid markup");
    if (this.startsWith("<?")) fail("invalid_ptx", "Unexpected processing instruction");
    this.i += 1;
    const tag = this.parseName();
    const attrs = this.parseAttrs();
    this.skipWs();
    if (this.startsWith("/>")) {
      this.i += 2;
      return { tag, attrs, children: [] };
    }
    if (this.peek() !== ">") fail("invalid_ptx", `Unterminated start tag <${tag}>`);
    this.i += 1;
    const children = this.parseChildren(tag);
    return { tag, attrs, children };
  }

  private parseChildren(tag: string): XmlChild[] {
    const children: XmlChild[] = [];
    while (!this.eof()) {
      if (this.startsWith("</")) {
        this.i += 2;
        const close = this.parseName();
        this.skipWs();
        if (this.peek() !== ">") fail("invalid_ptx", `Unterminated closing tag </${close}>`);
        this.i += 1;
        if (close !== tag) fail("invalid_ptx", `Mismatched closing tag </${close}>`);
        return children;
      }
      if (this.peek() === "<") {
        children.push(this.parseElement());
        continue;
      }
      const start = this.i;
      const next = this.xml.indexOf("<", this.i);
      this.i = next < 0 ? this.xml.length : next;
      children.push(unescapeXml(this.xml.slice(start, this.i)));
    }
    fail("invalid_ptx", `Unterminated element <${tag}>`);
  }
}

function attrString(attrs: XmlAttrs, name: string): string | undefined {
  const value = attrs[name];
  if (value === undefined || value === true) return undefined;
  return value;
}

function requireAttr(attrs: XmlAttrs, name: string, label: string): string {
  const value = attrString(attrs, name);
  if (value === undefined || value.length === 0) fail("invalid_ptx", `${label} is required`);
  return value;
}

function parseNumberAttr(attrs: XmlAttrs, name: string, id: string): number {
  const raw = attrString(attrs, name);
  if (raw === undefined) fail("invalid_ptx", `${name} is required on ${id}`);
  const value = Number(raw);
  if (!Number.isFinite(value)) fail("invalid_ptx", `${name} must be a number on ${id}`);
  return value;
}

function parseChecked(attrs: XmlAttrs): boolean | undefined {
  if (!("checked" in attrs)) return undefined;
  const value = attrs.checked;
  if (value === true) return true;
  if (value === "true") return true;
  if (value === "false") return false;
  fail("invalid_ptx", 'checked must be "true", "false", or a boolean attribute');
}

function textOf(elem: XmlElem): string {
  let out = "";
  for (const child of elem.children) {
    if (typeof child !== "string") fail("invalid_ptx", `<${elem.tag}> cannot contain nested elements`);
    out += child;
  }
  return out;
}

function parseOption(elem: XmlElem): PtOption {
  if (!("value" in elem.attrs) || elem.attrs.value === true) {
    fail("invalid_option", "option is missing value");
  }
  const value = elem.attrs.value;
  if (typeof value !== "string" || value.length === 0) {
    fail("invalid_option", "option is missing value");
  }
  return { value, label: textOf(elem).trim() };
}

function parseAction(elem: XmlElem): PtAction {
  if (textOf(elem).trim().length > 0) fail("invalid_ptx", "action cannot contain text");
  const type = attrString(elem.attrs, "type");
  const name = attrString(elem.attrs, "name");
  if (type !== "agent" || !name) fail("invalid_ptx", "action must be type=\"agent\" with a name");
  return { type: "agent", name };
}

function parseOn(elem: XmlElem): PtHandler {
  const event = attrString(elem.attrs, "event");
  if (event !== "click" && event !== "change") fail("invalid_ptx", "on event must be click or change");
  const actions: PtAction[] = [];
  for (const child of elem.children) {
    if (typeof child === "string") {
      if (child.trim().length > 0) fail("invalid_ptx", "on cannot contain text");
      continue;
    }
    if (child.tag !== "action") fail("invalid_ptx", `Unexpected <${child.tag}> inside <on>`);
    actions.push(parseAction(child));
  }
  if (actions.length === 0) fail("invalid_ptx", "on must contain an action");
  return { event, actions };
}

function parseNode(elem: XmlElem): PtNode {
  const type = xmlTagToCatalogId(elem.tag);
  if (!type) fail("invalid_ptx", `Unknown tag <${elem.tag}>`);
  const id = requireAttr(elem.attrs, "id", "id");
  const props: PtNode["props"] = {};
  const label = attrString(elem.attrs, "label");
  if (label !== undefined) props.label = label;
  for (const [name, value] of Object.entries(elem.attrs)) {
    if (RESERVED.has(name)) continue;
    if (value === true) props[name] = "true";
    else props[name] = value;
  }
  const options: PtOption[] = [];
  const events: PtHandler[] = [];
  const children: PtNode[] = [];
  for (const child of elem.children) {
    if (typeof child === "string") {
      if (child.trim().length > 0) fail("invalid_ptx", `Unexpected text in <${elem.tag}>`);
      continue;
    }
    if (child.tag === "option") {
      options.push(parseOption(child));
      continue;
    }
    if (child.tag === "on") {
      events.push(parseOn(child));
      continue;
    }
    if (child.tag === "action") fail("invalid_ptx", "action must be inside <on>");
    if (!xmlTagToCatalogId(child.tag)) fail("invalid_ptx", `Unknown tag <${child.tag}>`);
    children.push(parseNode(child));
  }
  const node: PtNode = {
    id,
    type,
    props,
    x: parseNumberAttr(elem.attrs, "x", id),
    y: parseNumberAttr(elem.attrs, "y", id),
    width: parseNumberAttr(elem.attrs, "width", id),
    height: parseNumberAttr(elem.attrs, "height", id),
    rotation: attrString(elem.attrs, "rotation") === undefined ? 0 : parseNumberAttr(elem.attrs, "rotation", id),
  };
  const value = attrString(elem.attrs, "value");
  if (value !== undefined) node.value = value;
  const checked = parseChecked(elem.attrs);
  if (checked !== undefined) node.checked = checked;
  if (options.length > 0) node.options = options;
  if (events.length > 0) node.events = events;
  if (children.length > 0) node.children = children;
  return node;
}

function parsePage(elem: XmlElem): PtDocument {
  if (elem.tag !== "page") fail("invalid_ptx", "PTX root must be <page>");
  const id = requireAttr(elem.attrs, "id", "page id");
  const version = attrString(elem.attrs, "version") ?? "ptx/1";
  if (version !== "ptx/1") fail("invalid_ptx", `Unsupported PTX version: ${version}`);
  for (const name of Object.keys(elem.attrs)) {
    if (name !== "id" && name !== "version") fail("invalid_ptx", `Unexpected page attribute ${name}`);
  }
  const nodes: PtNode[] = [];
  for (const child of elem.children) {
    if (typeof child === "string") {
      if (child.trim().length > 0) fail("invalid_ptx", "Unexpected text in <page>");
      continue;
    }
    if (child.tag === "option" || child.tag === "on" || child.tag === "action") {
      fail("invalid_ptx", `<${child.tag}> cannot be a page child`);
    }
    nodes.push(parseNode(child));
  }
  return { version: "ptx/1", pages: [{ id, nodes }] };
}

export function parsePtx(xml: string): PtDocument {
  if (typeof xml !== "string" || xml.trim().length === 0) fail("invalid_ptx", "PTX is empty");
  rejectUnsafe(xml);
  const root = new PtxReader(xml).parseDocument();
  const doc = parsePage(root);
  validatePtx(doc);
  return doc;
}
