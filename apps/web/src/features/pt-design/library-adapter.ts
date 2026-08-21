import { CATALOG_VERSION, type DesignLibrary, type PtScene } from "@atmos/pt-design";
import { ptDesignApi } from "@/api/rest-api";

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
      const scene = doc.body?.scene as PtScene | undefined;
      if (!scene || !Array.isArray(scene.elements)) {
        throw new Error("That file has no scene.");
      }
      return { name: doc.name, scene };
    },
    async save(name, scene) {
      const saved = await ptDesignApi.putDocument(
        name,
        {
          format: "pt-design-file/1",
          revision: 0,
          catalogVersion: CATALOG_VERSION,
          excalidrawCompat: "0.18",
          scene,
        },
        { overwrite: true },
      );
      return { name: saved.name };
    },
  };
}
