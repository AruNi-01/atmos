import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../../../../../../..");

describe("settings page scroll", () => {
  it("scrolls native overflow and keeps Electron drag off the content", () => {
    const page = readFileSync(
      join(root, "apps/web/src/features/settings/components/SettingsModal.tsx"),
      "utf8",
    );
    expect(page).toContain("flex h-full min-h-0 w-full");
    expect(page).not.toContain("flex h-dvh min-h-0 w-full");
    expect(page).toContain("desktop-no-drag min-h-0 min-w-0 overflow-hidden");
    expect(page).toContain("min-h-0 flex-1 overflow-y-auto");
    expect(page).not.toContain("ScrollArea");

    const sidebar = readFileSync(
      join(root, "apps/web/src/features/settings/components/settings-modal-sidebar.tsx"),
      "utf8",
    );
    expect(sidebar).toContain("desktop-no-drag gap-0.5 overflow-y-auto");
  });
});
