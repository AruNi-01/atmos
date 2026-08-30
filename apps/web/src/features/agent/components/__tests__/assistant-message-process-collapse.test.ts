import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const view = readFileSync(
  join(import.meta.dir, "../AssistantMessageView.tsx"),
  "utf8",
);
const messageView = readFileSync(
  join(import.meta.dir, "../AgentChatMessageView.tsx"),
  "utf8",
);

describe("assistant process collapse chrome", () => {
  it("uses Worked for above a rail that moves below the process when expanded", () => {
    expect(view).toContain("AgentWorkedForLabel");
    expect(view).toContain('reveal="duration"');
    expect(view).toContain("ProcessCollapseRail");
    expect(view).not.toContain("hideCollapsedDivider");
    expect(view).toContain("<CollapsibleContent");
    const contentAt = view.indexOf("<CollapsibleContent");
    const railAt = view.indexOf("<ProcessCollapseRail");
    expect(contentAt).toBeGreaterThan(-1);
    expect(railAt).toBeGreaterThan(contentAt);
    expect(view).toContain("collapseLabel");
    expect(view).not.toContain("ProcessDivider");
    expect(view).not.toContain("assistantTurn.process.show");
    expect(messageView).toContain('reveal="timestamp"');
    expect(messageView).not.toContain('className="ml-auto"');
    expect(messageView).toContain("<MessageTurnUsageBadge");
    const usageAt = messageView.indexOf("<MessageTurnUsageBadge");
    const timeAt = messageView.indexOf('reveal="timestamp"');
    expect(usageAt).toBeGreaterThan(-1);
    expect(timeAt).toBeGreaterThan(usageAt);
  });
});
