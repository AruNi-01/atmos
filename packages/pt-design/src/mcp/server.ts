import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openFileSession, runTool, type FileSession } from "../agent/api";
import { PtDesignError } from "../protocol";
import { PT_DESIGN_TOOL_DEFS, unknownToolMessage, type ToolName } from "../agent/tool-defs";
import { PT_TOOL_SCHEMAS } from "./schemas";
import { toolError, toolSuccess, type ResponseFormat, type ToolResult } from "./format";
import { isMutatingTool } from "../agent/mutating";
import { requireOfflineFile } from "../agent/file-required";
import { resolveCollaboratorName } from "../collab/names";

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

Read document.ptx (or pt_ptx_get), edit the XML, write it back (pt_ptx_apply or save the file). Do not invent Excalidraw JSON.

Error handling:
  - unknown_tool — old APP-062 names are not registered; call pt_tools_list
  - unknown_type — use an id from pt_catalog_list
  - invalid_ptx / invalid_option — previous document is unchanged
  - missing_file — pass --file for an offline .ptd
  - Open board — POST /api/pt-design/agent/invoke; do not join a collaboration room`;
}

export function executeTool(fs: FileSession, name: string, raw: Record<string, unknown>): ToolResult {
  if (!(name in PT_TOOL_SCHEMAS)) {
    return toolError(new PtDesignError("unknown_tool", unknownToolMessage(name)));
  }
  const parsed = PT_TOOL_SCHEMAS[name as ToolName].safeParse(raw);
  if (!parsed.success) {
    return toolError(
      new PtDesignError(
        name === "pt_ptx_apply" ? "invalid_ptx" : "unknown_tool",
        parsed.error.issues.map((issue) => issue.message).join("; "),
      ),
    );
  }
  const args = parsed.data as Record<string, unknown>;
  const format = (typeof args.response_format === "string" ? args.response_format : "json") as ResponseFormat;
  try {
    requireOfflineFile(fs, name);
    const data = runTool(fs, { name, args });
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
        if (!result.isError && isMutatingTool(def.name)) {
          void sdk.server.sendLoggingMessage({
            level: "info",
            logger: "pt-design",
            data: {
              tool: def.name,
              label: resolveCollaboratorName("agent"),
            },
          });
          void sdk.server.sendResourceUpdated({ uri: "pt-design://ptx" });
        }
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
      description: "Catalog types with XML examples.",
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
    "ptx",
    "pt-design://ptx",
    {
      title: "PTX source",
      description: "Current document.ptx.",
      mimeType: "application/xml",
    },
    async (uri) => {
      const data = runTool(facade.fs, { name: "pt_ptx_get", args: {} }) as { ptx: string };
      return {
        contents: [
          {
            uri: String(uri),
            mimeType: "application/xml",
            text: data.ptx,
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
