import { openFileSession, runTool, type FileSession } from "../agent/api";
import { isPtDesignError, PT_ERROR_CODES } from "../agent/errors";
import { PT_DESIGN_TOOL_DEFS, type ToolName } from "../agent/tool-defs";

export function createMcpServer(options: { file?: string } = {}) {
  const fs: FileSession = openFileSession({
    file: options.file,
    create: Boolean(options.file),
    autoSave: true,
  });

  return {
    listTools() {
      return PT_DESIGN_TOOL_DEFS.map((def) => ({
        name: def.name,
        description: def.description,
        inputSchema: { type: "object", additionalProperties: true },
      }));
    },
    callTool(name: string, args: Record<string, unknown>) {
      try {
        const data = runTool(fs, { name: name as ToolName, args });
        return { isError: false, content: [{ type: "text", text: JSON.stringify(data) }], data };
      } catch (error) {
        const code = isPtDesignError(error) ? error.code : PT_ERROR_CODES.INTERNAL;
        const message = error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ code, message }) }],
          error: { code, message },
        };
      }
    },
    fs,
  };
}

export async function serveMcpStdio(file?: string) {
  const server = createMcpServer({ file });
  const decoder = new TextDecoder();
  let buf = "";

  const write = (msg: unknown) => {
    const text = `${JSON.stringify(msg)}\n`;
    process.stdout.write(text);
  };

  for await (const chunk of Bun.stdin.stream()) {
    buf += decoder.decode(chunk);
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let req: { id?: unknown; method?: string; params?: Record<string, unknown> };
      try {
        req = JSON.parse(line) as typeof req;
      } catch {
        continue;
      }
      const id = req.id;
      if (req.method === "initialize") {
        write({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "pt-design", version: "0.0.1" },
          },
        });
        continue;
      }
      if (req.method === "tools/list") {
        write({ jsonrpc: "2.0", id, result: { tools: server.listTools() } });
        continue;
      }
      if (req.method === "tools/call") {
        const name = String(req.params?.name ?? "");
        const args = (req.params?.arguments as Record<string, unknown>) ?? {};
        const result = server.callTool(name, args);
        write({ jsonrpc: "2.0", id, result });
        continue;
      }
      if (req.method === "notifications/initialized" || req.method === "ping") {
        if (id !== undefined) write({ jsonrpc: "2.0", id, result: {} });
        continue;
      }
      write({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown method ${req.method}` },
      });
    }
  }
}
