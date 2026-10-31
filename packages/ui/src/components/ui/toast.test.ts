import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const toast = readFileSync(join(import.meta.dir, "toast.tsx"), "utf8");

describe("toast auth row", () => {
  it("vertically centers the status icon with the action button", () => {
    expect(toast).toContain('data-slot="toast-auth-row"');
    expect(toast).toContain("flex shrink-0 items-center gap-1.5");
    expect(toast).not.toContain("shrink-0 pt-0.5");
    expect(toast).not.toContain("flex min-w-0 flex-1 items-start gap-2");
  });
});
