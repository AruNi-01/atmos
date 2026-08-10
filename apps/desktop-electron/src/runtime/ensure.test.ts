import { describe, expect, it } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  electronServerPath,
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
});
