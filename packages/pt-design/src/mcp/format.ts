import { isPtDesignError, PT_ERROR_CODES } from "../agent/errors";
import type { CatalogEntry } from "../catalog/registry";
import type { DesignIR } from "../ir/schema";

export const CHARACTER_LIMIT = 50_000;

export type ResponseFormat = "json" | "markdown";

export type ToolResult = {
  isError: boolean;
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  data?: unknown;
  error?: { code: string; message: string };
};

export function paginate<T>(
  items: readonly T[],
  offset: number,
  limit: number,
): {
  items: T[];
  count: number;
  total: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
} {
  const total = items.length;
  const slice = items.slice(offset, offset + limit);
  const has_more = offset + slice.length < total;
  return {
    items: slice,
    count: slice.length,
    total,
    offset,
    has_more,
    ...(has_more ? { next_offset: offset + slice.length } : {}),
  };
}

export function clipText(text: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  return `${text.slice(0, CHARACTER_LIMIT)}\n\n[truncated at ${CHARACTER_LIMIT} characters; request a smaller scope or raise pagination]`;
}

function hintFor(code: string): string {
  switch (code) {
    case PT_ERROR_CODES.UNKNOWN_COMPONENT_TYPE:
      return "Call pt_catalog_list and use a returned componentType.";
    case PT_ERROR_CODES.NOT_FOUND:
    case PT_ERROR_CODES.FRAME_AMBIGUOUS:
      return "Call pt_ir_get or pt_frames_list to copy a valid id.";
    case PT_ERROR_CODES.MISSING_FILE:
    case PT_ERROR_CODES.INVALID_FILE:
      return "Pass file to pt_doc_init / pt_doc_open, or start the server with --file.";
    case PT_ERROR_CODES.USAGE:
      return "Check required fields in the tool schema; componentType/instanceId/file are the usual misses.";
    default:
      return "";
  }
}

export function toolError(error: unknown): ToolResult {
  const code = isPtDesignError(error) ? error.code : PT_ERROR_CODES.INTERNAL;
  const message = error instanceof Error ? error.message : String(error);
  const hint = hintFor(code);
  const text = hint ? `Error (${code}): ${message} ${hint}` : `Error (${code}): ${message}`;
  return {
    isError: true,
    content: [{ type: "text", text }],
    error: { code, message },
  };
}

export function toolSuccess(data: unknown, format: ResponseFormat = "json"): ToolResult {
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : { value: data };
  const text =
    format === "markdown" ? clipText(toMarkdown(data)) : clipText(JSON.stringify(data, null, 2));
  return {
    isError: false,
    content: [{ type: "text", text }],
    structuredContent: record,
    data,
  };
}

function toMarkdown(data: unknown): string {
  if (!data || typeof data !== "object") return String(data);
  const rec = data as Record<string, unknown>;
  if (Array.isArray(rec.items) && rec.items[0] && typeof rec.items[0] === "object" && "componentType" in (rec.items[0] as object)) {
    return catalogMarkdown(rec);
  }
  if (Array.isArray(rec.frames) && rec.version === undefined) {
    return framesMarkdown(rec);
  }
  if (rec.version === "pt-design-ir/1") {
    return irMarkdown(rec as unknown as DesignIR);
  }
  if (rec.instructions && rec.ir) {
    return `# Handoff\n\n${String(rec.instructions)}\n`;
  }
  return JSON.stringify(data, null, 2);
}

function catalogMarkdown(page: Record<string, unknown>): string {
  const items = page.items as CatalogEntry[];
  const lines = [
    `# Catalog`,
    ``,
    `Showing ${String(page.count)} of ${String(page.total)} (offset ${String(page.offset)}).`,
    ``,
  ];
  for (const item of items) {
    const variants = item.variants.length ? item.variants.join(", ") : "default";
    lines.push(`- **${item.label}** (\`${item.componentType}\`) — ${item.kind}; variants: ${variants}`);
  }
  if (page.has_more) lines.push(``, `More results: pass offset=${String(page.next_offset)}.`);
  return lines.join("\n");
}

function framesMarkdown(page: Record<string, unknown>): string {
  const frames = page.frames as Array<{ id: string; name: string; bbox: { x: number; y: number; w: number; h: number } }>;
  const lines = [`# Frames`, ``, `${String(page.total)} frame(s).`, ``];
  for (const frame of frames) {
    lines.push(`- **${frame.name}** (\`${frame.id}\`) ${frame.bbox.w}×${frame.bbox.h} at ${frame.bbox.x},${frame.bbox.y}`);
  }
  return lines.join("\n");
}

function irMarkdown(ir: DesignIR): string {
  const lines = [`# Design IR`, ``, `Catalog ${ir.catalogVersion}.`, ``];
  for (const frame of ir.frames) {
    lines.push(`## ${frame.name} (\`${frame.id}\`)`);
    for (const node of frame.nodes) {
      lines.push(`- ${node.componentType} \`${node.instanceId}\`${node.variant ? ` / ${node.variant}` : ""}`);
    }
    lines.push("");
  }
  if (ir.freeNodes.length) {
    lines.push(`## Free nodes`);
    for (const node of ir.freeNodes) {
      lines.push(`- ${node.componentType} \`${node.instanceId}\`${node.variant ? ` / ${node.variant}` : ""}`);
    }
  }
  return lines.join("\n");
}
