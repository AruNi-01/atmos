import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const footerSrc = readFileSync(join(import.meta.dir, "../Footer.tsx"), "utf8");

describe("footer agent status overview", () => {
  test("shows icon+count buckets instead of a session ticker", () => {
    expect(footerSrc).toContain("AgentStatusOverviewTrigger");
    expect(footerSrc).toContain("FOOTER_AGENT_OVERVIEW_ORDER");
    expect(footerSrc).toContain("overviewNeedAttention");
    expect(footerSrc).not.toContain("useSessionTicker");
    expect(footerSrc).not.toContain("tickerSession");
  });

  test("reuses sidebar grouping icons and the footer running indicator", () => {
    expect(footerSrc).toContain("getWorkspaceAgentGroupMeta");
    expect(footerSrc).toContain('placement="footer"');
    expect(footerSrc).toContain("FooterOverviewBucketIcon");
  });

  test("widens the popover, groups sessions by project/workspace, and appends the live terminal title", () => {
    expect(footerSrc).toContain("w-[28rem]");
    expect(footerSrc).toContain("groupSessionsByContext");
    expect(footerSrc).not.toContain("groupedByBucket");
    expect(footerSrc).toContain("paneTitle");
    expect(footerSrc).toContain("forceSessionIdle");
    expect(footerSrc).toContain("removeSession");
  });

  test("session rows show every overview bucket icon and badge, and can mark non-idle as idle", () => {
    expect(footerSrc).toContain("FooterOverviewBucketIcon bucket={bucket}");
    expect(footerSrc).toContain("footerOverviewBadgeClass");
    expect(footerSrc).toContain("overviewNeedAttention");
    expect(footerSrc).toContain("overviewNeedPermission");
    expect(footerSrc).toContain("markFooterSessionIdle");
    expect(footerSrc).toContain("clearMatchingSessionIds");
    expect(footerSrc).toContain("clearHold");
    expect(footerSrc).not.toContain("state.toUpperCase()");
    expect(footerSrc).not.toContain('"PERM"');
  });
});
