import { fail } from "./error";
import { isPtNodeType } from "./catalog-tags";
import type { PtDocument, PtNode } from "./schema";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function walkNode(node: PtNode, ids: Set<string>): void {
  if (typeof node.id !== "string" || node.id.length === 0) {
    fail("invalid_ptx", "Node id is required");
  }
  if (ids.has(node.id)) {
    fail("invalid_ptx", `Duplicate id: ${node.id}`);
  }
  ids.add(node.id);
  if (!isPtNodeType(node.type)) {
    fail("invalid_ptx", `Unknown node type: ${String(node.type)}`);
  }
  if (!isFiniteNumber(node.x) || !isFiniteNumber(node.y) || !isFiniteNumber(node.width) || !isFiniteNumber(node.height)) {
    fail("invalid_ptx", `Node ${node.id} is missing numeric spatial attrs`);
  }
  if (!isFiniteNumber(node.rotation)) {
    fail("invalid_ptx", `Node ${node.id} has invalid rotation`);
  }
  if (!node.props || typeof node.props !== "object") {
    fail("invalid_ptx", `Node ${node.id} is missing props`);
  }
  if (node.options) {
    for (const option of node.options) {
      if (!option || typeof option.value !== "string" || option.value.length === 0) {
        fail("invalid_option", `Option on ${node.id} is missing value`);
      }
      if (typeof option.label !== "string" || option.label.length === 0) {
        fail("invalid_option", `Option on ${node.id} is missing label`);
      }
    }
  }
  if (node.events) {
    for (const handler of node.events) {
      if (handler.event !== "click" && handler.event !== "change") {
        fail("invalid_ptx", `Invalid event on ${node.id}`);
      }
      if (!Array.isArray(handler.actions)) {
        fail("invalid_ptx", `Invalid actions on ${node.id}`);
      }
      for (const action of handler.actions) {
        if (action.type !== "agent" || typeof action.name !== "string" || action.name.length === 0) {
          fail("invalid_ptx", `Invalid action on ${node.id}`);
        }
      }
    }
  }
  for (const child of node.children ?? []) {
    walkNode(child, ids);
  }
}

export function validatePtx(doc: PtDocument): void {
  if (!doc || doc.version !== "ptx/1") {
    fail("invalid_ptx", "Document version must be ptx/1");
  }
  if (!Array.isArray(doc.pages) || doc.pages.length !== 1) {
    fail("invalid_ptx", "Document must contain exactly one page");
  }
  const page = doc.pages[0];
  if (!page || typeof page.id !== "string" || page.id.length === 0) {
    fail("invalid_ptx", "Page id is required");
  }
  if (!Array.isArray(page.nodes)) {
    fail("invalid_ptx", "Page nodes are required");
  }
  const ids = new Set<string>();
  for (const node of page.nodes) {
    walkNode(node, ids);
  }
}
