"use client";

import { useCallback, useEffect, useState } from "react";
import type { TLEditorSnapshot } from "tldraw";
import { terminalCanvasApi, type TerminalCanvasBoardResponse } from "@/api/rest-api";

const TERMINAL_CANVAS_SCHEMA = "terminal-canvas.v1";
const TERMINAL_CANVAS_BOARD_SLUG = "default";

export interface TerminalCanvasBoardDocument {
  schema: typeof TERMINAL_CANVAS_SCHEMA;
  boardSlug: typeof TERMINAL_CANVAS_BOARD_SLUG;
  tldrawSnapshot: TLEditorSnapshot | null;
}

export function createDefaultDocument(): TerminalCanvasBoardDocument {
  return {
    schema: TERMINAL_CANVAS_SCHEMA,
    boardSlug: TERMINAL_CANVAS_BOARD_SLUG,
    tldrawSnapshot: null,
  };
}

export function parseBoardDocument(documentJson: string): TerminalCanvasBoardDocument {
  let parsed: Partial<TerminalCanvasBoardDocument>;

  try {
    parsed = JSON.parse(documentJson) as Partial<TerminalCanvasBoardDocument>;
  } catch (error) {
    throw new Error(
      `The saved Terminal Canvas board contains invalid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("The saved Terminal Canvas board must be a JSON object");
  }

  if (parsed.schema !== TERMINAL_CANVAS_SCHEMA) {
    throw new Error(`Unsupported Terminal Canvas schema: ${String(parsed.schema ?? "(missing)")}`);
  }

  if (parsed.boardSlug !== TERMINAL_CANVAS_BOARD_SLUG) {
    throw new Error(`Unsupported Terminal Canvas board slug: ${String(parsed.boardSlug ?? "(missing)")}`);
  }

  return {
    schema: TERMINAL_CANVAS_SCHEMA,
    boardSlug: TERMINAL_CANVAS_BOARD_SLUG,
    tldrawSnapshot: parsed.tldrawSnapshot ?? null,
  };
}

function stringifyBoardDocument(document: TerminalCanvasBoardDocument): string {
  return JSON.stringify(document);
}

export function useTerminalCanvasBoard() {
  const [board, setBoard] = useState<TerminalCanvasBoardResponse | null>(null);
  const [document, setDocument] = useState<TerminalCanvasBoardDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const nextBoard = await terminalCanvasApi.getDefaultBoard();
      setDocument(parseBoardDocument(nextBoard.document_json));
      setBoard(nextBoard);
    } catch (err) {
      setDocument(null);
      setError(err instanceof Error ? err.message : "Failed to load terminal canvas");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveDocument = useCallback(async (nextDocument: TerminalCanvasBoardDocument) => {
    setDocument(nextDocument);
    setIsSaving(true);
    setError(null);
    try {
      const nextBoard = await terminalCanvasApi.updateDefaultBoard(stringifyBoardDocument(nextDocument));
      setBoard(nextBoard);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save terminal canvas");
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
