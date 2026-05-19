import type { Editor, TLShape, TLShapePartial } from "tldraw";

import { CanvasAgentError, isTldrawValidationError } from "./canvas-agent-errors";
import { finalizeShapeForStore } from "./canvas-agent-shape-patch";

export function validateShapeUpdate(editor: Editor, before: TLShape, partial: TLShapePartial): void {
  const updated = finalizeShapeForStore(editor, before, partial);
  validateShapeRecord(editor, updated, "updateRecord", before);
}

export function validateShapeRecord(
  editor: Editor,
  record: TLShape,
  phase: "createRecord" | "updateRecord",
  recordBefore: TLShape | null,
): void {
  const validate = editor.store?.schema?.validateRecord;
  if (typeof validate !== "function") {
    return;
  }
  try {
    validate(editor.store, record, phase, recordBefore);
  } catch (err) {
    if (err instanceof CanvasAgentError) throw err;
    const message = isTldrawValidationError(err)
      ? err instanceof Error
        ? err.message
        : String(err)
      : err instanceof Error
        ? err.message
        : String(err);
    throw new CanvasAgentError("VALIDATION_ARG", message, true);
  }
}
