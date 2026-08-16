import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFileSession, runTool } from "./api";
import { isPtDesignError } from "./errors";
import { PT_DESIGN_TOOL_DEFS } from "./tool-defs";
import { createMcpServer } from "../mcp/server";
import { runCli } from "../cli/bin";
import { normalizeIR } from "../ir/encode";
import type { DesignIR } from "../ir/schema";

function tmpFile() {
  return join(mkdtempSync(join(tmpdir(), "pt-")), "app.ptdesign.json");
}

describe("agent adapters", () => {
  test("tool-defs names are unique and complete", () => {
    const names = PT_DESIGN_TOOL_DEFS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("pt_place");
    expect(names).toContain("pt_handoff");
    expect(names).toContain("pt_doc_init");
  });

  test("MCP lists tools and place+ir_get auto-saves", () => {
    const file = tmpFile();
    const mcp = createMcpServer({ file });
    const listed = mcp.listTools().map((t) => t.name).sort();
    expect(listed).toEqual([...PT_DESIGN_TOOL_DEFS.map((d) => d.name)].sort());
    const placed = mcp.callTool("pt_place", {
      componentType: "button",
      at: { x: 10, y: 10 },
      props: { label: "Save" },
    });
    expect(placed.isError).toBe(false);
    const ir = mcp.callTool("pt_ir_get", {});
    expect(ir.isError).toBe(false);
    const data = ir.data as DesignIR;
    expect(data.freeNodes.some((n) => n.componentType === "button")).toBe(true);
    const opened = openFileSession({ file });
    expect(opened.session.getIR().freeNodes.some((n) => n.componentType === "button")).toBe(true);
  });

  test("CLI place --json writes parseable success", async () => {
    const file = tmpFile();
    const logs: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      const code = await runCli(["place", "button", "--at", "10,10", "--file", file, "--json"]);
      expect(code).toBe(0);
    } finally {
      process.stdout.write = orig;
    }
    const parsed = JSON.parse(logs.join(""));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.componentType).toBe("button");
    expect(typeof parsed.data.instanceId).toBe("string");
  });

  test("session CLI MCP parity after place+update+frame", () => {
    const fileA = tmpFile();
    const fileB = tmpFile();
    const ops = (file: string) => {
      const fs = openFileSession({ file, create: true });
      runTool(fs, { name: "pt_place", args: { componentType: "button", at: { x: 8, y: 8 }, props: { label: "A" } } });
      const ir1 = runTool(fs, { name: "pt_ir_get", args: {} }) as DesignIR;
      const id = ir1.freeNodes[0]?.instanceId;
      runTool(fs, { name: "pt_update", args: { instanceId: id, props: { label: "B" } } });
      runTool(fs, {
        name: "pt_frame_create",
        args: { name: "Login", x: 0, y: 0, w: 400, h: 300 },
      });
      runTool(fs, {
        name: "pt_place",
        args: { componentType: "input", at: { x: 20, y: 40 }, frame: "Login" },
      });
      return normalizeIR(runTool(fs, { name: "pt_ir_get", args: {} }) as DesignIR);
    };
    expect(ops(fileA)).toEqual(ops(fileB));
  });

  test("missing file and unknown type fail", () => {
    try {
      openFileSession({ file: join(tmpdir(), "does-not-exist-pt-design-xyz.ptdesign.json") });
      throw new Error("should fail");
    } catch (error) {
      expect(isPtDesignError(error) && error.code).toBe("MISSING_FILE");
    }
    const fs = openFileSession({ file: tmpFile(), create: true });
    try {
      runTool(fs, { name: "pt_place", args: { componentType: "nope", at: { x: 0, y: 0 } } });
      throw new Error("should fail");
    } catch (error) {
      expect(isPtDesignError(error) && error.code).toBe("UNKNOWN_COMPONENT_TYPE");
    }
  });

  test("every tool-def runs once on a temp file", () => {
    const file = tmpFile();
    const fs = openFileSession({ file, create: true });
    const placed = runTool(fs, {
      name: "pt_place",
      args: { componentType: "button", at: { x: 1, y: 1 } },
    }) as { instanceId: string };
    runTool(fs, { name: "pt_catalog_list", args: {} });
    runTool(fs, { name: "pt_ir_get", args: {} });
    runTool(fs, { name: "pt_scene_get", args: {} });
    runTool(fs, { name: "pt_frame_create", args: { name: "A", x: 0, y: 0, w: 100, h: 100 } });
    runTool(fs, { name: "pt_frames_list", args: {} });
    runTool(fs, { name: "pt_frame_rename", args: { frame: "A", name: "B" } });
    runTool(fs, { name: "pt_update", args: { instanceId: placed.instanceId, props: { label: "X" } } });
    runTool(fs, { name: "pt_export", args: {} });
    runTool(fs, { name: "pt_handoff", args: { scope: "document" } });
    runTool(fs, { name: "pt_apply_ir", args: { ir: fs.session.getIR(), mode: "merge", dryRun: true } });
    runTool(fs, { name: "pt_doc_save", args: { file } });
    runTool(fs, { name: "pt_delete", args: { instanceId: placed.instanceId } });
    expect(fs.session.getIR().freeNodes.every((n) => n.instanceId !== placed.instanceId)).toBe(true);
  });
});
