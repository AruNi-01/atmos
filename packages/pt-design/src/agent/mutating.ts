const MUTATING = new Set([
  "pt_place",
  "pt_update",
  "pt_delete",
  "pt_frame_create",
  "pt_frame_rename",
  "pt_apply_ir",
  "pt_doc_init",
  "pt_doc_open",
  "pt_doc_save",
  "file",
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING.has(name);
}

const LIVE_MUTATING = new Set([
  "pt_place",
  "pt_update",
  "pt_delete",
  "pt_frame_create",
  "pt_frame_rename",
  "pt_apply_ir",
]);

export function isLiveMutatingTool(name: string): boolean {
  return LIVE_MUTATING.has(name);
}
