import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// __tests__ → lib → desktop-use → features → src → web → apps → repo root
const root = join(import.meta.dir, "../../../../../../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("desktop-use readiness gate wiring", () => {
  it("mounts readiness host in root layout under Suspense", () => {
    const layout = read("apps/web/src/app/layout.tsx");
    expect(layout).toContain("DesktopUseReadinessHost");
    // useQueryState → useSearchParams requires Suspense for SSG prerender.
    expect(layout).toMatch(/Suspense[\s\S]*DesktopUseReadinessHost/);
  });

  it("gates Appshots open and closes popover when blocked", () => {
    const popover = read(
      "apps/web/src/features/appshot/components/AppshotsHistoryPopover.tsx",
    );
    expect(popover).toContain("gateDesktopUseFeature");
    expect(popover).toContain('"appshot"');
    expect(popover).toContain("onBlocked");
    expect(popover).toContain("onCloseRef.current");
  });

  it("defers readiness modal open to avoid Popover dismiss race", () => {
    const bus = read(
      "apps/web/src/features/desktop-use/lib/readiness-modal-bus.ts",
    );
    expect(bus).toContain("openDesktopUseReadinessModalDeferred");
    const dialog = read(
      "apps/web/src/features/desktop-use/components/DesktopUseReadinessDialog.tsx",
    );
    expect(dialog).toContain("useOpenDesktopUseSettings");
    expect(dialog).toContain("OPEN_SETTLE_MS");
    expect(dialog).toContain("onPointerDownOutside");
  });

  it("gates Desktop Use and Browser Use slash on WelcomePage", () => {
    const page = read("apps/web/src/features/welcome/components/WelcomePage.tsx");
    expect(page).toContain("gateDesktopUseFeature");
    expect(page).toContain('"slash"');
    expect(page).toContain('"browser"');
    expect(page).toContain("BROWSER_USE_SLASH_COMMAND_ID");
    expect(page).toContain("DESKTOP_USE_SLASH_COMMAND_ID");
  });

  it("gates Desktop Use and Browser Use slash on terminal agent input", () => {
    const overlay = read(
      "apps/web/src/features/terminal/components/TerminalAgentInputOverlay.tsx",
    );
    expect(overlay).toContain("gateDesktopUseFeature");
    expect(overlay).toContain('"slash"');
    expect(overlay).toContain('"browser"');
    expect(overlay).toContain("BROWSER_USE_SLASH_COMMAND_ID");
    expect(overlay).toContain("DESKTOP_USE_SLASH_COMMAND_ID");
  });

  it("readiness dialog raises z-index above ordinary chrome", () => {
    const dialog = read(
      "apps/web/src/features/desktop-use/components/DesktopUseReadinessDialog.tsx",
    );
    expect(dialog).toContain("overlayClassName");
    expect(dialog).toContain("2147483647");
  });
});
