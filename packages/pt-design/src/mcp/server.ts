import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openFileSession, runTool, type FileSession } from "../agent/api";
import { PT_ERROR_CODES, PtDesignError } from "../agent/errors";
import { PT_DESIGN_TOOL_DEFS, type ToolName } from "../agent/tool-defs";
import { PT_TOOL_SCHEMAS } from "./schemas";
import { paginate, toolError, toolSuccess, type ResponseFormat, type ToolResult } from "./format";

export const MCP_SERVER_NAME = "pt-design-mcp-server";
export const MCP_SERVER_VERSION = "0.0.1";

export type PtMcpFacade = {
  listTools: () => Array<{
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint: boolean;
      idempotentHint: boolean;
      openWorldHint: boolean;
    };
  }>;
  callTool: (name: string, args: Record<string, unknown>) => ToolResult;
  fs: FileSession;
};

function annotationsFor(name: ToolName) {
  const def = PT_DESIGN_TOOL_DEFS.find((item) => item.name === name)!;
  return {
    readOnlyHint: Boolean(def.readOnly),
    destructiveHint: Boolean(def.destructive),
    idempotentHint: Boolean(def.idempotent),
    openWorldHint: false,
  };
}

function mcpDescription(def: (typeof PT_DESIGN_TOOL_DEFS)[number]): string {
  return `${def.description}

Get-before-set: call pt_catalog_list and pt_ir_get before mutating.

Error handling:
  - UNKNOWN_COMPONENT_TYPE — use an id from pt_catalog_list
  - NOT_FOUND / FRAME_AMBIGUOUS — copy ids from pt_ir_get / pt_frames_list
  - MISSING_FILE — pass file or start with --file`;
}

export function executeTool(fs: FileSession, name: string, raw: Record<string, unknown>): ToolResult {
  if (!(name in PT_TOOL_SCHEMAS)) {
    return toolError(new PtDesignError(PT_ERROR_CODES.USAGE, `Unknown tool: ${name}. Use tools/list.`));
  }
  const parsed = PT_TOOL_SCHEMAS[name as ToolName].safeParse(raw);
  if (!parsed.success) {
    return toolError(
      new PtDesignError(
        PT_ERROR_CODES.USAGE,
        parsed.error.issues.map((issue) => issue.message).join("; "),
      ),
    );
  }
  const args = parsed.data as Record<string, unknown>;
  const format = (typeof args.response_format === "string" ? args.response_format : "json") as ResponseFormat;
  try {
    let data = runTool(fs, { name: name as ToolName, args });
    if (name === "pt_catalog_list") {
      const page = paginate(
        (data as { items: unknown[] }).items,
        Number(args.offset ?? 0),
        Number(args.limit ?? 50),
      );
      data = page;
    }
    if (name === "pt_frames_list") {
      const page = paginate(
        (data as { frames: unknown[] }).frames,
        Number(args.offset ?? 0),
        Number(args.limit ?? 50),
      );
      data = { ...page, frames: page.items };
    }
    return toolSuccess(data, format);
  } catch (error) {
    return toolError(error);
  }
}

export function createMcpServer(options: { file?: string } = {}): PtMcpFacade {
  const fs = openFileSession({
    file: options.file,
    create: Boolean(options.file),
    autoSave: true,
  });

  return {
    fs,
    listTools() {
      return PT_DESIGN_TOOL_DEFS.map((def) => ({
        name: def.name,
        title: def.title,
        description: mcpDescription(def),
        inputSchema: z.toJSONSchema(PT_TOOL_SCHEMAS[def.name]) as Record<string, unknown>,
        annotations: annotationsFor(def.name),
      }));
    },
    callTool(name: string, args: Record<string, unknown>) {
      return executeTool(fs, name, args);
    },
  };
}

export function createSdkMcpServer(options: { file?: string } = {}): {
  sdk: McpServer;
  facade: PtMcpFacade;
} {
  const facade = createMcpServer(options);
  const sdk = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  for (const def of PT_DESIGN_TOOL_DEFS) {
    sdk.registerTool(
      def.name,
      {
        title: def.title,
        description: mcpDescription(def),
        inputSchema: PT_TOOL_SCHEMAS[def.name],
        annotations: annotationsFor(def.name),
      },
      async (params: Record<string, unknown>) => {
        const result = executeTool(facade.fs, def.name, params ?? {});
        return {
          isError: result.isError,
          content: result.content,
          ...(result.structuredContent ? { structuredContent: result.structuredContent } : {}),
        };
      },
    );
  }

  sdk.registerResource(
    "catalog",
    "pt-design://catalog",
    {
      title: "Component catalog",
      description: "All placeable wireframe types as JSON.",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = runTool(facade.fs, { name: "pt_catalog_list", args: {} });
      return {
        contents: [
          {
            uri: String(uri),
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  sdk.registerResource(
    "ir",
    "pt-design://ir",
    {
      title: "Design IR",
      description: "Current Design IR snapshot.",
      mimeType: "application/json",
    },
    async (uri) => {
      const data = runTool(facade.fs, { name: "pt_ir_get", args: {} });
      return {
        contents: [
          {
            uri: String(uri),
            mimeType: "application/json",
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    },
  );

  sdk.registerPrompt(
    "pt_design_handoff",
    {
      title: "Implement this wireframe",
      description: "Turn the current Design IR into an implementer brief.",
      argsSchema: {
        scope: z.enum(["selection", "frame", "document"]).optional(),
        frame: z.string().optional(),
      },
    },
    async ({ scope, frame }) => {
      const payload = runTool(facade.fs, {
        name: "pt_handoff",
        args: { scope: scope ?? "document", frame },
      });
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: JSON.stringify(payload, null, 2),
            },
          },
        ],
      };
    },
  );

  return { sdk, facade };
}

export async function serveMcpStdio(file?: string): Promise<void> {
  const { sdk } = createSdkMcpServer({ file });
  const transport = new StdioServerTransport();
  await sdk.connect(transport);
  console.error(`${MCP_SERVER_NAME} ${MCP_SERVER_VERSION} on stdio${file ? ` file=${file}` : ""}`);
}
