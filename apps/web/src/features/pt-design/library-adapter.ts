import {
  CATALOG_VERSION,
  persistFromLibraryBody,
  type DesignLibrary,
  type PtPersistV2,
} from "@atmos/pt-design";
import { ptDesignApi } from "@/api/rest-api";

function libraryFileBody(persist: PtPersistV2) {
  return {
    format: "pt-design-file/1",
    revision: 0,
    catalogVersion: CATALOG_VERSION,
    excalidrawCompat: "0.18",
    ptx: persist.ptx,
    canvas: persist.canvas,
    files: persist.files,
    settings: persist.settings,
  };
}

export function httpDesignLibrary(): DesignLibrary {
  return {
    async list() {
      const listed = await ptDesignApi.listDocuments();
      return listed.items.map((item) => ({
        name: item.name,
        modifiedAt: item.modified_at,
      }));
    },
    async load(name) {
      const doc = await ptDesignApi.getDocument(name);
      return { name: doc.name, persist: persistFromLibraryBody(doc.body) };
    },
    async save(name, persist) {
      const saved = await ptDesignApi.putDocument(name, libraryFileBody(persist), { overwrite: true });
      return { name: saved.name };
    },
  };
}
