import { parsePtx, serializePtx } from "../protocol";
import type { PtDocument } from "../protocol";
import { readBundle, writeBundle } from "../protocol/bundle";

export type HeadlessSession = {
  getPtx(): string;
  applyPtx(xml: string): void;
  getDocument(): PtDocument;
  openDir(dir: string): void;
  saveDir(dir: string, canvas?: unknown): void;
};

function emptyDocument(): PtDocument {
  return { version: "ptx/1", pages: [{ id: "page", nodes: [] }] };
}

export function createHeadlessSession(initial?: { ptx?: string }): HeadlessSession {
  let document: PtDocument =
    initial?.ptx !== undefined ? parsePtx(initial.ptx) : emptyDocument();

  return {
    getPtx() {
      return serializePtx(document);
    },
    applyPtx(xml: string) {
      document = parsePtx(xml);
    },
    getDocument() {
      return document;
    },
    openDir(dir: string) {
      const { ptx } = readBundle(dir);
      document = parsePtx(ptx);
    },
    saveDir(dir: string, canvas?: unknown) {
      writeBundle(dir, { ptx: serializePtx(document), canvas });
    },
  };
}
