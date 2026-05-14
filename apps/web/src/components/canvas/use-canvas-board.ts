"use client";

import { useCallback, useEffect, useState } from "react";
import type { TLEditorSnapshot } from "tldraw";
import { canvasApi, type CanvasBoardResponse } from "@/api/rest-api";
import { normalizeCanvasTerminalShapePropsInDocument } from "./canvas-terminal-shape";

const CANVAS_SCHEMA = "canvas.v1";
const CANVAS_BOARD_SLUG = "default";
const SESSION_SNAPSHOT_VERSION = 0;

export type CanvasTldrawDocument = TLEditorSnapshot["document"];
export type CanvasTldrawSession = TLEditorSnapshot["session"];

export interface CanvasBoardDocument {
  schema: typeof CANVAS_SCHEMA;
  boardSlug: typeof CANVAS_BOARD_SLUG;
  tldrawDocument: CanvasTldrawDocument | null;
}

export function createDefaultDocument(): CanvasBoardDocument {
  return {
    schema: CANVAS_SCHEMA,
    boardSlug: CANVAS_BOARD_SLUG,
    tldrawDocument: null,
  };
}

export function createDefaultCanvasSession(): CanvasTldrawSession {
  return {
    version: SESSION_SNAPSHOT_VERSION,
  } as CanvasTldrawSession;
}

export function createCanvasSnapshot(
  document: CanvasTldrawDocument | null,
  session?: CanvasTldrawSession | null,
): TLEditorSnapshot | null {
  if (!document) {
    return null;
  }

  return {
    document: normalizeCanvasTerminalShapePropsInDocument(document),
    session: session ?? createDefaultCanvasSession(),
  };
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStoredTldrawDocument(value: unknown): CanvasTldrawDocument | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainJsonObject(value)) {
    throw new Error("Canvas tldraw document must be a JSON object when present");
  }
  return value as unknown as CanvasTldrawDocument;
}

function parseLegacyStoredSnapshot(value: unknown): CanvasTldrawDocument | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlainJsonObject(value)) {
    throw new Error("Canvas tldraw snapshot must be a JSON object when present");
  }
  if (!isPlainJsonObject(value.document)) {
    throw new Error("Canvas tldraw snapshot must include a document object");
  }
  return value.document as unknown as CanvasTldrawDocument;
}

export function parseBoardDocument(documentJson: string): CanvasBoardDocument {
  let parsed: Partial<CanvasBoardDocument> & {
    tldrawSnapshot?: unknown;
    tldrawDocument?: unknown;
  };

  try {
    parsed = JSON.parse(documentJson) as Partial<CanvasBoardDocument> & {
      tldrawSnapshot?: unknown;
      tldrawDocument?: unknown;
    };
  } catch (error) {
    throw new Error(
      `The saved Canvas board contains invalid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The saved Canvas board must be a JSON object");
  }

  if (parsed.schema !== CANVAS_SCHEMA) {
    throw new Error(`Unsupported Canvas schema: ${String(parsed.schema ?? "(missing)")}`);
  }

  if (parsed.boardSlug !== CANVAS_BOARD_SLUG) {
    throw new Error(`Unsupported Canvas board slug: ${String(parsed.boardSlug ?? "(missing)")}`);
  }

  return {
    schema: CANVAS_SCHEMA,
    boardSlug: CANVAS_BOARD_SLUG,
    tldrawDocument:
      "tldrawDocument" in parsed
        ? parseStoredTldrawDocument(parsed.tldrawDocument)
        : parseLegacyStoredSnapshot(parsed.tldrawSnapshot),
  };
}

function stringifyBoardDocument(document: CanvasBoardDocument): string {
  return JSON.stringify(document);
}

export function useCanvasBoard() {
  const [board, setBoard] = useState<CanvasBoardResponse | null>(null);
  const [document, setDocument] = useState<CanvasBoardDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextBoard = await canvasApi.getDefaultBoard();
      setDocument(parseBoardDocument(nextBoard.document_json));
      setBoard(nextBoard);
    } catch (err) {
      setDocument(null);
      setError(err instanceof Error ? err.message : "Failed to load canvas");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveDocument = useCallback(async (nextDocument: CanvasBoardDocument) => {
    setIsSaving(true);
    setError(null);
    try {
      const nextBoard = await canvasApi.updateDefaultBoard(stringifyBoardDocument(nextDocument));
      setDocument(parseBoardDocument(nextBoard.document_json));
      setBoard(nextBoard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save canvas");
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  return {
    board,
    document,
    isLoading,
    isSaving,
    error,
    loadBoard,
    saveDocument,
  };
}
