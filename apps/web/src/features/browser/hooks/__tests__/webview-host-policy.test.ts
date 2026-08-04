import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// hooks/__tests__ → hooks → browser → features → src → web → apps → repo root
const root = join(import.meta.dir, "../../../../../../..");

describe("APP-053 host overlay policy (shipped hooks)", () => {
  it("outside-dismiss listens for window blur and WEBVIEW focusin", () => {
    const src = readFileSync(
      join(root, "apps/web/src/features/browser/hooks/use-overlay-dismiss-on-webview.ts"),
      "utf8",
    );
    expect(src).toContain('addEventListener("blur"');
    expect(src).toContain("focusin");
    expect(src).toContain("WEBVIEW");
    expect(src).toContain("onDismiss");
  });

  it("pointer policy blocks when overlays or drag-active are present", () => {
    const src = readFileSync(
      join(root, "apps/web/src/features/browser/hooks/use-webview-pointer-policy.ts"),
      "utf8",
    );
    expect(src).toContain("data-atmos-drag-active");
    expect(src).toContain("pointer-events");
    expect(src).toContain("dropdown-menu-content");
  });
});
