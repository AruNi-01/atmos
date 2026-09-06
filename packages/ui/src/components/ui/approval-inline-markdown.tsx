"use client";

import type { ReactNode } from "react";

/**
 * Safe inline subset for ApprovalCard todo titles: **bold** and `code` only.
 * No raw HTML, headings, or tables — callers keep full markdown elsewhere.
 */
export function renderInlineMarkdown(
  text: string,
  classes?: { strong?: string; code?: string },
): ReactNode {
  if (!text) return text;
  const nodes: ReactNode[] = [];
  const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  let found = false;
  while ((match = re.exec(text)) !== null) {
    found = true;
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    if (match[2] != null) {
      nodes.push(
        <strong key={`b${key++}`} className={classes?.strong}>
          {match[2]}
        </strong>,
      );
    } else if (match[3] != null) {
      nodes.push(
        <code key={`c${key++}`} className={classes?.code}>
          {match[3]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }
  if (!found) return text;
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
