import type { MdLiveEmbedLayout, MdLiveEmbedSpec } from "./types";

export type EmbedDirectiveInput = {
  type: "textDirective" | "leafDirective";
  name: string;
  label?: string;
  attributes?: Record<string, string>;
};

function isWs(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
}

function isIdentStart(c: string | undefined): boolean {
  if (!c) return false;
  return (c >= "A" && c <= "Z") || (c >= "a" && c <= "z") || c === "_";
}

function isIdentContinue(c: string | undefined): boolean {
  if (!c) return false;
  return isIdentStart(c) || (c >= "0" && c <= "9") || c === "-";
}

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

function skipWs(input: string, i: number): number {
  while (i < input.length && isWs(input[i])) i++;
  return i;
}

/** Parse `{key=value key2="a b"}` attribute blob from a serialized directive. */
export function parseAttributeBlob(blob: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let inner = blob.trim();
  if (inner.startsWith("{")) inner = inner.slice(1);
  if (inner.endsWith("}")) inner = inner.slice(0, -1);

  let i = 0;
  while (i < inner.length) {
    i = skipWs(inner, i);
    if (i >= inner.length) break;
    if (!isIdentStart(inner[i])) {
      i++;
      continue;
    }
    const keyStart = i;
    i++;
    while (isIdentContinue(inner[i])) i++;
    const key = inner.slice(keyStart, i);
    i = skipWs(inner, i);
    if (inner[i] !== "=") continue;
    i++;
    i = skipWs(inner, i);
    if (i >= inner.length) break;

    const quote = inner[i];
    if (quote === '"' || quote === "'") {
      let j = i + 1;
      while (j < inner.length) {
        const c = inner[j];
        if (c === "\\") {
          j += 2;
          continue;
        }
        if (c === quote) {
          j++;
          break;
        }
        j++;
      }
      attrs[key] = parseAttrValue(inner.slice(i, j));
      i = j;
      continue;
    }

    const valStart = i;
    while (i < inner.length && !isWs(inner[i]) && inner[i] !== "}") i++;
    if (i > valStart) attrs[key] = inner.slice(valStart, i);
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
