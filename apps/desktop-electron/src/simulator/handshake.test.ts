import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assertLoopbackUrl,
  deriveStreamSettingsUrl,
  parseHelperStateRecord,
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
});
