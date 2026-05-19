import type { Editor } from "tldraw";

import {
  CanvasAgentError,
  formatUnknownError,
  isTldrawValidationError,
} from "./canvas-agent-errors";

/**
 * Run a tldraw mutation; map schema/validation throws to CanvasAgentError
 * so the CLI gets a recoverable response instead of crashing React.
 */
export function mutateEditor<T>(editor: Editor, fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof CanvasAgentError) throw err;
    if (isTldrawValidationError(err)) {
      throw new CanvasAgentError("VALIDATION_ARG", formatUnknownError(err), true);
    }
    throw err;
  }
}
