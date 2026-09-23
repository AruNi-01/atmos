import { listPtDesignDocs } from "@atmos/pt-design/catalog";
import { globalKey, readJson, removeKey, writeJson } from "@/shared/lib/browser-store";

const lastOpenKey = (scope: string) => globalKey(`pt-design-last-open:${scope}`);

export function readPtDesignLastOpen(scope: string): string | null {
  const stored = readJson<unknown>(lastOpenKey(scope), null);
  return typeof stored === "string" && stored.trim() ? stored : null;
}

export function writePtDesignLastOpen(scope: string, designId: string | null): void {
  if (!designId) {
    removeKey(lastOpenKey(scope));
    return;
  }
  writeJson(lastOpenKey(scope), designId);
}

export function ptDesignDocExists(id: string): boolean {
  return listPtDesignDocs().some((doc) => doc.id === id);
}

/**
 * URL `design` is dropped when the launchpad route or workspace paint changes.
 * Keep the last canvas per surface, and let an explicit empty memory (Back)
 * stay on the file list.
 */
export function resolvePtDesignOpenTarget(input: {
  urlDesign: string | null;
  stored: string | null;
  scopeChanged: boolean;
  docExists: (id: string) => boolean;
}): { design: string | null; persist: string | null } {
  const stored = input.stored && input.docExists(input.stored) ? input.stored : null;
  if (input.scopeChanged) {
    return { design: stored, persist: stored };
  }
  if (input.urlDesign) {
    const url = input.docExists(input.urlDesign) ? input.urlDesign : null;
    return { design: url, persist: url };
  }
  return { design: stored, persist: stored };
}
