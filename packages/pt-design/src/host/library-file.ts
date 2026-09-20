import { parsePtPersistV2, type PtPersistV2 } from "./adapters";

const FILE_SUFFIX = /\.ptdesign\.json$/i;

export function libraryFileStem(name: string): string {
  return name.replace(FILE_SUFFIX, "");
}

export function shouldPromptLibraryName(boundFile: string | null | undefined): boolean {
  return !boundFile;
}

export function persistFromLibraryBody(body: unknown): PtPersistV2 {
  if (!body || typeof body !== "object") {
    throw new Error("That file has no document.");
  }
  const rec = body as Record<string, unknown>;
  const parsed = parsePtPersistV2(rec);
  if (parsed) return parsed;
  if (rec.scene && typeof rec.scene === "object") {
    return {
      ptx: typeof rec.ptx === "string" ? rec.ptx : "",
      canvas: rec.scene,
    };
  }
  throw new Error("That file has no document.");
}

/** First Save names the overview card from the file stem. */
export function namedPersistForLibrarySave(doc: PtPersistV2, rawName: string): PtPersistV2 {
  const name = libraryFileStem(rawName).trim();
  if (!name || !doc.meta) return doc;
  return {
    ...doc,
    meta: { ...doc.meta, name, updatedAt: Date.now() },
  };
}
