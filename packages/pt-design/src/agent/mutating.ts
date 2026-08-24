const MUTATING = new Set([
  "pt_place",
  "pt_update",
  "pt_delete",
  "pt_frame_create",
  "pt_frame_rename",
  "pt_frame_update",
  "pt_frame_delete",
  "pt_layout_row",
  "pt_layout_column",
  "pt_layout_grid",
  "pt_batch",
  "pt_apply_ir",
  "pt_doc_init",
  "pt_doc_open",
  "pt_doc_save",
  "file",
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING.has(name);
}
