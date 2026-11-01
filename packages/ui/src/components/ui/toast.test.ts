import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const toast = readFileSync(join(import.meta.dir, "toast.tsx"), "utf8");
const toastsImpl = toast.slice(
  toast.indexOf("function Toasts"),
  toast.indexOf("function AnchoredToasts"),
);

describe("toast auth row", () => {
  it("vertically centers the status icon with the action button", () => {
    expect(toastsImpl).toContain('data-slot="toast-auth-row"');
    expect(toastsImpl).toContain("flex shrink-0 items-center gap-1.5");
    expect(toastsImpl).toContain("Icon || (toast.actionProps && !customActions)");
    expect(toastsImpl).not.toContain("shrink-0 pt-0.5");
    expect(toastsImpl).not.toContain("flex min-w-0 flex-1 items-start gap-2");
  });
});
