import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertLoopbackUrl,
  deriveStreamSettingsUrl,
  parseHelperStateRecord,
  sessionProxyUrls,
  spawnFailurePids,
  isOwnHelperRecord,
} from "./handshake.ts";

describe("handshake", () => {
  it("stores URLs from the helper record and derives stream-settings", () => {
    const raw = readFileSync(
      join(import.meta.dir, "__fixtures__", "helper-state-record.json"),
      "utf8",
    );
    const record = parseHelperStateRecord(raw);
    expect(record.streamUrl).toBe("http://127.0.0.1:49152/stream.avcc");
    expect(record.wsUrl).toBe("ws://127.0.0.1:49152/ws");
    expect(record.streamSettingsUrl).toBe(
      deriveStreamSettingsUrl(record.streamUrl),
    );
    assertLoopbackUrl(record.url);
  });

  it("rejects a non-loopback helper url", () => {
    expect(() => assertLoopbackUrl("http://0.0.0.0:9/")).toThrow(
      "helper_bind_not_loopback",
    );
  });

  it("rebuilds proxy URLs from the reused session token", () => {
    const first = sessionProxyUrls({
      controlPort: 52413,
      token: "old-token",
      wsPath: "/ws",
      settingsPath: "/stream-settings",
    });
    const reused = sessionProxyUrls({
      controlPort: 52413,
      token: "old-token",
      wsPath: "/input",
      settingsPath: "/stream-settings",
    });
    expect(first.wsUrl).toBe("ws://127.0.0.1:52413/s/old-token/ws");
    expect(reused.wsUrl).toBe("ws://127.0.0.1:52413/s/old-token/input");
    expect(reused.streamSettingsUrl).toBe(
      "http://127.0.0.1:52413/s/old-token/stream-settings",
    );
  });

  it("does not signal a helper pid published on another spawn's port", () => {
    expect(
      spawnFailurePids({
        childPid: 11,
        recordPid: 22,
        recordPort: 4000,
        spawnPort: 4001,
      }),
    ).toEqual([11]);
    expect(
      spawnFailurePids({
        childPid: 11,
        recordPid: 22,
        recordPort: 4001,
        spawnPort: 4001,
      }),
    ).toEqual([11, 22]);
  });

  it("only accepts a helper record for this spawn's port", () => {
    expect(isOwnHelperRecord({ port: 4001 }, 4001)).toBe(true);
    expect(isOwnHelperRecord({ port: 4000 }, 4001)).toBe(false);
  });
});
