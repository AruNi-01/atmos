/** Opaque nested objects — web owns mosaic / space / saved-layout shape. */
export type CenterLayoutDocument = {
  version: number;
  updated_at: number;
  spaces: Record<string, unknown>;
  mosaics: Record<string, unknown>;
  saved_layouts: unknown[];
  overview_tabs: Record<string, boolean>;
  terminals?: Record<string, unknown>;
};

export type CenterLayoutPutRequest = {
  document: CenterLayoutDocument;
};

export type CenterLayoutPutResponse = {
  ok: boolean;
  updated_at: number;
};
