/**
 * Assistant answers and thinking on web replace a complete http(s) URL with a
 * hostname chip. The native markdown view cannot mount that chip, so this
 * rewrites the markdown to a hostname link and marks the href. Favicon, pill
 * radius, and the hover card stay on web.
 */
export const HTTP_CHIP_HREF_PREFIX = "atmos-http-chip:";

/** linkVariants key. Tested against the full href. */
export const HTTP_CHIP_LINK_VARIANT = "^atmos-http-chip:";

const TRAILING_PUNCT_RE = /[),.;:!?]+$/;
const HTTP_URL_RE = /^https?:\/\/[^\s<>"'`\\]+$/i;
const URL_START_RE = /^https?:\/\//i;

export function httpChipTarget(url: string): string | null {
  if (!url.startsWith(HTTP_CHIP_HREF_PREFIX)) return null;
  const target = url.slice(HTTP_CHIP_HREF_PREFIX.length);
  if (target.startsWith("https://") || target.startsWith("http://")) return target;
  return null;
}

/** Same complete-URL rule as web `isCompletePreviewUrl`. */
export function completeHttpUrl(value: string): string | null {
  const trimmed = value.trim().replace(TRAILING_PUNCT_RE, "");
  if (!HTTP_URL_RE.test(trimmed)) return null;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname;
  if (!host) return null;
  const complete =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) ||
    host.includes(".");
  return complete ? parsed.toString() : null;
}

export function chipCompleteHttpUrls(markdown: string): string {
  const parts: string[] = [];
  let index = 0;
  while (index < markdown.length) {
    if (atLineStart(markdown, index)) {
      const skipped = skipProtectedLine(markdown, index);
      if (skipped > index) {
        parts.push(markdown.slice(index, skipped));
        index = skipped;
        continue;
      }
    }

    if (markdown[index] === "`") {
      const end = inlineCodeEnd(markdown, index);
      parts.push(markdown.slice(index, end));
      index = end;
      continue;
    }

    if (markdown[index] === "!" && markdown[index + 1] === "[") {
      const image = readLink(markdown, index + 1);
      if (image) {
        parts.push(markdown.slice(index, image.end));
        index = image.end;
        continue;
      }
    }

    if (markdown[index] === "[") {
      const link = readLink(markdown, index);
      if (link) {
        parts.push(rewriteLink(markdown.slice(index, link.end), link.destination));
        index = link.end;
        continue;
      }
    }

    if (markdown[index] === "<") {
      const autolink = readAngleAutolink(markdown, index);
      if (autolink) {
        const url = completeHttpUrl(autolink.url);
        parts.push(url ? chipMarkdown(url) : markdown.slice(index, autolink.end));
        index = autolink.end;
        continue;
      }
    }

    if (startsWithHttpUrl(markdown, index)) {
      const raw = readBareUrl(markdown, index);
      const url = completeHttpUrl(raw);
      if (url && raw.length > 0) {
        parts.push(chipMarkdown(url));
        index += raw.replace(TRAILING_PUNCT_RE, "").length;
        continue;
      }
    }

    parts.push(markdown[index] ?? "");
    index += 1;
  }
  return parts.join("");
}

function chipMarkdown(url: string): string {
  const label = hostnameLabel(url).replace(/[\\[\]*_`]/g, (char) => `\\${char}`);
  const href = `${HTTP_CHIP_HREF_PREFIX}${url}`;
  const destination = /[\s()<>]/.test(href) ? `<${href.replace(/>/g, "%3E")}>` : href;
  return `[${label}](${destination})`;
}

function hostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "") || url;
  } catch {
    return url;
  }
}

function rewriteLink(raw: string, destination: string): string {
  if (destination.startsWith(HTTP_CHIP_HREF_PREFIX)) return raw;
  const url = completeHttpUrl(destination);
  return url ? chipMarkdown(url) : raw;
}

function atLineStart(text: string, index: number): boolean {
  return index === 0 || text[index - 1] === "\n";
}

function skipProtectedLine(text: string, index: number): number {
  const fence = fenceBlockEnd(text, index);
  if (fence > index) return fence;
  const indented = indentedCodeEnd(text, index);
  if (indented > index) return indented;
  return referenceDefinitionEnd(text, index);
}

function lineAt(text: string, index: number): { line: string; next: number } {
  const end = text.indexOf("\n", index);
  if (end === -1) return { line: text.slice(index).replace(/\r$/, ""), next: text.length };
  const raw = text.slice(index, end);
  return { line: raw.endsWith("\r") ? raw.slice(0, -1) : raw, next: end + 1 };
}

function openingFence(line: string): { char: "`" | "~"; min: number } | null {
  let cursor = 0;
  while (cursor < line.length && line[cursor] === " " && cursor < 3) cursor += 1;
  const char = line[cursor];
  if (char !== "`" && char !== "~") return null;
  let count = 0;
  while (line[cursor] === char) {
    count += 1;
    cursor += 1;
  }
  if (count < 3) return null;
  if (char === "`" && line.slice(cursor).includes("`")) return null;
  return { char, min: count };
}

function isFenceClose(line: string, char: "`" | "~", min: number): boolean {
  let cursor = 0;
  while (cursor < line.length && line[cursor] === " " && cursor < 3) cursor += 1;
  let count = 0;
  while (line[cursor] === char) {
    count += 1;
    cursor += 1;
  }
  if (count < min) return false;
  for (let index = cursor; index < line.length; index += 1) {
    const value = line[index];
    if (value !== " " && value !== "\t") return false;
  }
  return true;
}

function fenceBlockEnd(text: string, index: number): number {
  const first = lineAt(text, index);
  const open = openingFence(first.line);
  if (!open) return index;
  let cursor = first.next;
  while (cursor < text.length) {
    const next = lineAt(text, cursor);
    if (isFenceClose(next.line, open.char, open.min)) return next.next;
    if (next.next <= cursor) return text.length;
    cursor = next.next;
  }
  return text.length;
}

function startsWithHttpUrl(text: string, index: number): boolean {
  const head = text[index];
  if (head !== "h" && head !== "H") return false;
  return URL_START_RE.test(text.slice(index, index + 8));
}

function indentedCodeLine(line: string): boolean {
  return line.startsWith("    ") || line.startsWith("\t");
}

function indentedCodeEnd(text: string, index: number): number {
  if (index > 0) {
    const previousBreak = text.lastIndexOf("\n", index - 2);
    const previous = text.slice(previousBreak + 1, index - 1).replace(/\r$/, "");
    if (previous.trim().length > 0) return index;
  }
  const first = lineAt(text, index);
  if (!indentedCodeLine(first.line)) return index;
  let cursor = index;
  while (cursor < text.length) {
    const current = lineAt(text, cursor);
    if (indentedCodeLine(current.line)) {
      cursor = current.next;
      continue;
    }
    if (current.line.trim().length === 0 && current.next < text.length) {
      const peek = lineAt(text, current.next);
      if (indentedCodeLine(peek.line)) {
        cursor = current.next;
        continue;
      }
    }
    return cursor;
  }
  return cursor;
}

function referenceDefinitionEnd(text: string, index: number): number {
  const current = lineAt(text, index);
  if (!/^ {0,3}\[[^\]\n]+\]:[ \t]+\S/.test(current.line)) return index;
  return current.next;
}

function inlineCodeEnd(text: string, index: number): number {
  let marks = 0;
  while (text[index + marks] === "`") marks += 1;
  if (marks === 0) return index + 1;
  const closer = "`".repeat(marks);
  const rest = text.indexOf(closer, index + marks);
  if (rest === -1) return text.length;
  return rest + marks;
}

type MarkdownLink = { destination: string; end: number };

function readLink(text: string, index: number): MarkdownLink | null {
  if (text[index] !== "[") return null;
  let cursor = index + 1;
  let depth = 1;
  while (cursor < text.length && depth > 0) {
    if (text[cursor] === "\\") {
      cursor += text[cursor + 1] ? 2 : 1;
      continue;
    }
    if (text[cursor] === "[") depth += 1;
    else if (text[cursor] === "]") depth -= 1;
    if (depth > 0) cursor += 1;
  }
  if (text[cursor] !== "]" || text[cursor + 1] !== "(") return null;
  cursor += 2;
  while (
    cursor < text.length &&
    (text[cursor] === " " || text[cursor] === "\t" || text[cursor] === "\n")
  ) {
    cursor += 1;
  }
  let destination = "";
  if (text[cursor] === "<") {
    cursor += 1;
    while (cursor < text.length && text[cursor] !== ">" && text[cursor] !== "\n") {
      if (text[cursor] === "\\") {
        destination += text[cursor + 1] ?? "";
        cursor += 2;
        continue;
      }
      destination += text[cursor] ?? "";
      cursor += 1;
    }
    if (text[cursor] !== ">") return null;
    cursor += 1;
  } else {
    let paren = 0;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === "\\") {
        destination += text[cursor + 1] ?? "";
        cursor += 2;
        continue;
      }
      if (char === " " || char === "\t" || char === "\n") break;
      if (char === "(") paren += 1;
      if (char === ")") {
        if (paren === 0) break;
        paren -= 1;
      }
      destination += char ?? "";
      cursor += 1;
    }
  }
  while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) cursor += 1;
  const quote = text[cursor];
  if (quote === '"' || quote === "'" || quote === "(") {
    const close = quote === "(" ? ")" : quote;
    cursor += 1;
    while (cursor < text.length && text[cursor] !== close && text[cursor] !== "\n") cursor += 1;
    if (text[cursor] !== close) return null;
    cursor += 1;
    while (cursor < text.length && (text[cursor] === " " || text[cursor] === "\t")) cursor += 1;
  }
  if (text[cursor] !== ")") return null;
  return { destination, end: cursor + 1 };
}

function readAngleAutolink(text: string, index: number): { url: string; end: number } | null {
  if (text[index] !== "<") return null;
  const close = text.indexOf(">", index + 1);
  if (close === -1) return null;
  const url = text.slice(index + 1, close);
  if (!URL_START_RE.test(url) || /\s/.test(url)) return null;
  return { url, end: close + 1 };
}

function readBareUrl(text: string, index: number): string {
  const match = /^https?:\/\/[^\s<>"'`\\]+/i.exec(text.slice(index));
  return match?.[0] ?? "";
}
