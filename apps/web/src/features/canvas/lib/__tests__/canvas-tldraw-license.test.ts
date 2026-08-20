// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TLDRAW_LICENSE_EXPIRED_SELECTOR,
  TLDRAW_LICENSE_EXPIRED_TEST_ID,
  hostHasTldrawLicenseGate,
} from "../canvas-tldraw-license";

describe("tldraw license gate detection", () => {
  it("matches the hidden node tldraw mounts after an expired production license", () => {
    expect(TLDRAW_LICENSE_EXPIRED_TEST_ID).toBe("tl-license-expired");
    expect(TLDRAW_LICENSE_EXPIRED_SELECTOR).toBe('[data-testid="tl-license-expired"]');
    expect(hostHasTldrawLicenseGate(null)).toBe(false);
    expect(
      hostHasTldrawLicenseGate({
        querySelector: (selector: string) =>
          selector === TLDRAW_LICENSE_EXPIRED_SELECTOR ? ({} as Element) : null,
      }),
    ).toBe(true);
    expect(
      hostHasTldrawLicenseGate({
        querySelector: () => null,
      }),
    ).toBe(false);
  });

  it("watches the tldraw host in CanvasView instead of leaving a blank shell", () => {
    const viewSource = readFileSync(
      join(import.meta.dirname, "../../components/CanvasView.tsx"),
      "utf8",
    );
    expect(viewSource).toContain("hostHasTldrawLicenseGate");
    expect(viewSource).toContain("canvas-tldraw-license-blocked");
    expect(viewSource).toContain("licenseBlocked.title");
  });
});
