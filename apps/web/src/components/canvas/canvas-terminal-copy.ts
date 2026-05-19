import { systemApi } from "@/api/rest-api";
import type { TerminalRef } from "@/components/terminal/Terminal";
import { resolveCanvasTerminalContextMaxLines } from "@/hooks/use-canvas-settings";
import type { CanvasTerminalShape } from "./canvas-terminal-shape";
import {
  formatCanvasTerminalMetadata,
  stripAnsi,
  truncateText,
} from "./canvas-shape-text";

export const CANVAS_TERMINAL_CAPTURE_MAX_CHARS = 32_000;

export type CanvasTerminalCapturePage = {
  skip_lines: number;
  lines_returned: number;
  has_more_older: boolean;
  next_skip_lines: number | null;
};

export type CanvasTerminalCaptureResult = {
  text: string;
  page: CanvasTerminalCapturePage;
};

export async function captureCanvasTerminalScreenText(
  shape: CanvasTerminalShape,
  terminalRef: TerminalRef | null | undefined,
  options?: { skipFromBottom?: number },
): Promise<CanvasTerminalCaptureResult> {
  const maxLines = resolveCanvasTerminalContextMaxLines();
  const skip = Math.max(0, options?.skipFromBottom ?? 0);

  const fromXterm =
    skip === 0 ? terminalRef?.getScreenText?.(maxLines, 0) : terminalRef?.getScreenText?.(maxLines, skip);
  if (fromXterm?.trim()) {
    const lines = fromXterm.split("\n");
    const linesReturned = lines.length;
    const hasMoreOlder = linesReturned >= maxLines;
    return {
      text: truncateCapturedTerminalText(fromXterm),
      page: {
        skip_lines: skip,
        lines_returned: linesReturned,
        has_more_older: hasMoreOlder,
        next_skip_lines: hasMoreOlder ? skip + linesReturned : null,
      },
    };
  }

  const snapshot = await systemApi.captureTmuxWindow(shape.props.workspaceId, {
    tmux_window_name: shape.props.tmuxWindowName,
    max_lines: maxLines,
    skip_lines: skip,
    project_name: shape.props.projectName,
    workspace_name: shape.props.workspaceName,
  });

  const text = truncateCapturedTerminalText(stripAnsi(snapshot.data ?? ""));
  return {
    text,
    page: {
      skip_lines: snapshot.skip_lines ?? skip,
      lines_returned: snapshot.lines_returned ?? text.split("\n").length,
      has_more_older: snapshot.has_more_older ?? false,
      next_skip_lines: snapshot.next_skip_lines ?? null,
    },
  };
}

function truncateCapturedTerminalText(text: string): string {
  const { text: trimmed } = truncateText(text.trim(), CANVAS_TERMINAL_CAPTURE_MAX_CHARS);
  return trimmed;
}

/** On-demand terminal text for `extract-text` (tmux capture; no live xterm required). */
export async function extractCanvasTerminalText(
  shape: CanvasTerminalShape,
  options?: { skipFromBottom?: number },
): Promise<CanvasTerminalCaptureResult> {
  const meta = formatCanvasTerminalMetadata(shape);
  try {
    const { text: screen, page } = await captureCanvasTerminalScreenText(shape, null, options);
    if (!screen.trim()) {
      return { text: meta, page };
    }
    return { text: `${meta}\n\n${screen}`, page };
  } catch (err) {
    const message = err instanceof Error ? err.message : "capture failed";
    return {
      text: `${meta}\n\n[capture failed: ${message}]`,
      page: {
        skip_lines: options?.skipFromBottom ?? 0,
        lines_returned: 0,
        has_more_older: false,
        next_skip_lines: null,
      },
    };
  }
}

export async function formatCanvasTerminalForCopy(
  shape: CanvasTerminalShape,
  terminalRef: TerminalRef | null | undefined,
): Promise<string> {
  const meta = formatCanvasTerminalMetadata(shape);
  try {
    const { text: screen } = await captureCanvasTerminalScreenText(shape, terminalRef);
    if (!screen.trim()) {
      return meta;
    }
    return `${meta}\n\n\`\`\`\n${screen}\n\`\`\``;
  } catch {
    return `${meta}\n\n_(Could not capture tmux pane; activate the terminal or try again.)_`;
  }
}
