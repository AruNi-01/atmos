import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyHostServeAlias,
  ensureHostMacosDir,
  HOST_APP_NAME,
  resolveDesktopUseHostApp,
} from "./host-branding.ts";

describe("desktop-use host branding", () => {
  it("resolves ~/.atmos/desktop-use host app", () => {
    const home = mkdtempSync(join(tmpdir(), "atmos-du-brand-home-"));
    const app = join(home, ".atmos", "desktop-use", "host", `${HOST_APP_NAME}.app`);
    ensureHostMacosDir(app);
    const resolved = resolveDesktopUseHostApp({ home });
    expect(resolved).toBe(app);
  });

  it("renames the product-named serve binary and shims a large upstream file", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-brand-"));
    const app = join(root, `${HOST_APP_NAME}.app`);
    const macos = ensureHostMacosDir(app);
    const upstream = join(macos, "cua-driver");
    writeFileSync(upstream, Buffer.alloc(80 * 1024, 1));

    const first = applyHostServeAlias(app);
    expect(first.aliased).toBe(true);
    expect(first.trampoline).toBe(true);

    const branded = join(macos, HOST_APP_NAME);
    expect(statSync(branded).size).toBe(80 * 1024);
    const shim = readFileSync(upstream, "utf8");
    expect(shim.startsWith("#!/bin/sh")).toBe(true);
    expect(shim).toContain(HOST_APP_NAME);
    expect(shim.toLowerCase()).not.toContain("cua-driver");

    const second = applyHostServeAlias(app);
    expect(second.aliased).toBe(false);
    expect(second.trampoline).toBe(false);
  });

  it("does not rewrite a tiny already-shimmed upstream file", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-brand-tiny-"));
    const app = join(root, `${HOST_APP_NAME}.app`);
    const macos = ensureHostMacosDir(app);
    writeFileSync(join(macos, "cua-driver"), "#!/bin/sh\n");

    const result = applyHostServeAlias(app);
    expect(result.aliased).toBe(true);
    expect(result.trampoline).toBe(false);
    expect(readFileSync(join(macos, "cua-driver"), "utf8")).toBe("#!/bin/sh\n");
  });
});
