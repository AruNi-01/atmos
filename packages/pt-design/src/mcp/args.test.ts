import { describe, expect, test } from "bun:test";
import { parseMcpFileArg, startMcpFromArgv } from "./args";

describe("MCP argv", () => {
  test("absent --file uses env, trailing or dashed --file is usage", () => {
    expect(parseMcpFileArg([], "from-env.json")).toEqual({ ok: true, file: "from-env.json" });
    expect(parseMcpFileArg(["--json"])).toEqual({ ok: true, file: undefined });
    expect(parseMcpFileArg(["--file", "app.ptdesign.json"], "from-env.json")).toEqual({
      ok: true,
      file: "app.ptdesign.json",
    });
    expect(parseMcpFileArg(["--file"], "from-env.json").ok).toBe(false);
    expect(parseMcpFileArg(["--file", "--json"], "from-env.json").ok).toBe(false);
    expect(parseMcpFileArg(["-f"], "from-env.json").ok).toBe(false);
  });

  test("startup rejection returns 1 and logs to stderr", async () => {
    const origError = console.error;
    const logs: unknown[] = [];
    console.error = (...args: unknown[]) => {
      logs.push(args[0]);
    };
    try {
      const code = await startMcpFromArgv([], undefined, async () => {
        throw new Error("connect failed");
      });
      expect(code).toBe(1);
      expect(String(logs[0])).toContain("connect failed");
    } finally {
      console.error = origError;
    }
  });

  test("trailing --file returns 2 and does not call serve", async () => {
    const origError = console.error;
    let served = false;
    console.error = () => {};
    try {
      const code = await startMcpFromArgv(["--file"], "from-env.json", async () => {
        served = true;
      });
      expect(served).toBe(false);
      expect(code).toBe(2);
    } finally {
      console.error = origError;
    }
  });
});
