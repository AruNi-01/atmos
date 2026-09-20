// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("NotifySettingsSection desktop test", () => {
  it("reports permission denials instead of a generic send failure", () => {
    const src = readFileSync(
      join(import.meta.dir, "../NotifySettingsSection.tsx"),
      "utf8",
    );
    expect(src).toContain("desktopPermissionRequired");
    expect(src).toContain("permission_denied");
    expect(src).not.toContain("shouldShowSystemNotification");
  });
});
