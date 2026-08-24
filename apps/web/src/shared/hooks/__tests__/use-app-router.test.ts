import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(join(import.meta.dir, "../use-app-router.ts"), "utf8");

describe("useAppRouter workspace deep-link contract", () => {
  test("pushWorkspaceDeepLink shares interceptor/guard/normalize then prepareAndPrime(..., null)", () => {
    expect(src).toContain("pushWorkspaceDeepLink");
    expect(src).toContain("commitWorkspaceNavigation");
    expect(src).toContain("runRegisteredAppNavigationGuard({ path, kind })");
    expect(src).toContain("interceptor?.({ path, kind })");
    expect(src).toContain("normalizePath(path)");
    expect(src).toContain("prepareAndPrimeWorkspaceNavigation(nextPath, currentHref)");
    expect(src).toContain('commitWorkspaceNavigation(path, "push", null)');
    expect(src).toContain('commitWorkspaceNavigation(path, "push")');
    expect(src).toContain('commitWorkspaceNavigation(path, "replace")');

    const deepLinkAt = src.indexOf("pushWorkspaceDeepLink");
    const commitAt = src.indexOf("commitWorkspaceNavigation");
    const interceptorAt = src.indexOf("interceptor?.({ path, kind })");
    const guardAt = src.indexOf("runRegisteredAppNavigationGuard({ path, kind })");
    const prepareAt = src.indexOf(
      "prepareAndPrimeWorkspaceNavigation(nextPath, currentHref)",
    );
    expect(commitAt).toBeGreaterThan(0);
    expect(interceptorAt).toBeGreaterThan(commitAt);
    expect(guardAt).toBeGreaterThan(interceptorAt);
    expect(prepareAt).toBeGreaterThan(guardAt);
    expect(deepLinkAt).toBeGreaterThan(prepareAt);
  });
});
