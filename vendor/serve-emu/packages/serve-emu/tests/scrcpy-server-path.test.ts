import { describe, expect, test } from "bun:test";
import { resolveVendorDir } from "../src/scrcpy-server.ts";

describe("scrcpy vendor path", () => {
  test("setup and source runs write next to the package, not next to bun", () => {
    expect(
      resolveVendorDir(
        "file:///Users/dev/atmos/vendor/serve-emu/packages/serve-emu/src/scrcpy-server.ts",
        "/Users/dev/.bun/bin/bun",
      ),
    ).toBe("/Users/dev/atmos/vendor/serve-emu/packages/serve-emu/vendor");
  });

  test("packed binaries read vendor next to the on-disk executable", () => {
    expect(
      resolveVendorDir(
        "file:///$bunfs/root/src/scrcpy-server.ts",
        "/Users/dev/.atmos/runtime/serve-emu/0.0.5/serve-emu",
      ),
    ).toBe("/Users/dev/.atmos/runtime/serve-emu/0.0.5/vendor");
  });
});
