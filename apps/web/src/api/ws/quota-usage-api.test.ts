import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("setProviderOrder", () => {
  test("captures the computer scope before the connect wait", () => {
    const source = readFileSync(new URL("./quota-usage-api.ts", import.meta.url), "utf8");
    const start = source.indexOf("setProviderOrder:");
    const end = source.indexOf("setAutoRefresh:");
    const body = source.slice(start, end);
    expect(body).toContain("getComputerQueryScope()");
    expect(body).toContain("wsRequestForComputerScope(");
    expect(body).not.toContain("emitQuotaOverviewUpdated");
  });

  test("the popover brackets the drag with the provider-order write guard", () => {
    const source = readFileSync(
      new URL("../../app-shell/QuotaPopover.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("beginQuotaProviderOrderWrite(scope)");
    expect(source).toContain("finishQuotaProviderOrderWrite(getAtmosWebQueryClient(), scope)");
  });
});
