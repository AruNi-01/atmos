import type { MdLiveEmbedLayout, MdLiveEmbedSpec } from "./types";

export type EmbedDirectiveInput = {
  type: "textDirective" | "leafDirective";
  name: string;
  label?: string;
  attributes?: Record<string, string>;
};

function parseAttrValue(raw: string): string {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/** Parse `{key=value key2="a b"}` attribute blob from a serialized directive. */
export function parseAttributeBlob(blob: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const inner = blob.trim().replace(/^\{/, "").replace(/\}$/, "");
  const re = /([A-Za-z_][\w-]*)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s}]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(inner))) {
    attrs[match[1]] = parseAttrValue(match[2]);
  }
  return attrs;
}

export function parseEmbedDirective(input: EmbedDirectiveInput): MdLiveEmbedSpec | null {
  if (input.name !== "md-live") return null;
  const raw = { ...(input.attributes ?? {}) };
  const kind = raw.kind ?? "unknown";
  delete raw.kind;
  let layout: MdLiveEmbedLayout;
  if (raw.layout === "inline" || raw.layout === "card") {
    layout = raw.layout;
  } else {
    layout = input.type === "textDirective" ? "inline" : "card";
  }
  delete raw.layout;
  const title = (input.label ?? "").trim() || raw.title || "";
  delete raw.title;
  return {
    kind,
    layout,
    title,
    attrs: raw,
  };
}

/** Parse a serialized `:md-live[...]{...}` / `::md-live[...]{...}` string. */
export function parseEmbedDirectiveText(text: string): MdLiveEmbedSpec | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(::{0,2})md-live\[([^\]]*)\](\{[\s\S]*\})\s*$/);
  if (!match) return null;
  const colons = match[1] ?? "";
  const type = colons === "::" ? "leafDirective" : "textDirective";
  return parseEmbedDirective({
    type,
    name: "md-live",
    label: match[2],
    attributes: parseAttributeBlob(match[3] ?? ""),
  });
}
