"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TLEditorSnapshot } from "tldraw";
import {
  canvasApi,
  type AtmosCanvasFile,
  type AtmosCanvasScript,
  type CanvasDocumentListItem,
} from "@/api/rest-api";
import type { CanvasTldrawDocument, CanvasTldrawSession } from "@/shared/types/canvas";
import {
  DEFAULT_PIN_DOCUMENT_FILE,
  readActiveCanvasDocumentFileName,
  writeActiveCanvasDocumentFileName,
} from "../lib/canvas-document-prefs";
import { normalizeCanvasTerminalShapePropsInDocument } from "../lib/canvas-terminal-shape";
import { normalizeCanvasWidgetShapePropsInDocument } from "../lib/canvas-widget-shape";

export const ATMOS_CANVAS_FILE_SCHEMA = "atmos-canvas-file.1";
const SESSION_SNAPSHOT_VERSION = 0;

/** In-memory / on-disk document payload (APP-037 + document scripts). */
export interface CanvasBoardDocument {
  schema: typeof ATMOS_CANVAS_FILE_SCHEMA;
  title: string;
  tldrawDocument: CanvasTldrawDocument | null;
  session?: CanvasTldrawSession | null;
  script?: AtmosCanvasScript | null;
}

export function createDefaultDocument(title = "Untitled"): CanvasBoardDocument {
  return {
    schema: ATMOS_CANVAS_FILE_SCHEMA,
    title,
    tldrawDocument: null,
    session: null,
    script: null,
  };
}

export function createDefaultCanvasSession(): CanvasTldrawSession {
  return {
    version: SESSION_SNAPSHOT_VERSION,
    isGridMode: true,
  } as CanvasTldrawSession;
}

/** tldraw stores show-grid on `snapshot.session.isGridMode` (no separate Tldraw prop). */
export function resolveCanvasSessionForLoad(
  session?: CanvasTldrawSession | null,
): CanvasTldrawSession {
  if (!session || typeof session !== "object") {
    return createDefaultCanvasSession();
  }

  if (session.isGridMode === false) {
    return session;
  }

  return { ...session, isGridMode: true };
}

export function createCanvasSnapshot(
  document: CanvasTldrawDocument | null,
  session?: CanvasTldrawSession | null,
): TLEditorSnapshot | null {
  if (!document) {
    return null;
  }

  return {
    document: normalizeCanvasWidgetShapePropsInDocument(
      normalizeCanvasTerminalShapePropsInDocument(document),
    ),
    session: resolveCanvasSessionForLoad(session),
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

export function parseAtmosCanvasFile(body: AtmosCanvasFile): CanvasBoardDocument {
  if (body.schema !== ATMOS_CANVAS_FILE_SCHEMA) {
    throw new Error(`Unsupported Canvas schema: ${String(body.schema ?? "(missing)")}`);
  }
  if (!body.title?.trim()) {
    throw new Error("Canvas document title is required");
  }
  return {
    schema: ATMOS_CANVAS_FILE_SCHEMA,
    title: body.title,
    tldrawDocument: parseStoredTldrawDocument(body.tldrawDocument ?? null),
    session: (body.session as CanvasTldrawSession | null | undefined) ?? null,
    script: body.script ?? null,
  };
}

/** @deprecated Use parseAtmosCanvasFile — kept for callers still holding a JSON string. */
export function parseBoardDocument(documentJson: string): CanvasBoardDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(documentJson);
  } catch (error) {
    throw new Error(
      `The saved Canvas board contains invalid JSON${error instanceof Error ? `: ${error.message}` : ""}`,
    );
  }
  if (!isPlainJsonObject(parsed)) {
    throw new Error("The saved Canvas board must be a JSON object");
  }
  return parseAtmosCanvasFile(parsed as AtmosCanvasFile);
}

export function toAtmosCanvasFile(document: CanvasBoardDocument): AtmosCanvasFile {
  return {
    schema: ATMOS_CANVAS_FILE_SCHEMA,
    title: document.title,
    tldrawDocument: document.tldrawDocument,
    session: document.session ?? undefined,
    script: document.script ?? undefined,
  };
}

/**
 * Load the document used for pin-to-canvas / cleanup when Canvas UI may be closed.
 * Prefer active preference; fall back to Default.atmos.tldr (create empty if missing).
 */
export async function loadPinTargetDocument(): Promise<{
  fileName: string;
  document: CanvasBoardDocument;
}> {
  const preferred = readActiveCanvasDocumentFileName();
  const candidates = preferred
    ? [preferred, DEFAULT_PIN_DOCUMENT_FILE]
    : [DEFAULT_PIN_DOCUMENT_FILE];

  for (const fileName of candidates) {
    try {
      const res = await canvasApi.getDocument(fileName);
      return { fileName: res.file_name, document: parseAtmosCanvasFile(res.body) };
    } catch {
      // try next
    }
  }

  const fileName = DEFAULT_PIN_DOCUMENT_FILE;
  const document = createDefaultDocument("Default");
  await canvasApi.putDocument(fileName, toAtmosCanvasFile(document));
  writeActiveCanvasDocumentFileName(fileName);
  return { fileName, document };
}

export async function savePinTargetDocument(
  fileName: string,
  document: CanvasBoardDocument,
): Promise<void> {
  await canvasApi.putDocument(fileName, toAtmosCanvasFile(document));
}

export function useCanvasBoard() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled");
  const [document, setDocument] = useState<CanvasBoardDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentList, setDocumentList] = useState<CanvasDocumentListItem[]>([]);
  const [canvasDir, setCanvasDir] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setDirty(true);
  }, []);

  const clearDirty = useCallback(() => {
    dirtyRef.current = false;
    setDirty(false);
  }, []);

  const refreshDocumentList = useCallback(async () => {
    try {
      const res = await canvasApi.listDocuments();
      setDocumentList(res.items);
      setCanvasDir(res.dir ?? null);
    } catch {
      setDocumentList([]);
    }
  }, []);

  const applyLoaded = useCallback(
    (nextFileName: string | null, nextDoc: CanvasBoardDocument) => {
      setFileName(nextFileName);
      setTitle(nextDoc.title);
      setDocument(nextDoc);
      writeActiveCanvasDocumentFileName(nextFileName);
      clearDirty();
    },
    [clearDirty],
  );

  const loadBoard = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      await refreshDocumentList();
      const active = readActiveCanvasDocumentFileName();
      if (active) {
        try {
          const res = await canvasApi.getDocument(active);
          applyLoaded(res.file_name, parseAtmosCanvasFile(res.body));
          return;
        } catch {
          writeActiveCanvasDocumentFileName(null);
        }
      }
      // Prefer untitled empty board on first open (PRD D5).
      applyLoaded(null, createDefaultDocument("Untitled"));
    } catch (err) {
      setDocument(null);
      setError(err instanceof Error ? err.message : "Failed to load canvas");
    } finally {
      setIsLoading(false);
    }
  }, [applyLoaded, refreshDocumentList]);

  const saveDocument = useCallback(
    async (nextDocument: CanvasBoardDocument, targetFileName?: string) => {
      const resolvedName = targetFileName ?? fileName;
      if (!resolvedName) {
        throw new Error("Save As requires a document name");
      }
      setIsSaving(true);
      setError(null);
      try {
        const payload = toAtmosCanvasFile({
          ...nextDocument,
          title: nextDocument.title || title,
        });
        const res = await canvasApi.putDocument(resolvedName, payload);
        // Same open file: do NOT replace `document.tldrawDocument` in React state.
        // Feeding a new snapshot into <Tldraw> remounts/reloads the editor (flash).
        const sameOpenFile = fileName != null && res.item.file_name === fileName;
        if (sameOpenFile) {
          setTitle(payload.title);
          writeActiveCanvasDocumentFileName(res.item.file_name);
          clearDirty();
          // Keep in-memory script/title in sync without swapping the live store snapshot.
          setDocument((prev) =>
            prev
              ? {
                  ...prev,
                  title: payload.title,
                  script: nextDocument.script ?? prev.script,
                  session: nextDocument.session ?? prev.session,
                }
              : prev,
          );
        } else {
          applyLoaded(res.item.file_name, {
            ...nextDocument,
            schema: ATMOS_CANVAS_FILE_SCHEMA,
            title: payload.title,
          });
        }
        await refreshDocumentList();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save canvas");
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [applyLoaded, clearDirty, fileName, refreshDocumentList, title],
  );

  const saveAs = useCallback(
    async (displayName: string, nextDocument: CanvasBoardDocument) => {
      const { file_name } = await canvasApi.sanitizeName(displayName);
      const titled = {
        ...nextDocument,
        title: displayName.trim() || nextDocument.title,
      };
      await saveDocument(titled, file_name);
    },
    [saveDocument],
  );

  const openDocument = useCallback(
    async (nextFileName: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await canvasApi.getDocument(nextFileName);
        applyLoaded(res.file_name, parseAtmosCanvasFile(res.body));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to open canvas document");
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [applyLoaded],
  );

  const newDocument = useCallback(() => {
    applyLoaded(null, createDefaultDocument("Untitled"));
  }, [applyLoaded]);

  const renameDocument = useCallback(
    async (targetFileName: string, displayName: string) => {
      const res = await canvasApi.renameDocument(targetFileName, displayName);
      if (fileName === targetFileName) {
        applyLoaded(res.item.file_name, {
          schema: ATMOS_CANVAS_FILE_SCHEMA,
          title: res.item.title,
          tldrawDocument: document?.tldrawDocument ?? null,
          session: document?.session ?? null,
        });
      }
      await refreshDocumentList();
    },
    [applyLoaded, document?.session, document?.tldrawDocument, fileName, refreshDocumentList],
  );

  const deleteDocumentFile = useCallback(
    async (targetFileName: string) => {
      await canvasApi.deleteDocument(targetFileName);
      if (fileName === targetFileName) {
        applyLoaded(null, createDefaultDocument("Untitled"));
      }
      await refreshDocumentList();
    },
    [applyLoaded, fileName, refreshDocumentList],
  );

  const duplicateDocumentFile = useCallback(
    async (targetFileName: string) => {
      await canvasApi.duplicateDocument(targetFileName);
      await refreshDocumentList();
    },
    [refreshDocumentList],
  );

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  /** Board identity for session prefs / pin memory — file name or synthetic untitled key. */
  const boardIdentity = fileName ?? "untitled";

  return {
    /** @deprecated use fileName / boardIdentity */
    board: fileName
      ? {
          guid: fileName,
          slug: fileName,
          name: title,
          document_json: "",
          updated_at: "",
        }
      : null,
    boardIdentity,
    fileName,
    title,
    document,
    dirty,
    isLoading,
    isSaving,
    error,
    documentList,
    canvasDir,
    loadBoard,
    saveDocument,
    saveAs,
    openDocument,
    newDocument,
    renameDocument,
    deleteDocumentFile,
    duplicateDocumentFile,
    markDirty,
    clearDirty,
    refreshDocumentList,
    setTitle,
    setDocument,
  };
}
