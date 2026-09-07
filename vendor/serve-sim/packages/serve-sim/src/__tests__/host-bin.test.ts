import { describe, expect, test } from "bun:test";
import {
  hostServeSimBin,
  isBunVirtualPath,
  isGlobalServeSimKill,
  rewriteHostCommand,
} from "../host-bin";

describe("host serve-sim bin", () => {
  test("treats bun compile paths as virtual", () => {
    expect(isBunVirtualPath("/$bunfs/root/serve-sim")).toBe(true);
    expect(isBunVirtualPath("/Users/aarynlu/.atmos/runtime/serve-sim/0.1.37-atmos.1/serve-sim")).toBe(false);
  });

  test("rewrites bunfs and bare serve-sim commands to the real binary", () => {
    const bin = "/Users/me/.atmos/runtime/serve-sim/0.1.37-atmos.1/serve-sim";
    expect(rewriteHostCommand("/$bunfs/root/serve-sim permissions grant photos com.app -d UDID", bin)).toBe(
      `${bin} permissions grant photos com.app -d UDID`,
    );
    expect(rewriteHostCommand("'/$bunfs/root/serve-sim' camera --list-webcams", bin)).toBe(
      `${bin} camera --list-webcams`,
    );
    expect(rewriteHostCommand("serve-sim rotate left -d UDID", bin)).toBe(
      `${bin} rotate left -d UDID`,
    );
    expect(rewriteHostCommand("xcrun simctl list", bin)).toBe("xcrun simctl list");
  });

  test("quotes binary paths that need a shell escape", () => {
    expect(rewriteHostCommand("serve-sim ui appearance dark", "/tmp/Atmos Server/serve-sim")).toBe(
      "'/tmp/Atmos Server/serve-sim' ui appearance dark",
    );
  });

  test("detects global kill without a device", () => {
    expect(isGlobalServeSimKill("serve-sim --kill")).toBe(true);
    expect(isGlobalServeSimKill("serve-sim -k")).toBe(true);
    expect(isGlobalServeSimKill("serve-sim --kill B3CE3FD6-769B-48A3-B0F7-5933C74D1E39")).toBe(false);
  });

  test("resolves a real on-disk binary in this process", () => {
    const bin = hostServeSimBin();
    expect(isBunVirtualPath(bin)).toBe(false);
    expect(bin.length).toBeGreaterThan(0);
  });
});
