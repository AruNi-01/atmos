export type ToolName =
  | "pt_ptx_get"
  | "pt_ptx_apply"
  | "pt_catalog_list"
  | "pt_screenshot"
  | "pt_doc_init"
  | "pt_doc_open"
  | "pt_doc_save"
  | "pt_tools_list";

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
    description: "List catalog types with xmlExample, agentDescription, and defaultBBox.",
    args: "",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_ptx_get",
    cli: ["ptx", "get"],
    title: "Get PTX",
    description: "Read the pretty PTX source (live extract or the open .ptd document.ptx).",
    args: "",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_ptx_apply",
    cli: ["ptx", "apply"],
    title: "Apply PTX",
    description: "Replace the document from a complete PTX string. Invalid PTX leaves the document unchanged.",
    args: "ptx",
    live: true,
  },
  {
    name: "pt_screenshot",
    cli: ["screenshot"],
    title: "Screenshot",
    description: "Capture a PNG of nodes or the whole live board. Only works on the open Prototype Design tab.",
    args: "nodeIds?, maxEdge?: 1024",
    readOnly: true,
    idempotent: true,
    live: true,
  },
  {
    name: "pt_doc_init",
    cli: ["doc", "init"],
    title: "Init design file",
    description: "Create a .ptd directory with document.ptx. Offline CLI/MCP only.",
    args: "path",
    live: false,
  },
  {
    name: "pt_doc_open",
    cli: ["doc", "open"],
    title: "Open design file",
    description: "Open a .ptd bundle (document.ptx). Offline CLI/MCP only.",
    args: "path, create?: boolean",
    readOnly: true,
    idempotent: true,
    live: false,
  },
  {
    name: "pt_doc_save",
    cli: ["doc", "save"],
    title: "Save design file",
    description: "Write the bound .ptd document.ptx. Offline CLI/MCP only.",
    args: "path?",
    idempotent: true,
    live: false,
  },
];

export function allToolDefs(): ToolDef[] {
  return PT_DESIGN_TOOL_DEFS;
}

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
