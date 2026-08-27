import type { MdLiveEmbedSpec } from "./types";

function needsQuotes(value: string): boolean {
  return /[\s"'=<>{}]/.test(value) || value.length === 0;
}

function quoteAttr(value: string): string {
  if (!needsQuotes(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function formatEmbedDirective(spec: MdLiveEmbedSpec): string {
  const parts = [`kind=${quoteAttr(spec.kind)}`, `layout=${quoteAttr(spec.layout)}`];
  for (const [key, value] of Object.entries(spec.attrs)) {
    if (key === "kind" || key === "layout") continue;
    parts.push(`${key}=${quoteAttr(value)}`);
  }
  const title = spec.title ?? "";
  const body = `{${parts.join(" ")}}`;
  if (spec.layout === "inline") {
    return `:md-live[${title}]${body}`;
  }
  return `::md-live[${title}]${body}`;
}

export function formatEmbedForAgent(spec: MdLiveEmbedSpec): string {
  const url = spec.attrs.url;
  const path = spec.attrs.path;
  const label = spec.title || spec.kind;
  if (url) return `${label} — ${url}`;
  if (path) return `${label} — ${path}`;
  return label;
}
