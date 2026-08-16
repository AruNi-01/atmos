export type ToolName =
  | "pt_catalog_list"
  | "pt_ir_get"
  | "pt_scene_get"
  | "pt_place"
  | "pt_update"
  | "pt_delete"
  | "pt_frame_create"
  | "pt_frame_rename"
  | "pt_frames_list"
  | "pt_apply_ir"
  | "pt_export"
  | "pt_handoff"
  | "pt_doc_init"
  | "pt_doc_open"
  | "pt_doc_save";

export type ToolDef = {
  name: ToolName;
  cli: string[];
  description: string;
  readOnly?: boolean;
  destructive?: boolean;
};

export const PT_DESIGN_TOOL_DEFS: ToolDef[] = [
  { name: "pt_catalog_list", cli: ["catalog", "list"], description: "List catalog types", readOnly: true },
  { name: "pt_ir_get", cli: ["ir", "get"], description: "Get Design IR", readOnly: true },
  { name: "pt_scene_get", cli: ["scene", "get"], description: "Get raw scene", readOnly: true },
  { name: "pt_place", cli: ["place"], description: "Place a component" },
  { name: "pt_update", cli: ["update"], description: "Update a component" },
  { name: "pt_delete", cli: ["delete"], description: "Delete instances", destructive: true },
  { name: "pt_frame_create", cli: ["frame", "create"], description: "Create a frame" },
  { name: "pt_frame_rename", cli: ["frame", "rename"], description: "Rename a frame" },
  { name: "pt_frames_list", cli: ["frame", "list"], description: "List frames", readOnly: true },
  { name: "pt_apply_ir", cli: ["apply-ir"], description: "Apply Design IR", destructive: true },
  { name: "pt_export", cli: ["export"], description: "Export IR bundle", readOnly: true },
  { name: "pt_handoff", cli: ["handoff"], description: "Build agent handoff payload", readOnly: true },
  { name: "pt_doc_init", cli: ["doc", "init"], description: "Create a design file" },
  { name: "pt_doc_open", cli: ["doc", "open"], description: "Open a design file", readOnly: true },
  { name: "pt_doc_save", cli: ["doc", "save"], description: "Save the design file" },
];

export function toolNameFromCli(tokens: string[]): ToolName | undefined {
  const key = tokens.join(" ");
  return PT_DESIGN_TOOL_DEFS.find((d) => d.cli.join(" ") === key)?.name;
}
