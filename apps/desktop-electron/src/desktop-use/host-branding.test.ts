import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyHostAppIcon,
  applyHostServeAlias,
  ensureHostMacosDir,
  HOST_APP_NAME,
  preferHostIcnsOverCatalog,
  resolveDesktopUseHostApp,
  resolveHostAppIconPath,
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

  it("resolves a real product icns from electron resources or crate assets", () => {
    const p = resolveHostAppIconPath();
    expect(p).toBeTruthy();
    expect(readFileSync(p!).subarray(0, 4).toString()).toBe("icns");
  });

  it("writes AppIcon.icns when missing or different, skips when equal", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-icon-"));
    const app = join(root, `${HOST_APP_NAME}.app`);
    const resources = join(app, "Contents", "Resources");
    mkdirSync(resources, { recursive: true });
    const src = join(root, "icon.icns");
    const fake = Buffer.concat([
      Buffer.from("icns"),
      Buffer.alloc(32, 7),
    ]);
    writeFileSync(src, fake);

    expect(applyHostAppIcon(app, src)).toBe(true);
    expect(readFileSync(join(resources, "AppIcon.icns")).equals(fake)).toBe(
      true,
    );
    expect(applyHostAppIcon(app, src)).toBe(false);

    const other = join(root, "other.icns");
    writeFileSync(other, Buffer.concat([Buffer.from("icns"), Buffer.alloc(16, 9)]));
    expect(applyHostAppIcon(app, other)).toBe(true);
    expect(applyHostAppIcon(app, join(root, "missing.icns"))).toBe(false);
    writeFileSync(join(root, "not-icns.bin"), Buffer.from("png!not-an-icns"));
    expect(applyHostAppIcon(app, join(root, "not-icns.bin"))).toBe(false);
  });

  it("resolves icon.icns from extraRoots before falling back", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-icon-root-"));
    const icns = join(root, "icon.icns");
    writeFileSync(icns, Buffer.concat([Buffer.from("icns"), Buffer.alloc(8, 1)]));
    expect(resolveHostAppIconPath({ extraRoots: [root] })).toBe(icns);
  });

  it("strips CFBundleIconName when the host has no asset catalog", () => {
    const root = mkdtempSync(join(tmpdir(), "atmos-du-catalog-"));
    const app = join(root, `${HOST_APP_NAME}.app`);
    const contents = join(app, "Contents");
    mkdirSync(join(contents, "Resources"), { recursive: true });
    const plist = join(contents, "Info.plist");
    writeFileSync(
      plist,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIconName</key><string>AppIcon</string>
</dict></plist>
`,
    );
    expect(preferHostIcnsOverCatalog(app)).toBe(true);
    const raw = readFileSync(plist, "utf8");
    expect(raw).not.toContain("CFBundleIconName");
    expect(raw).toContain("CFBundleIconFile");
    expect(preferHostIcnsOverCatalog(app)).toBe(false);
  });
});
