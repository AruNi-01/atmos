import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CATALOG_VERSION } from "../catalog/shadcn-list";
import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import { emptyScene, type PtScene } from "./types";

export { emptyScene };

export const FILE_FORMAT = "pt-design-file/1" as const;
export const EXCALIDRAW_COMPAT = "0.18";

export type PtDesignFile = {
  format: typeof FILE_FORMAT;
  revision: number;
  catalogVersion: string;
  excalidrawCompat: string;
  scene: PtScene;
};

export function initDesignDocument(path: string): PtDesignFile {
  const abs = resolve(path);
  if (existsSync(abs)) {
    return openDesignDocument(abs);
  }
  const doc: PtDesignFile = {
    format: FILE_FORMAT,
    revision: 0,
    catalogVersion: CATALOG_VERSION,
    excalidrawCompat: EXCALIDRAW_COMPAT,
    scene: emptyScene(),
  };
  saveDesignDocument(abs, doc);
  return doc;
}

export function openDesignDocument(path: string): PtDesignFile {
  const abs = resolve(path);
  if (!existsSync(abs)) {
    throw new PtDesignError(PT_ERROR_CODES.MISSING_FILE, `Design file not found: ${abs}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    throw new PtDesignError(PT_ERROR_CODES.INVALID_FILE, `Invalid JSON: ${abs}`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PtDesignError(PT_ERROR_CODES.INVALID_FILE, "Design file is not an object");
  }
  const rec = parsed as Record<string, unknown>;
  if (rec.format !== FILE_FORMAT) {
    throw new PtDesignError(
      PT_ERROR_CODES.INVALID_FILE,
      `Expected format ${FILE_FORMAT}`,
    );
  }
  const scene = rec.scene as PtScene | undefined;
  if (!scene || !Array.isArray(scene.elements)) {
    throw new PtDesignError(PT_ERROR_CODES.INVALID_FILE, "Missing scene.elements");
  }
  return {
    format: FILE_FORMAT,
    revision: typeof rec.revision === "number" ? rec.revision : 0,
    catalogVersion: String(rec.catalogVersion ?? CATALOG_VERSION),
    excalidrawCompat: String(rec.excalidrawCompat ?? EXCALIDRAW_COMPAT),
    scene: {
      elements: scene.elements,
      appState: scene.appState ?? { viewBackgroundColor: "#ffffff" },
    },
  };
}

export function saveDesignDocument(path: string, doc: PtDesignFile): PtDesignFile {
  const abs = resolve(path);
  mkdirSync(dirname(abs), { recursive: true });
  const next: PtDesignFile = {
    ...doc,
    format: FILE_FORMAT,
    revision: doc.revision + 1,
  };
  const tmp = `${abs}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(tmp, abs);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      // write may have failed before the tmp existed
    }
    throw error;
  }
  return next;
}
