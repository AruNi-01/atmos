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
  title: string;
  description: string;
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
};

export const PT_DESIGN_TOOL_DEFS: ToolDef[] = [
  {
    name: "pt_catalog_list",
    cli: ["catalog", "list"],
    title: "List catalog",
    description: "List placeable wireframe types (id, label, variants, prop keys).",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_ir_get",
    cli: ["ir", "get"],
    title: "Get Design IR",
    description: "Read the structured Design IR. Call this before place/update/apply-ir.",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_scene_get",
    cli: ["scene", "get"],
    title: "Get scene",
    description: "Read the raw Excalidraw-compatible scene JSON.",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_place",
    cli: ["place"],
    title: "Place component",
    description: "Place a catalog component onto the scene at x,y.",
  },
  {
    name: "pt_update",
    cli: ["update"],
    title: "Update component",
    description: "Update props, variant, or size of an existing instance.",
    idempotent: true,
  },
  {
    name: "pt_delete",
    cli: ["delete"],
    title: "Delete instances",
    description: "Delete one or more component instances by id.",
    destructive: true,
  },
  {
    name: "pt_frame_create",
    cli: ["frame", "create"],
    title: "Create frame",
    description: "Create a named frame (artboard) with a bounding box.",
  },
  {
    name: "pt_frame_rename",
    cli: ["frame", "rename"],
    title: "Rename frame",
    description: "Rename a frame by id or unique name.",
    idempotent: true,
  },
  {
    name: "pt_frames_list",
    cli: ["frame", "list"],
    title: "List frames",
    description: "List frames with id, name, and bbox.",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_apply_ir",
    cli: ["apply-ir"],
    title: "Apply Design IR",
    description: "Merge or replace the scene from a Design IR document.",
    destructive: true,
  },
  {
    name: "pt_export",
    cli: ["export"],
    title: "Export",
    description: "Export IR plus scene. Image export is null until a host provides it.",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_handoff",
    cli: ["handoff"],
    title: "Build handoff",
    description: "Build an implementer handoff payload (IR + instructions).",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_doc_init",
    cli: ["doc", "init"],
    title: "Init design file",
    description: "Create a .ptdesign.json file and bind the session to it.",
  },
  {
    name: "pt_doc_open",
    cli: ["doc", "open"],
    title: "Open design file",
    description: "Open an existing .ptdesign.json into the session.",
    readOnly: true,
    idempotent: true,
  },
  {
    name: "pt_doc_save",
    cli: ["doc", "save"],
    title: "Save design file",
    description: "Write the current scene to the bound file.",
    idempotent: true,
  },
];

export function toolNameFromCli(tokens: string[]): ToolName | undefined {
  const key = tokens.join(" ");
  return PT_DESIGN_TOOL_DEFS.find((d) => d.cli.join(" ") === key)?.name;
}
