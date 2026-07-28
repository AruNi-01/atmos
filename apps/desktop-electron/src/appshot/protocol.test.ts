import { describe, expect, it } from "bun:test";
import {
  allocateTimestamp,
  APPSHOT_PROTOCOL_PREFIX,
  formatProtocolPrompt,
  isValidTimestamp,
} from "./protocol.ts";

describe("AppShot protocol (Tauri parity)", () => {
  it("validates 13-digit timestamps only", () => {
    expect(isValidTimestamp("1760000000000")).toBe(true);
    expect(isValidTimestamp("176000000000")).toBe(false);
    expect(isValidTimestamp("17600000000000")).toBe(false);
    expect(isValidTimestamp("17600000000aa")).toBe(false);
  });

  it("formats atmos://appshots protocol without absolute home paths", () => {
    const prompt = formatProtocolPrompt("1760000000000");
    expect(prompt.startsWith(`${APPSHOT_PROTOCOL_PREFIX}1760000000000\n`)).toBe(
      true,
    );
    expect(prompt).toContain("~/.atmos/appshots/records/1760000000000/");
    expect(prompt).toContain("snapshot.png");
    expect(prompt).toContain("context.md");
    expect(prompt).not.toContain("/Users/");
    expect(prompt).not.toContain("/tmp/");
  });

  it("allocateTimestamp returns free 13-digit id", () => {
    const taken = new Set(["1760000000000"]);
    const ts = allocateTimestamp(
      "/tmp/records",
      (p) => taken.has(p.split("/").pop() ?? ""),
      1760000000000,
    );
    expect(isValidTimestamp(ts)).toBe(true);
    expect(ts).not.toBe("1760000000000");
  });
});
