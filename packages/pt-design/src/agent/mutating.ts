const MUTATING = new Set(["pt_ptx_apply", "pt_doc_init", "pt_doc_open", "pt_doc_save"]);

export function isMutatingTool(name: string): boolean {
  return MUTATING.has(name);
}
