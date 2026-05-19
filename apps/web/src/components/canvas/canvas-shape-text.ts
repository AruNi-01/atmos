import type { Editor, TLShape, TLShapeId } from "tldraw";

import {
  CANVAS_TERMINAL_SHAPE_TYPE,
  type CanvasTerminalShape,
} from "./canvas-terminal-shape";
import { extractCanvasTerminalText, formatCanvasTerminalForCopy } from "./canvas-terminal-copy";
import type { TerminalRef } from "@/components/terminal/Terminal";

/** Max chars in `get_state` text_preview. */
export const CANVAS_AGENT_TEXT_PREVIEW_MAX = 500;
/** Max chars when copying shape content to clipboard. */
export const CANVAS_SHAPE_COPY_MAX_CHARS = 8_000;

const MAX_FRAME_TREE_DEPTH = 24;

const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`,
    truncated: true,
  };
}

/** Extract plain text from tldraw richText / legacy text props. */
export function plainTextFromShapeProps(
  props: Record<string, unknown>,
  maxChars = CANVAS_AGENT_TEXT_PREVIEW_MAX,
): string | undefined {
  const rich = props.richText;
  if (rich && typeof rich === "object" && !Array.isArray(rich)) {
    const content = (rich as { content?: unknown }).content;
    if (Array.isArray(content)) {
      const lines = content.map((block) => {
        if (!block || typeof block !== "object") return "";
        const nodes = (block as { content?: unknown }).content;
        if (!Array.isArray(nodes)) return "";
        return nodes
          .map((node) =>
            node && typeof node === "object" && "text" in node
              ? String((node as { text: unknown }).text)
              : "",
          )
          .join("");
      });
      const joined = lines.join("\n").trim();
      if (joined) {
        return maxChars > 0 ? joined.slice(0, maxChars) : joined;
      }
    }
  }
  const legacy = props.text;
  if (typeof legacy === "string" && legacy.trim()) {
    const trimmed = legacy.trim();
    return maxChars > 0 ? trimmed.slice(0, maxChars) : trimmed;
  }
  return undefined;
}

/** Text snippet for `get_state` shapes[] — never includes terminal pane content. */
export function textPreviewForGetState(shape: TLShape): string | undefined {
  if (shape.type === CANVAS_TERMINAL_SHAPE_TYPE) {
    return undefined;
  }
  if (shape.type === "frame") {
    const name = (shape.props as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) {
      return name.trim().slice(0, CANVAS_AGENT_TEXT_PREVIEW_MAX);
    }
    return undefined;
  }
  return plainTextFromShapeProps(
    shape.props as Record<string, unknown>,
    CANVAS_AGENT_TEXT_PREVIEW_MAX,
  );
}

export type ShapeTextForCopyOptions = {
  terminalRefs?: Map<TLShapeId, TerminalRef>;
  terminalSkipFromBottom?: number;
};

/** On-demand text for `extract_text` (includes frame descendants). */
export async function textContentForExtract(
  editor: Editor,
  shape: TLShape,
  options?: ShapeTextForCopyOptions,
): Promise<string | undefined> {
  const text = await formatShapeTextForCopyAsync(editor, shape, 3, options);
  return text.trim() ? text : undefined;
}

export function plainTextFromShape(
  shape: TLShape,
  maxChars = CANVAS_SHAPE_COPY_MAX_CHARS,
): string | undefined {
  if (shape.type === CANVAS_TERMINAL_SHAPE_TYPE) {
    return formatCanvasTerminalMetadata(shape as CanvasTerminalShape);
  }
  if (shape.type === "frame") {
    const name = frameDisplayName(shape);
    return maxChars > 0 ? name.slice(0, maxChars) : name;
  }
  return plainTextFromShapeProps(shape.props as Record<string, unknown>, maxChars);
}

export function formatCanvasTerminalMetadata(shape: CanvasTerminalShape): string {
  const p = shape.props;
  const lines = [
    `Terminal: ${p.terminalName}`,
    `Tmux window: ${p.tmuxWindowName}`,
    `Project: ${p.projectName}`,
    `Workspace: ${p.workspaceName}`,
  ];
  if (p.localPath) {
    lines.push(`Path: ${p.localPath}`);
  }
  return lines.join("\n");
}

function frameDisplayName(shape: TLShape): string {
  const name = (shape.props as { name?: unknown }).name;
  if (typeof name === "string" && name.trim()) {
    return name.trim();
  }
  return "Frame";
}

/**
 * Markdown only has six heading levels; deeper nesting uses indented bold labels.
 * There is no cap on child count — only {@link CANVAS_SHAPE_COPY_MAX_CHARS} at export time.
 */
function shapeHeading(shape: TLShape, depth: number): string {
  const level = Math.max(depth, 3);
  if (level <= 6) {
    return `${"#".repeat(level)} ${shape.type} (${shape.id})`;
  }
  const indent = "  ".repeat(level - 6);
  return `${indent}**${shape.type}** (${shape.id})`;
}

function indentBodyLines(body: string, depth: number): string {
  if (depth <= 6) {
    return body.trim();
  }
  const indent = "  ".repeat(depth - 6);
  return body
    .trim()
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

export function getSortedChildShapes(editor: Editor, parentId: TLShapeId): TLShape[] {
  const shapes = editor.getCurrentPageShapesSorted?.() ?? editor.getCurrentPageShapes();
  return shapes.filter((shape) => shape.parentId === parentId);
}

export function formatCanvasShapeBlock(
  shape: TLShape,
  body: string,
  depth = 3,
): string {
  const header = shapeHeading(shape, depth);
  if (!body.trim()) {
    return `${header}\n${indentBodyLines("_(no text content)_", depth)}`;
  }
  return `${header}\n${indentBodyLines(body, depth)}`;
}

/** Sync tree export (terminals = metadata only; use async variant for pane capture). */
export function formatShapeTextForCopy(
  editor: Editor,
  shape: TLShape,
  depth = 3,
  visitDepth = 0,
): string {
  if (visitDepth > MAX_FRAME_TREE_DEPTH) {
    return `${shapeHeading(shape, depth)}\n…`;
  }

  if (shape.type === "frame") {
    const title = frameDisplayName(shape);
    const children = getSortedChildShapes(editor, shape.id);
    const childBlocks = children
      .map((child) => formatShapeTextForCopy(editor, child, depth + 1, visitDepth + 1))
      .filter((block) => block.trim().length > 0);
    const header = shapeHeading(shape, depth);
    if (childBlocks.length === 0) {
      return `${header}\n${title}`;
    }
    return `${header}\n${title}\n\n${childBlocks.join("\n\n")}`;
  }

  const body = plainTextFromShape(shape) ?? "";
  return formatCanvasShapeBlock(shape, body, depth);
}

/** Full tree export with tmux / xterm capture for nested terminals. */
export async function formatShapeTextForCopyAsync(
  editor: Editor,
  shape: TLShape,
  depth = 3,
  options?: ShapeTextForCopyOptions,
  visitDepth = 0,
): Promise<string> {
  if (visitDepth > MAX_FRAME_TREE_DEPTH) {
    return `${shapeHeading(shape, depth)}\n…`;
  }

  if (shape.type === "frame") {
    const title = frameDisplayName(shape);
    const children = getSortedChildShapes(editor, shape.id);
    const childBlocks = (
      await Promise.all(
        children.map((child) =>
          formatShapeTextForCopyAsync(editor, child, depth + 1, options, visitDepth + 1),
        ),
      )
    ).filter((block) => block.trim().length > 0);
    const header = shapeHeading(shape, depth);
    if (childBlocks.length === 0) {
      return `${header}\n${title}`;
    }
    return `${header}\n${title}\n\n${childBlocks.join("\n\n")}`;
  }

  if (shape.type === CANVAS_TERMINAL_SHAPE_TYPE) {
    const terminalShape = shape as CanvasTerminalShape;
    const ref = options?.terminalRefs?.get(shape.id) ?? null;
    const body = ref
      ? await formatCanvasTerminalForCopy(terminalShape, ref)
      : (
          await extractCanvasTerminalText(terminalShape, {
            skipFromBottom: options?.terminalSkipFromBottom ?? 0,
          })
        ).text;
    const header = shapeHeading(shape, depth);
    return body.trim() ? `${header}\n\n${body.trim()}` : `${header}\n_(no text content)_`;
  }

  const body = plainTextFromShape(shape) ?? "";
  return formatCanvasShapeBlock(shape, body, depth);
}

export async function formatCanvasShapesForCopy(
  editor: Editor,
  shapeIds: TLShape["id"][],
  options?: ShapeTextForCopyOptions,
): Promise<string> {
  const blocks: string[] = [];
  for (const id of shapeIds) {
    const shape = editor.getShape(id);
    if (!shape) continue;
    blocks.push(await formatShapeTextForCopyAsync(editor, shape, 3, options));
  }
  if (blocks.length === 0) {
    return "";
  }
  if (blocks.length === 1) {
    return blocks[0]!;
  }
  return `## Canvas selection (${blocks.length} shapes)\n\n${blocks.join("\n\n")}`;
}
