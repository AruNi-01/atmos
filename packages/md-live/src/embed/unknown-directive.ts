/** mdast node as produced by remark / `remark-directive`. */
export type DirectiveMdast = {
  type: string;
  name?: string;
  value?: string;
  url?: string;
  title?: string | null;
  alt?: string | null;
  identifier?: string;
  label?: string | null;
  referenceType?: "shortcut" | "collapsed" | "full";
  attributes?: Record<string, string | null | undefined> | null;
  children?: DirectiveMdast[];
};

const DIRECTIVE_TYPES = new Set(["textDirective", "leafDirective", "containerDirective"]);
const REFERENCE_TYPES = new Set(["linkReference", "imageReference", "definition"]);

function quoteAttrValue(value: string): string {
  if (value.length > 0 && !/[\s"'=<>{}]/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function isMdLiveDirectiveName(name: string | undefined): boolean {
  return name === "md-live";
}

export function formatDirectiveAttributes(
  attrs: Record<string, string | null | undefined> | null | undefined,
): string {
  if (!attrs) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) parts.push(key);
    else parts.push(`${key}=${quoteAttrValue(value)}`);
  }
  return parts.length > 0 ? `{${parts.join(" ")}}` : "";
}

function phrasingText(children: DirectiveMdast[] | undefined): string {
  if (!children?.length) return "";
  return children.map((child) => child.value ?? phrasingText(child.children)).join("");
}

function directivePrefix(type: string): string {
  if (type === "containerDirective") return ":::";
  if (type === "leafDirective") return "::";
  return ":";
}

/**
 * Reconstruct Generic Directive source for an unknown directive.
 * Labels of `textDirective` / `leafDirective` are flattened; container
 * bodies are not included (callers splice children separately).
 */
export function formatUnknownDirectiveSource(node: DirectiveMdast): string {
  const prefix = directivePrefix(node.type);
  const name = node.name ?? "";
  const attrs = formatDirectiveAttributes(node.attributes);
  if (node.type === "containerDirective") return `${prefix}${name}${attrs}`;
  const label = phrasingText(node.children);
  const labelPart = node.children && node.children.length > 0 ? `[${label}]` : "";
  return `${prefix}${name}${labelPart}${attrs}`;
}

function textNode(value: string): DirectiveMdast {
  return { type: "text", value };
}

function paragraphNode(value: string): DirectiveMdast {
  return { type: "paragraph", children: [textNode(value)] };
}

function expandUnknownDirective(node: DirectiveMdast): DirectiveMdast[] {
  if (node.type === "containerDirective") {
    const out: DirectiveMdast[] = [paragraphNode(formatUnknownDirectiveSource(node))];
    if (node.children?.length) out.push(...node.children);
    out.push(paragraphNode(":::"));
    return out;
  }
  if (node.type === "leafDirective") {
    return [paragraphNode(formatUnknownDirectiveSource(node))];
  }
  const attrs = formatDirectiveAttributes(node.attributes);
  if (!node.children?.length) {
    return [textNode(`:${node.name ?? ""}${attrs}`)];
  }
  return [textNode(`:${node.name ?? ""}[`), ...node.children, textNode(`]${attrs}`)];
}

function referenceLabel(node: DirectiveMdast): string {
  return node.label || node.identifier || "";
}

function expandLinkReference(node: DirectiveMdast): DirectiveMdast[] {
  const label = referenceLabel(node);
  const close =
    node.referenceType === "full"
      ? `][${label}]`
      : node.referenceType === "collapsed"
        ? "][]"
        : "]";
  return [textNode("["), ...(node.children ?? []), textNode(close)];
}

function expandImageReference(node: DirectiveMdast): DirectiveMdast[] {
  const alt = node.alt ?? "";
  const label = referenceLabel(node);
  if (node.referenceType === "full") return [textNode(`![${alt}][${label}]`)];
  if (node.referenceType === "collapsed") return [textNode(`![${alt}][]`)];
  return [textNode(`![${alt}]`)];
}

function expandDefinition(node: DirectiveMdast): DirectiveMdast[] {
  const label = referenceLabel(node);
  const url = node.url ?? "";
  const title = node.title;
  const titlePart = title ? ` "${String(title).replace(/"/g, '\\"')}"` : "";
  return [paragraphNode(`[${label}]: ${url}${titlePart}`)];
}

function expandUnknown(node: DirectiveMdast): DirectiveMdast[] {
  if (DIRECTIVE_TYPES.has(node.type)) return expandUnknownDirective(node);
  if (node.type === "linkReference") return expandLinkReference(node);
  if (node.type === "imageReference") return expandImageReference(node);
  if (node.type === "definition") return expandDefinition(node);
  if (node.children?.length) return node.children;
  if (typeof node.value === "string" && node.value) return [textNode(node.value)];
  return [];
}

function keepAsEmbed(node: DirectiveMdast): boolean {
  return (
    (node.type === "textDirective" || node.type === "leafDirective")
    && isMdLiveDirectiveName(node.name)
  );
}

function isUnknownCrashNode(node: DirectiveMdast): boolean {
  if (keepAsEmbed(node)) return false;
  return DIRECTIVE_TYPES.has(node.type) || REFERENCE_TYPES.has(node.type);
}

/**
 * Nodes Milkdown cannot match: greedy `remark-directive` names (`:每种`,
 * `12:30`, `:cite`, `::youtube`, `:::note`) and leftover reference
 * `linkReference` / `imageReference` / `definition` after inline-links.
 */
export function remarkUnknownDirectives() {
  return (tree: DirectiveMdast) => {
    const visit = (node: DirectiveMdast) => {
      if (!node.children) return;
      const next: DirectiveMdast[] = [];
      for (const child of node.children) {
        visit(child);
        if (!isUnknownCrashNode(child)) {
          next.push(child);
          continue;
        }
        next.push(...expandUnknown(child));
      }
      node.children = next;
    };
    visit(tree);
  };
}

/** Same transform; name used by the host remark plugin. */
export const remarkUnknownMdast = remarkUnknownDirectives;
