import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PT_DESIGN_TOOL_DEFS } from "../agent/tool-defs";
import { createMcpServer, createSdkMcpServer, MCP_SERVER_NAME } from "./server";

const LEGAL_PTX = `<page id="model-config">
  <button id="run" label="Run" x="300" y="260" width="100" height="40"/>
</page>
`;

function tmpPtd() {
  return join(mkdtempSync(join(tmpdir(), "pt-mcp-")), "app.ptd");
}

describe("standard MCP SDK server", () => {
  test("official client lists tools and applies PTX over in-memory transport", async () => {
    const file = tmpPtd();
    const { sdk, facade } = createSdkMcpServer({ file });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "pt-design-test", version: "0.0.1" });
    await Promise.all([sdk.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        PT_DESIGN_TOOL_DEFS.map((def) => def.name).sort(),
      );
      expect(listed.tools.some((tool) => tool.name === "pt_ir_get")).toBe(false);
      const applyTool = listed.tools.find((tool) => tool.name === "pt_ptx_apply");
      expect(applyTool?.inputSchema).toBeDefined();
      expect(JSON.stringify(applyTool?.inputSchema)).toContain("ptx");
      expect(applyTool?.annotations?.readOnlyHint).toBe(false);

      const applied = await client.callTool({
        name: "pt_ptx_apply",
        arguments: { ptx: LEGAL_PTX },
      });
      expect(applied.isError).toBeFalsy();
      const got = await client.callTool({ name: "pt_ptx_get", arguments: {} });
      expect(got.isError).toBeFalsy();
      const text = (got.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toContain("<button");
      expect(text).toContain("run");
      expect(facade.fs.headless.getPtx()).toContain('id="run"');

      const resources = await client.listResources();
      expect(resources.resources.some((item) => item.uri === "pt-design://catalog")).toBe(true);
      expect(resources.resources.some((item) => item.uri === "pt-design://ptx")).toBe(true);
      expect(resources.resources.some((item) => item.uri === "pt-design://ir")).toBe(false);
      const catalog = await client.readResource({ uri: "pt-design://catalog" });
      expect(catalog.contents[0]?.text).toContain("button");
    } finally {
      await client.close();
      await sdk.close();
    }
  });

  test("invalid args return a tool error, not a protocol crash", async () => {
    const { sdk } = createSdkMcpServer({ file: tmpPtd() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "pt-design-test", version: "0.0.1" });
    await Promise.all([sdk.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: "pt_ptx_apply", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toMatch(/invalid_ptx|ptx/i);
    } finally {
      await client.close();
      await sdk.close();
    }
  });

  test("server name follows MCP TypeScript convention", () => {
    expect(MCP_SERVER_NAME).toBe("pt-design-mcp-server");
  });

  test("old APP-062 tools are unknown_tool", () => {
    const mcp = createMcpServer({ file: tmpPtd() });
    const ir = mcp.callTool("pt_ir_get", {});
    expect(ir.isError).toBe(true);
    expect(ir.error?.code).toBe("unknown_tool");
    const layout = mcp.callTool("pt_layout_row", { instanceIds: ["a"] });
    expect(layout.isError).toBe(true);
    expect(layout.error?.code).toBe("unknown_tool");
  });
});
