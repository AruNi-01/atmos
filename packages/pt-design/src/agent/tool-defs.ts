export type ToolName =
  | "pt_catalog_list"
  | "pt_ir_get"
  | "pt_scene_get"
  | "pt_place"
  | "pt_update"
  | "pt_delete"
  | "pt_frame_create"
  | "pt_frame_rename"
  | "pt_frame_update"
  | "pt_frame_delete"
  | "pt_frames_list"
  | "pt_apply_ir"
  | "pt_export"
  | "pt_handoff"
  | "pt_doc_init"
  | "pt_doc_open"
  | "pt_doc_save"
  | "pt_tools_list"
  | "pt_batch"
  | "pt_layout_row"
  | "pt_layout_column"
  | "pt_layout_grid"
  | "pt_lint"
  | "pt_screenshot";

export type ToolDef = {
  name: ToolName;
  cli: string[];
  title: string;
  description: string;
  args: string;
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  /** False for file-only doc tools. Live board HTTP rejects those. */
  live?: boolean;
};

export const PT_DESIGN_TOOL_DEFS: ToolDef[] = [
  {
    name: "pt_tools_list",
    cli: ["tools", "list"],
    title: "List tools",
    description: "List PT Design tools with argument summaries. Call this if a tool name is unknown.",
    args: "",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_catalog_list",
    cli: ["catalog", "list"],
    title: "List catalog",
    description:
      "List placeable wireframe types with label, kind, variants, propKeys, defaultVariant, and defaultBBox.",
    args: "kind?: basic|block",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_ir_get",
    cli: ["ir", "get"],
    title: "Get Design IR",
    description: "Read the structured Design IR (scene coordinates). Call before update/layout.",
    args: "frameId?, instanceIds?",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_scene_get",
    cli: ["scene", "get"],
    title: "Get scene",
    description: "Read the raw Excalidraw-compatible scene JSON. Prefer pt_ir_get.",
    args: "",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_place",
    cli: ["place"],
    title: "Place component",
    description:
      "Place one catalog instance. at is relative to the frame origin when frameId is set. Use below/rightOf instead of hand-computed coordinates. Omit variant to place a single default (overlay trigger). mode=showcase dumps every variant — catalog UI only.",
    args: "componentType, at?: {x,y}, below?: instanceId|{instanceId,gap}, rightOf?: same, props?, variant?, size?, frameId?, mode?: single|showcase",
    live: true,
  },
  {
    name: "pt_update",
    cli: ["update"],
    title: "Update component",
    description: "Update props, variant, size, scene bbox, or frame membership of an instance.",
    args: "instanceId, props?, variant?, size?, bbox?: {x,y,w,h}, frameId?",
    idempotent: true,
    live: true,
  },
  {
    name: "pt_delete",
    cli: ["delete"],
    title: "Delete instances",
    description: "Delete one or more component instances by id.",
    args: "instanceId? | instanceIds[]",
    destructive: true,
    live: true,
  },
  {
    name: "pt_frame_create",
    cli: ["frame", "create"],
    title: "Create frame",
    description: "Create a named artboard. Prefer preset desktop/tablet/mobile over the 400×300 default.",
    args: "name?, x?, y?, w?, h?, preset?: desktop|tablet|mobile",
    live: true,
  },
  {
    name: "pt_frame_rename",
    cli: ["frame", "rename"],
    title: "Rename frame",
    description: "Rename a frame by id or unique name.",
    args: "frameId, name",
    idempotent: true,
    live: true,
  },
  {
    name: "pt_frame_update",
    cli: ["frame", "update"],
    title: "Update frame",
    description: "Move or resize a frame. Children move with the frame origin.",
    args: "frameId, name?, x?, y?, w?, h?",
    idempotent: true,
    live: true,
  },
  {
    name: "pt_frame_delete",
    cli: ["frame", "delete"],
    title: "Delete frame",
    description: "Delete a frame and its instances. orphan:true keeps nodes as free nodes.",
    args: "frameId, orphan?: boolean",
    destructive: true,
    live: true,
  },
  {
    name: "pt_frames_list",
    cli: ["frame", "list"],
    title: "List frames",
    description: "List frames with id, name, and bbox.",
    args: "",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_layout_row",
    cli: ["layout", "row"],
    title: "Layout row",
    description: "Place instances in a horizontal row from the first item's origin.",
    args: "instanceIds[], gap?: 16, align?: start|center|end",
    live: true,
  },
  {
    name: "pt_layout_column",
    cli: ["layout", "column"],
    title: "Layout column",
    description: "Place instances in a vertical column from the first item's origin.",
    args: "instanceIds[], gap?: 16, align?: start|center|end",
    live: true,
  },
  {
    name: "pt_layout_grid",
    cli: ["layout", "grid"],
    title: "Layout grid",
    description: "Place instances in a row-major grid from the first item's origin.",
    args: "instanceIds[], columns, gap?: 24, rowGap?: 24",
    live: true,
  },
  {
    name: "pt_lint",
    cli: ["lint"],
    title: "Lint layout",
    description: "Report overlap, overflow, empty frames, free nodes, and likely text clipping.",
    args: "frameId?",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_screenshot",
    cli: ["screenshot"],
    title: "Screenshot",
    description:
      "Capture a PNG of a frame, instances, or the whole live board. Only works on the open Prototype Design tab.",
    args: "frameId?, instanceIds?, maxEdge?: 1024",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_batch",
    cli: ["batch"],
    title: "Batch tools",
    description:
      "Run several tools in one call. atomic (default true) rolls the scene back if any op fails.",
    args: "ops: [{tool, args}][], atomic?: true",
    live: true,
  },
  {
    name: "pt_apply_ir",
    cli: ["apply-ir"],
    title: "Apply Design IR",
    description: "Merge or replace the scene from a Design IR document. Not the drawing API — use pt_place / pt_batch.",
    args: "ir, mode?: merge|replace, dryRun?: boolean",
    destructive: true,
    live: true,
  },
  {
    name: "pt_export",
    cli: ["export"],
    title: "Export",
    description: "Export IR plus scene. Image export is null until a host provides it.",
    args: "",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_handoff",
    cli: ["handoff"],
    title: "Build handoff",
    description: "Build an implementer handoff payload (IR + instructions).",
    args: "scope?: selection|frame|document, frameId?, instanceIds?, prompt?",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_doc_init",
    cli: ["doc", "init"],
    title: "Init design file",
    description: "Create a .ptdesign.json file and bind the session to it. Offline CLI/MCP only.",
    args: "file",
    live: false,
  },
  {
    name: "pt_doc_open",
    cli: ["doc", "open"],
    title: "Open design file",
    description: "Open an existing .ptdesign.json into the session. Offline CLI/MCP only.",
    args: "file, create?: boolean",
    readOnly: true,
    idempotent: true,
    live: false,
  },
  {
    name: "pt_doc_save",
    cli: ["doc", "save"],
    title: "Save design file",
    description: "Write the current scene to the bound file. Offline CLI/MCP only.",
    args: "file?",
    idempotent: true,
    live: false,
  },
];

export function toolNameFromCli(tokens: string[]): ToolName | undefined {
  const key = tokens.join(" ");
  return PT_DESIGN_TOOL_DEFS.find((d) => d.cli.join(" ") === key)?.name;
}

export function liveBoardToolNames(): ToolName[] {
  return PT_DESIGN_TOOL_DEFS.filter((d) => d.live !== false).map((d) => d.name);
}

export function unknownToolMessage(name: string): string {
  return `Unknown tool: ${name}. Tools: ${PT_DESIGN_TOOL_DEFS.map((d) => d.name).join(", ")}`;
}

export function usageMessage(name: ToolName, message: string): string {
  const def = PT_DESIGN_TOOL_DEFS.find((d) => d.name === name);
  return def?.args ? `${message}. Args: ${def.args}` : message;
}
