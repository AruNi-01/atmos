import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PT_DESIGN_TOOL_DEFS } from "../agent/tool-defs";
import { createSdkMcpServer, MCP_SERVER_NAME } from "./server";

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), "pt-mcp-")), "app.ptdesign.json");
}

describe("standard MCP SDK server", () => {
  test("official client lists tools and places a button over in-memory transport", async () => {
    const file = tmpFile();
    const { sdk, facade } = createSdkMcpServer({ file });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "pt-design-test", version: "0.0.1" });
    await Promise.all([sdk.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const listed = await client.listTools();
      expect(listed.tools.map((tool) => tool.name).sort()).toEqual(
        PT_DESIGN_TOOL_DEFS.map((def) => def.name).sort(),
      );
      const placeTool = listed.tools.find((tool) => tool.name === "pt_place");
      expect(placeTool?.inputSchema).toBeDefined();
      expect(JSON.stringify(placeTool?.inputSchema)).toContain("componentType");
      expect(placeTool?.annotations?.readOnlyHint).toBe(false);

      const placed = await client.callTool({
        name: "pt_place",
        arguments: { componentType: "button", at: { x: 10, y: 12 }, props: { label: "Save" } },
      });
      expect(placed.isError).toBeFalsy();
      const ir = await client.callTool({ name: "pt_ir_get", arguments: {} });
      expect(ir.isError).toBeFalsy();
      const text = (ir.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toContain("button");
      expect(text).toContain("Save");
      expect(facade.fs.session.getIR().freeNodes[0]?.componentType).toBe("button");

      const resources = await client.listResources();
      expect(resources.resources.some((item) => item.uri === "pt-design://catalog")).toBe(true);
      const catalog = await client.readResource({ uri: "pt-design://catalog" });
      expect(catalog.contents[0]?.text).toContain("button");
    } finally {
      await client.close();
      await sdk.close();
    }
  });

  test("invalid args return a tool error, not a protocol crash", async () => {
    const { sdk } = createSdkMcpServer({ file: tmpFile() });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "pt-design-test", version: "0.0.1" });
    await Promise.all([sdk.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: "pt_place", arguments: {} });
      expect(result.isError).toBe(true);
      const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      expect(text).toMatch(/Error \(USAGE\)|componentType/i);
    } finally {
      await client.close();
      await sdk.close();
    }
  });

  test("server name follows MCP TypeScript convention", () => {
    expect(MCP_SERVER_NAME).toBe("pt-design-mcp-server");
  });
});
