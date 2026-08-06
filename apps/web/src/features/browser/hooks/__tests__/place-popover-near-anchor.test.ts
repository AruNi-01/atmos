import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// hooks/__tests__ → hooks → browser → features → src → web → apps → repo root
const root = join(import.meta.dir, "../../../../../../..");

describe("browser selection popover (Radix)", () => {
  it("preview SelectionPopover uses shadcn Popover anchor + collision", () => {
    const popover = readFileSync(
      join(root, "apps/web/src/features/selection/components/SelectionPopover.tsx"),
      "utf8",
    );
    expect(popover).toContain("PopoverAnchor");
    expect(popover).toContain("PopoverContent");
    expect(popover).toContain("avoidCollisions");
    expect(popover).toContain("collisionPadding");
    expect(popover).toContain("const isPreview = type === 'preview'");
    // Virtual fixed anchor on document.body (viewport coords).
    expect(popover).toContain("createPortal");
    expect(popover).toContain("document.body");
    expect(popover).toContain("fixed z-[9998]");
    expect(popover).toMatch(/left:\s*Math\.round\(position\.x\)/);
    expect(popover).toMatch(/top:\s*Math\.round\(position\.y\)/);
    expect(popover).not.toContain("clampedPosition");
    expect(popover).not.toContain('sticky="partial"');
  });

  it("host maps guest click to anchor only (no placePopoverNearAnchor)", () => {
    const src = readFileSync(
      join(root, "apps/web/src/features/browser/hooks/use-browser-selection.ts"),
      "utf8",
    );
    expect(src).toContain("getPopoverPositionFromRect");
    expect(src).toContain("guestAnchorX");
    expect(src).toContain("lastGuestClickOffsetRef");
    expect(src).not.toContain("placePopoverNearAnchor");
    expect(src).not.toContain("POPOVER_EST_WIDTH");
  });
});
