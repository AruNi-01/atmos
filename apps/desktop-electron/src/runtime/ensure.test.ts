import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildRuntimeManifest,
  clientLoopbackHost,
  electronServerPath,
  looksLikeAtmosUiHtml,
  parseLsofPids,
  resolveAtmosDataDir,
  setOwnedServerPidForTest,
  stopOwnedAtmosServer,
} from "./ensure.ts";

describe("Server data dir + quit ownership", () => {
  it("defaults to shared ~/.atmos/data/desktop (not desktop-electron sandbox)", () => {
    const prev = process.env.ATMOS_DATA_DIR;
    delete process.env.ATMOS_DATA_DIR;
    try {
      const dir = resolveAtmosDataDir("/Users/test");
      expect(dir).toBe(join("/Users/test", ".atmos", "data", "desktop"));
      expect(dir).not.toContain("desktop-electron");
      // real home path also avoids sandbox name
      expect(resolveAtmosDataDir(homedir())).not.toContain("desktop-electron");
    } finally {
      if (prev !== undefined) process.env.ATMOS_DATA_DIR = prev;
    }
  });

  it("honors ATMOS_DATA_DIR override", () => {
    const prev = process.env.ATMOS_DATA_DIR;
    process.env.ATMOS_DATA_DIR = "/custom/data";
    try {
      expect(resolveAtmosDataDir()).toBe("/custom/data");
    } finally {
      if (prev === undefined) delete process.env.ATMOS_DATA_DIR;
      else process.env.ATMOS_DATA_DIR = prev;
    }
  });

  it("stopOwnedAtmosServer no-ops when this process did not start Server", () => {
    setOwnedServerPidForTest(null);
    const r = stopOwnedAtmosServer();
    expect(r.stopped).toBe(false);
    expect(r.reason).toBe("not_owned");
  });

  it("stopOwnedAtmosServer reports already_dead for stale pid", () => {
    // PID unlikely to exist
    setOwnedServerPidForTest(999_999_991);
    const r = stopOwnedAtmosServer();
    expect(r.stopped).toBe(false);
    expect(r.reason).toBe("already_dead");
  });

  it("electronServerPath prepends Homebrew bins for GUI-launched Server", () => {
    const path = electronServerPath("/usr/bin:/bin");
    expect(path.startsWith("/opt/homebrew/bin:")).toBe(true);
    expect(path).toContain("/usr/local/bin");
    expect(path).toContain("/usr/bin");
    expect(path).toContain("/bin");
  });

  it("looksLikeAtmosUiHtml accepts real documents and rejects empty/404", () => {
    expect(looksLikeAtmosUiHtml("<!DOCTYPE html><html><body>ok</body></html>")).toBe(
      true,
    );
    expect(looksLikeAtmosUiHtml("<html lang=\"en\">x</html>")).toBe(true);
    expect(looksLikeAtmosUiHtml("")).toBe(false);
    expect(looksLikeAtmosUiHtml("Not Found")).toBe(false);
  });

  it("parseLsofPids extracts unique numeric PIDs", () => {
    expect(parseLsofPids("12345\n12345\n67890\n")).toEqual([12345, 67890]);
    expect(parseLsofPids("")).toEqual([]);
    expect(parseLsofPids("not-a-pid\n")).toEqual([]);
  });
});

describe("runtime manifest schema", () => {
  it("writes the canonical runtime-manager fields including ws_url and started_at", () => {
    const startedAt = "2026-08-18T03:10:33.921Z";
    const manifest = buildRuntimeManifest("127.0.0.1", 30303, 76309, {
      startedAt,
    });
    expect(manifest).toEqual({
      version: 1,
      source: "desktop-electron",
      pid: 76309,
      started_at: startedAt,
      api: {
        host: "127.0.0.1",
        port: 30303,
        url: "http://127.0.0.1:30303",
        ws_url: "ws://127.0.0.1:30303",
      },
    });
  });

  it("maps bind-all hosts to loopback like runtime-manager", () => {
    expect(clientLoopbackHost("0.0.0.0")).toBe("127.0.0.1");
    expect(buildRuntimeManifest("0.0.0.0", 30303, null).api.ws_url).toBe(
      "ws://127.0.0.1:30303",
    );
  });
});
