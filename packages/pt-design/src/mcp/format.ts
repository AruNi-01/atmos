import { PtDesignError } from "../protocol";

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
    case "unknown_type":
      return "Call pt_catalog_list and use a returned type.";
    case "unknown_tool":
      return "Call pt_tools_list. Old APP-062 names are not registered.";
    case "missing_file":
      return "Pass path to pt_doc_init / pt_doc_open, or start the server with --file pointing at a .ptd.";
    case "invalid_ptx":
    case "invalid_option":
      return "Read document.ptx (or pt_ptx_get), edit the XML, write the complete file back.";
    case "path_denied":
      return "pt_screenshot is live-tab only. Doc tools need a .ptd path.";
    default:
      return "";
  }
}

export function toolError(error: unknown): ToolResult {
  const code = error instanceof PtDesignError ? error.code : "unknown_tool";
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
  if (Array.isArray(rec.types) && rec.types[0] && typeof rec.types[0] === "object" && "xmlExample" in (rec.types[0] as object)) {
    return catalogMarkdown(rec);
  }
  if (typeof rec.ptx === "string") {
    return rec.ptx;
  }
  return JSON.stringify(data, null, 2);
}

function catalogMarkdown(page: Record<string, unknown>): string {
  const types = page.types as Array<{
    type: string;
    xmlExample: string;
    agentDescription: string;
    defaultBBox: { width: number; height: number };
  }>;
  const lines = [`# Catalog`, ``];
  for (const item of types) {
    const box = item.defaultBBox;
    const size = box ? `${box.width}×${box.height}` : "";
    lines.push(`- **${item.type}**${size ? ` (${size})` : ""} — ${item.agentDescription}`);
    lines.push("");
    lines.push("```xml");
    lines.push(item.xmlExample.trim());
    lines.push("```");
    lines.push("");
  }
  return lines.join("\n");
}
