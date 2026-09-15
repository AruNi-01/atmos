import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openFileSession, runTool } from "./api";
import { runSessionTool } from "./session-tools";
import { createHeadlessSession } from "../core/headless-session";
import { PtDesignError } from "../protocol";
import { PT_DESIGN_TOOL_DEFS } from "./tool-defs";
import { createMcpServer } from "../mcp/server";
import { runCli } from "../cli/bin";

const LEGAL_PTX = `<page id="model-config">
  <select id="model" label="Model" value="claude" x="300" y="200" width="240" height="40">
    <option value="gpt-5.6">GPT-5.6</option>
    <option value="claude">Claude</option>
  </select>
  <button id="run" label="Run" x="300" y="260" width="100" height="40"/>
</page>
`;

function tmpPtd() {
  return join(mkdtempSync(join(tmpdir(), "pt-")), "app.ptd");
}

function expectCode(fn: () => unknown, code: string): PtDesignError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(PtDesignError);
    const err = error as PtDesignError;
    expect(err.code).toBe(code);
    return err;
  }
  throw new Error(`expected PtDesignError ${code}`);
}

describe("agent adapters", () => {
  test("tool-defs names are unique and match the TECH table", () => {
    const names = PT_DESIGN_TOOL_DEFS.map((d) => d.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.sort()).toEqual(
      [
        "pt_catalog_list",
        "pt_doc_init",
        "pt_doc_open",
        "pt_doc_save",
        "pt_ptx_apply",
        "pt_ptx_get",
        "pt_screenshot",
        "pt_tools_list",
      ].sort(),
    );
    expect(names).not.toContain("pt_ir_get");
    expect(names).not.toContain("pt_layout_row");
    expect(names).not.toContain("pt_place");
    expect(names).not.toContain("pt_batch");
  });

  test("S18 old tool names are unknown_tool and do not mutate PTX", () => {
    const session = createHeadlessSession({ ptx: LEGAL_PTX });
    const before = session.getPtx();
    const irErr = expectCode(
      () => runSessionTool(session, { name: "pt_ir_get", args: {} }),
      "unknown_tool",
    );
    expect(irErr.message).toContain("pt_ir_get");
    expect(session.getPtx()).toBe(before);
    const layoutErr = expectCode(
      () => runSessionTool(session, { name: "pt_layout_row", args: { instanceIds: ["a"] } }),
      "unknown_tool",
    );
    expect(layoutErr.message).toContain("pt_layout_row");
    expect(session.getPtx()).toBe(before);

    const dir = tmpPtd();
    const fs = openFileSession({ file: dir, create: true });
    fs.headless.applyPtx(LEGAL_PTX);
    runTool(fs, { name: "pt_doc_save", args: { path: dir } });
    const saved = fs.headless.getPtx();
    const runErr = expectCode(() => runTool(fs, { name: "pt_ir_get", args: {} }), "unknown_tool");
    expect(runErr.message).toContain("Unknown tool");
    expect(fs.headless.getPtx()).toBe(saved);
    expectCode(() => runTool(fs, { name: "pt_layout_row", args: {} }), "unknown_tool");
    expect(fs.headless.getPtx()).toBe(saved);
  });

  test("runSessionTool lists catalog XML snippets without a file", () => {
    const session = createHeadlessSession();
    const listed = runSessionTool(session, { name: "pt_catalog_list", args: {} }) as {
      types: Array<{ type: string; xmlExample: string; agentDescription: string }>;
    };
    const button = listed.types.find((item) => item.type === "button");
    expect(button?.xmlExample).toContain("<button");
    expect(button?.xmlExample).not.toContain('type="agent"');
    expect(button?.agentDescription.length).toBeGreaterThan(0);
    expect(listed.types.some((item) => item.type === "chart")).toBe(true);
    const charts = listed.types.filter((item) => item.type.startsWith("chart."));
    expect(charts).toHaveLength(70);
    const area = listed.types.find((item) => item.type === "chart.area-default");
    expect(area?.xmlExample).toContain("<chart-area-default");
    expect(area?.xmlExample).not.toContain("<chart.area-default");
    expect(() =>
      runSessionTool(session, { name: "pt_doc_init", args: { path: "./nope.ptd" } }),
    ).toThrow(/Live board|\.ptd/);
  });

  test("MCP lists tools and ptx get/apply auto-saves", () => {
    const file = tmpPtd();
    const mcp = createMcpServer({ file });
    const listed = mcp.listTools().map((t) => t.name).sort();
    expect(listed).toEqual([...PT_DESIGN_TOOL_DEFS.map((d) => d.name)].sort());
    const applied = mcp.callTool("pt_ptx_apply", { ptx: LEGAL_PTX });
    expect(applied.isError).toBe(false);
    const got = mcp.callTool("pt_ptx_get", {});
    expect(got.isError).toBe(false);
    const ptx = (got.data as { ptx: string }).ptx;
    expect(ptx).toContain("<select");
    expect(ptx).toContain('id="run"');
    const opened = openFileSession({ file });
    expect(opened.headless.getPtx()).toContain('id="model"');
  });

  test("openFileSession strips trailing slashes on .ptd paths", () => {
    const file = tmpPtd();
    const created = openFileSession({ file: `${file}///`, create: true });
    expect(created.path).toBe(file);
    created.headless.applyPtx(LEGAL_PTX);
    runTool(created, { name: "pt_doc_save", args: { path: `${file}/` } });
    const reopened = openFileSession({ file: `${file}/` });
    expect(reopened.path).toBe(file);
    expect(reopened.headless.getPtx()).toContain('id="model"');
  });

  test("unbound MCP mutate without a file is missing_file", () => {
    const mcp = createMcpServer();
    const applied = mcp.callTool("pt_ptx_apply", { ptx: LEGAL_PTX });
    expect(applied.isError).toBe(true);
    expect(JSON.stringify(applied)).toContain("missing_file");
    expect(JSON.stringify(applied)).toContain("/api/pt-design/agent/invoke");
  });

  test("unbound MCP session keeps autoSave so init+apply persist", () => {
    const file = tmpPtd();
    const mcp = createMcpServer();
    expect(mcp.fs.path).toBeNull();
    expect(mcp.fs.autoSave).toBe(true);
    const inited = mcp.callTool("pt_doc_init", { path: file });
    expect(inited.isError).toBe(false);
    const applied = mcp.callTool("pt_ptx_apply", { ptx: LEGAL_PTX });
    expect(applied.isError).toBe(false);
    const opened = openFileSession({ file });
    expect(opened.headless.getPtx()).toContain("<button");
  });

  test("CLI launcher sets exitCode instead of process.exit", () => {
    const launcher = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../bin/pt-design.mjs"),
      "utf8",
    );
    expect(launcher).toContain("#!/usr/bin/env bun");
    expect(launcher).toContain("process.exitCode = code");
    expect(launcher).not.toMatch(/process\.exit\(/);
  });

  test("CLI ptx apply without --file does not use a collab room", async () => {
    const logs: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    const prev = process.env.PT_DESIGN_COLLAB_ROOM;
    process.env.PT_DESIGN_COLLAB_ROOM = "abc123,secretKey";
    try {
      const code = await runCli(["ptx", "apply", "--ptx", LEGAL_PTX, "--json"]);
      expect(code).toBe(2);
    } finally {
      process.stdout.write = orig;
      process.stderr.write = origErr;
      if (prev === undefined) delete process.env.PT_DESIGN_COLLAB_ROOM;
      else process.env.PT_DESIGN_COLLAB_ROOM = prev;
    }
    const parsed = JSON.parse(logs.join(""));
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("missing_file");
    expect(parsed.error.message).toContain("/api/pt-design/agent/invoke");
    expect(parsed.error.message).not.toContain("PT_DESIGN_COLLAB_ROOM");
  });

  test("CLI ptx apply --json writes parseable success", async () => {
    const file = tmpPtd();
    const logs: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      expect(await runCli(["doc", "init", "--file", file, "--json"])).toBe(0);
      logs.length = 0;
      const code = await runCli(["ptx", "apply", "--ptx", LEGAL_PTX, "--file", file, "--json"]);
      expect(code).toBe(0);
    } finally {
      process.stdout.write = orig;
    }
    const parsed = JSON.parse(logs.join(""));
    expect(parsed.ok).toBe(true);
    expect(parsed.data.ok).toBe(true);
  });

  test("session CLI MCP parity after ptx apply", () => {
    const fileA = tmpPtd();
    const fileB = tmpPtd();
    const ops = (file: string) => {
      const fs = openFileSession({ file, create: true });
      runTool(fs, { name: "pt_ptx_apply", args: { ptx: LEGAL_PTX } });
      return (runTool(fs, { name: "pt_ptx_get", args: {} }) as { ptx: string }).ptx;
    };
    expect(ops(fileA)).toBe(ops(fileB));
  });

  test("missing file and invalid ptx fail with protocol codes", () => {
    expectCode(
      () => openFileSession({ file: join(tmpdir(), "does-not-exist-pt-design-xyz.ptd") }),
      "missing_file",
    );
    const fs = openFileSession({ file: tmpPtd(), create: true });
    const before = fs.headless.getPtx();
    expectCode(
      () => runTool(fs, { name: "pt_ptx_apply", args: { ptx: `<option value="x">X</option>` } }),
      "invalid_ptx",
    );
    expect(fs.headless.getPtx()).toBe(before);
  });

  test("every remaining tool-def is registered and old names stay unknown", () => {
    const file = tmpPtd();
    const fs = openFileSession({ file, create: true });
    runTool(fs, { name: "pt_catalog_list", args: {} });
    runTool(fs, { name: "pt_tools_list", args: {} });
    runTool(fs, { name: "pt_ptx_get", args: {} });
    runTool(fs, { name: "pt_ptx_apply", args: { ptx: LEGAL_PTX } });
    runTool(fs, { name: "pt_doc_save", args: { path: file } });
    expect(fs.headless.getPtx()).toContain("<button");
    expectCode(() => runTool(fs, { name: "pt_place", args: {} }), "unknown_tool");
  });

  test("CLI unknown ir get is unknown_tool", async () => {
    const file = tmpPtd();
    const logs: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      logs.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = (() => true) as typeof process.stderr.write;
    try {
      expect(await runCli(["doc", "init", "--file", file, "--json"])).toBe(0);
      logs.length = 0;
      const code = await runCli(["ir", "get", "--file", file, "--json"]);
      expect(code).toBe(1);
    } finally {
      process.stdout.write = orig;
      process.stderr.write = origErr;
    }
    const parsed = JSON.parse(logs.join(""));
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("unknown_tool");
  });
});

async function withCapturedStdout(fn: () => Promise<number>): Promise<{ code: number; out: string }> {
  const logs: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    logs.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = (() => true) as typeof process.stderr.write;
  try {
    const code = await fn();
    return { code, out: logs.join("") };
  } finally {
    process.stdout.write = orig;
    process.stderr.write = origErr;
  }
}

describe("S3 Agent PTX only", () => {
  test("pt_ptx_get returns pretty XML and does not require scene JSON", () => {
    const session = createHeadlessSession({ ptx: LEGAL_PTX });
    const { ptx } = runSessionTool(session, { name: "pt_ptx_get", args: {} }) as { ptx: string };
    expect(ptx.trimStart().startsWith("<page")).toBe(true);
    expect(ptx).toContain("<select");
    expect(ptx).toContain('id="run"');
    expect(ptx).not.toContain("customData");
    expect(ptx).not.toContain("excalidraw");
    expect(ptx).not.toMatch(/"type"\s*:\s*"rectangle"/);
  });
});

describe("S12 Agent edits document.ptx like source", () => {
  test("insert option in XML, apply full file, file and pt_ptx_get match", () => {
    const dir = tmpPtd();
    const fs = openFileSession({ file: dir, create: true });
    fs.headless.applyPtx(LEGAL_PTX);
    runTool(fs, { name: "pt_doc_save", args: { path: dir } });
    const xml = (runTool(fs, { name: "pt_ptx_get", args: {} }) as { ptx: string }).ptx;
    expect(xml).not.toContain("deepseek");
    const edited = xml.replace(
      "</select>",
      `    <option value="deepseek">DeepSeek</option>\n  </select>`,
    );
    runTool(fs, { name: "pt_ptx_apply", args: { ptx: edited } });
    const got = (runTool(fs, { name: "pt_ptx_get", args: {} }) as { ptx: string }).ptx;
    expect(got).toContain('value="deepseek"');
    expect(got).toContain("DeepSeek");
    const onDisk = readFileSync(join(dir, "document.ptx"), "utf8");
    expect(onDisk).toBe(got);
  });
});

describe("S25 CLI / MCP / headless PTX parity", () => {
  test("same create+update yields canonical PTX", async () => {
    const fileA = tmpPtd();
    const fileB = tmpPtd();
    const fileC = tmpPtd();
    const session = openFileSession({ file: fileA, create: true });
    runTool(session, { name: "pt_ptx_apply", args: { ptx: LEGAL_PTX } });
    const sessionPtx = (runTool(session, { name: "pt_ptx_get", args: {} }) as { ptx: string }).ptx;

    const mcp = createMcpServer({ file: fileB });
    expect(mcp.callTool("pt_doc_init", { path: fileB }).isError).toBe(false);
    expect(mcp.callTool("pt_ptx_apply", { ptx: LEGAL_PTX }).isError).toBe(false);
    const mcpGot = mcp.callTool("pt_ptx_get", {});
    expect(mcpGot.isError).toBe(false);
    const mcpPtx = (mcpGot.data as { ptx: string }).ptx;

    expect((await withCapturedStdout(() => runCli(["doc", "init", "--file", fileC, "--json"]))).code).toBe(0);
    expect(
      (await withCapturedStdout(() =>
        runCli(["ptx", "apply", "--ptx", LEGAL_PTX, "--file", fileC, "--json"]),
      )).code,
    ).toBe(0);
    const cliGet = await withCapturedStdout(() => runCli(["ptx", "get", "--file", fileC, "--json"]));
    expect(cliGet.code).toBe(0);
    const cliPtx = JSON.parse(cliGet.out).data.ptx as string;

    expect(sessionPtx).toBe(mcpPtx);
    expect(mcpPtx).toBe(cliPtx);
    expect(cliPtx.trimStart().startsWith("<page")).toBe(true);
  });
});

describe("S26 bad PTX CLI", () => {
  test("missing .ptd is missing_file with non-zero exit", async () => {
    const missing = join(tmpdir(), `pt-missing-${Date.now()}.ptd`);
    const result = await withCapturedStdout(() => runCli(["ptx", "get", "--file", missing, "--json"]));
    expect(result.code).toBe(2);
    const parsed = JSON.parse(result.out);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("missing_file");
  });

  test("malformed XML is invalid_ptx with non-zero exit", async () => {
    const file = tmpPtd();
    expect((await withCapturedStdout(() => runCli(["doc", "init", "--file", file, "--json"]))).code).toBe(0);
    const result = await withCapturedStdout(() =>
      runCli(["ptx", "apply", "--ptx", `<page id="p"><nope id="a" x="0" y="0" width="1" height="1"/></page>`, "--file", file, "--json"]),
    );
    expect(result.code).toBe(1);
    const parsed = JSON.parse(result.out);
    expect(parsed.ok).toBe(false);
    expect(parsed.error.code).toBe("invalid_ptx");
  });
});
