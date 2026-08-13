import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveStreamSettingsUrl,
  parseHelperStateRecord,
} from "./handshake.ts";
import { assertSpawnSafety, buildHelperArgv, stripHelperEnv, withHelperSpawnEnv } from "./spawn-args.ts";

describe("spawn args", () => {
  it("passes --no-preview, loopback host, and ephemeral port", () => {
    const argv = buildHelperArgv({
      port: 49152,
      simulatorId: "AAAA-NEWEST",
      transport: "http",
      codec: "auto",
    });
    expect(argv).toContain("--no-preview");
    expect(argv).toContain("127.0.0.1");
    expect(argv).toContain("-p");
    expect(argv).toContain("49152");
    expect(argv.at(-1)).toBe("AAAA-NEWEST");
    assertSpawnSafety(argv);
  });

  it("strips ATMOS_LOCAL_TOKEN from the child env", () => {
    const env = stripHelperEnv({
      PATH: "/usr/bin",
      HOME: "/Users/demo",
      ATMOS_LOCAL_TOKEN: "secret",
      GITHUB_TOKEN: "ghs_x",
    });
    expect(env.ATMOS_LOCAL_TOKEN).toBeUndefined();
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.PATH).toBe("/usr/bin");
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("sets DEVELOPER_DIR and prepends Xcode usr/bin", () => {
    const env = withHelperSpawnEnv(
      {
        PATH: "/usr/bin",
        ATMOS_LOCAL_TOKEN: "secret",
      },
      { developerDir: "/Applications/Xcode.app/Contents/Developer" },
    );
    expect(env.ATMOS_LOCAL_TOKEN).toBeUndefined();
    expect(env.DEVELOPER_DIR).toBe("/Applications/Xcode.app/Contents/Developer");
    expect(env.PATH).toBe(
      "/Applications/Xcode.app/Contents/Developer/usr/bin:/usr/bin",
    );
  });
});

describe("handshake", () => {
  it("reads published URLs from the helper record instead of hardcoding paths", () => {
    const raw = readFileSync(
      join(import.meta.dir, "__fixtures__", "helper-state-record.json"),
      "utf8",
    );
    const record = parseHelperStateRecord(raw);
    expect(record.simulatorId).toBe("AAAA-NEWEST");
    expect(record.streamUrl).toBe("http://127.0.0.1:49152/stream.avcc");
    expect(record.wsUrl).toBe("ws://127.0.0.1:49152/ws");
    expect(record.streamSettingsUrl).toBe(
      "http://127.0.0.1:49152/stream-settings",
    );
    expect(deriveStreamSettingsUrl("http://127.0.0.1:9/foo/bar")).toBe(
      "http://127.0.0.1:9/foo/stream-settings",
    );
  });
});
