/**
 * Parse the `atmos_review` YAML frontmatter block that the Atmos review agent embeds
 * at the top of markdown review reports (see `render_review_prompt` in
 * `crates/core-service/src/service/review.rs`).
 *
 * Report layout:
 *
 *     ---
 *     atmos_review:
 *       session_guid: "..."
 *       run_guid: "..."
 *       base_revision_guid: "..."
 *       current_revision_guid: "..."
 *       skill_id: "..."
 *       generated_at: "..."
 *     ---
 *
 *     # Code Review Report
 *     ...
 *
 * We intentionally target only this exact shape. Unrelated frontmatter (e.g. user's own
 * YAML at the top of a handwritten report) is passed through untouched.
 */

export interface AtmosReviewMetadata {
  session_guid: string;
  run_guid: string;
  base_revision_guid: string;
  current_revision_guid: string;
  skill_id: string;
  generated_at: string;
}

export interface ParsedReviewReport {
  /** Metadata parsed from the frontmatter, or null if the block is missing or malformed. */
  metadata: AtmosReviewMetadata | null;
  /** Markdown body with the `atmos_review` frontmatter block stripped. */
  body: string;
}

// Matches a leading YAML frontmatter block: --- ... ---
// Capture group 1 = raw yaml body, group 2 = rest of the document.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

// Keys we expect inside the atmos_review block. Rendered as string values so we can
// tolerate quoted, unquoted, and whitespace-padded inputs produced by the agent.
const REQUIRED_KEYS = [
  "session_guid",
  "run_guid",
  "base_revision_guid",
  "current_revision_guid",
  "skill_id",
  "generated_at",
] as const;

type RequiredKey = (typeof REQUIRED_KEYS)[number];

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Extract the `atmos_review` block (and its indented children) from raw frontmatter YAML.
 * Returns `null` when the block is missing or any required key is missing/empty.
 */
function extractAtmosReviewBlock(rawYaml: string): AtmosReviewMetadata | null {
  const lines = rawYaml.split(/\r?\n/);
  let inBlock = false;
  let blockIndent: number | null = null;
  const collected: Partial<Record<RequiredKey, string>> = {};

  for (const line of lines) {
    const trimmedLeft = line.replace(/\s+$/, "");
    if (!inBlock) {
      // Enter the atmos_review block on a line like `atmos_review:` at the top level.
      const match = trimmedLeft.match(/^atmos_review:\s*$/);
      if (match) {
        inBlock = true;
      }
      continue;
    }

    // Stop at an empty line or a dedent back to the top level (next top-level key).
    if (trimmedLeft === "") {
      continue;
    }
    const indentMatch = trimmedLeft.match(/^(\s+)(\S.*)$/);
    if (!indentMatch) {
      // A line that isn't indented means we've left the atmos_review block.
      break;
    }
    const currentIndent = indentMatch[1].length;
    if (blockIndent === null) {
      blockIndent = currentIndent;
    } else if (currentIndent < blockIndent) {
      break;
    }

    const content = indentMatch[2];
    const kvMatch = content.match(/^([a-z_]+):\s*(.*)$/);
    if (!kvMatch) continue;
    const key = kvMatch[1];
    const value = stripQuotes(kvMatch[2] ?? "");
    if ((REQUIRED_KEYS as readonly string[]).includes(key) && value) {
      collected[key as RequiredKey] = value;
    }
  }

  for (const key of REQUIRED_KEYS) {
    if (!collected[key]) return null;
  }

  return collected as AtmosReviewMetadata;
}

/**
 * Parse a review report markdown document. If a valid `atmos_review` frontmatter block is
 * present at the very top, the returned `body` omits the frontmatter (so it isn't rendered
 * as code text in the preview). Otherwise the original markdown is returned unchanged and
 * `metadata` is null.
 */
export function parseReviewReportMetadata(markdown: string): ParsedReviewReport {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    return { metadata: null, body: markdown };
  }
  const [, rawYaml, rest] = match;
  const metadata = extractAtmosReviewBlock(rawYaml);
  if (!metadata) {
    // Frontmatter exists but doesn't carry our block — leave it alone so the user's own
    // frontmatter (if any) is preserved for the MarkdownRenderer.
    return { metadata: null, body: markdown };
  }
  return { metadata, body: rest };
}
