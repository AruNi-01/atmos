import { parseHTML } from "linkedom";
import { mermaidShimBBox, mermaidShimTextLength } from "./mermaid-worker-measure";

class ShimStyleSheet {
  cssRules: { cssText: string }[] = [];
  insertRule(rule: string, index = this.cssRules.length): number {
    this.cssRules.splice(index, 0, { cssText: rule });
    return index;
  }
  deleteRule(index: number): void {
    this.cssRules.splice(index, 1);
  }
}

function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function patchNode(node: {
  getComputedTextLength?: () => number;
  getBBox?: () => unknown;
  getBoundingClientRect?: () => unknown;
  getCTM?: () => unknown;
  getScreenCTM?: () => unknown;
}) {
  node.getComputedTextLength = function getComputedTextLength() {
    return mermaidShimTextLength(this as never);
  };
  node.getBBox = function getBBox() {
    return mermaidShimBBox(this as never);
  };
  node.getBoundingClientRect = function getBoundingClientRect() {
    return mermaidShimBBox(this as never);
  };
  node.getCTM = identityMatrix;
  node.getScreenCTM = identityMatrix;
}

const { window, document } = parseHTML("<!DOCTYPE html><html><body></body></html>");

for (const ctor of [window.Element, window.SVGElement, window.HTMLElement]) {
  const proto = ctor?.prototype as
    | {
        getComputedTextLength?: () => number;
        getBBox?: () => unknown;
        getBoundingClientRect?: () => unknown;
        getCTM?: () => unknown;
        getScreenCTM?: () => unknown;
      }
    | undefined;
  if (!proto) continue;
  proto.getComputedTextLength = function getComputedTextLength() {
    return mermaidShimTextLength(this as never);
  };
  proto.getBBox = function getBBox() {
    return mermaidShimBBox(this as never);
  };
  proto.getBoundingClientRect = function getBoundingClientRect() {
    return mermaidShimBBox(this as never);
  };
  proto.getCTM = identityMatrix;
  proto.getScreenCTM = identityMatrix;
}

const createElement = document.createElement.bind(document);
document.createElement = ((name: string, options?: ElementCreationOptions) => {
  const element = createElement(name, options);
  patchNode(element as never);
  return element;
}) as typeof document.createElement;

const createElementNS = document.createElementNS.bind(document);
document.createElementNS = ((namespace: string | null, name: string) => {
  const element = createElementNS(namespace, name);
  patchNode(element as never);
  return element;
}) as typeof document.createElementNS;

const MEASURE_FONT = '16px "trebuchet ms", verdana, arial, sans-serif';

const computedStyle = {
  getPropertyValue(name: string) {
    if (name === "font-size") return "16px";
    if (name === "font-family") return MEASURE_FONT;
    return "";
  },
  fontSize: "16px",
  fontFamily: MEASURE_FONT,
  fontStyle: "normal",
  fontWeight: "normal",
  overflow: "visible",
};

const globals = globalThis as typeof globalThis & {
  window: unknown;
  document: unknown;
  DOMParser: unknown;
  XMLSerializer: unknown;
  Node: unknown;
  Element: unknown;
  HTMLElement: unknown;
  SVGElement: unknown;
  CSSStyleSheet: unknown;
  getComputedStyle: unknown;
  CSS?: { escape: (value: string) => string };
};

globals.window = window;
globals.document = document;
globals.DOMParser = window.DOMParser;
globals.XMLSerializer = window.XMLSerializer;
globals.Node = window.Node;
globals.Element = window.Element;
globals.HTMLElement = window.HTMLElement;
globals.SVGElement = window.SVGElement ?? window.Element;
globals.CSSStyleSheet = window.CSSStyleSheet ?? ShimStyleSheet;
globals.getComputedStyle = ((() => computedStyle) as unknown) as typeof getComputedStyle;
if (typeof globals.CSS === "undefined") {
  (globals as { CSS: { escape: (value: string) => string } }).CSS = {
    escape: (value: string) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&"),
  };
}
