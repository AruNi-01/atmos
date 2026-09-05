import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const card = readFileSync(
  join(import.meta.dir, "../AgentPermissionCard.tsx"),
  "utf8",
);

describe("agent permission card", () => {
  it("uses AIcss ApprovalCard command/questions/plan variants", () => {
    expect(card).toContain("ApprovalCard");
    expect(card).toContain('variant="command"');
    expect(card).toContain('variant="questions"');
    expect(card).toContain('variant="plan"');
    expect(card).toContain("data-agent-chat-permission");
  });

  it("plan exit uses overview markdown or plan-intent steps, not execution TodoWrite", () => {
    expect(card).toContain("planIntent");
    expect(card).toContain("parsePlanOverviewFromMarkdown");
    expect(card).toContain("planFilePath");
    expect(card).toContain("data-agent-plan-viewer");
    expect(card).toContain("setViewingPlan");
    expect(card).not.toContain("plan?.entries");
  });

  it("AskUser replies with answers JSON option_id", () => {
    expect(card).toContain("answers:${JSON.stringify(answers)}");
    expect(card).toContain("permission.questions");
  });

  it("plan exit resolves transcript plan.md or description path", () => {
    expect(card).toContain("resolvePlanExitFilePath");
    expect(card).toContain("findRecentPlanFilePath");
  });

  it("command approve/reject use backend option ids when present", () => {
    expect(card).toContain("defaultAllowOptionId");
    expect(card).toContain("defaultRejectOptionId");
    expect(card).toContain("allow_once");
    expect(card).toContain("reject_once");
    // Do not treat bare `once` / `reject_once` as an allow match.
    expect(card).toContain("/allow|accept|approve/i.test(option.option_id)");
    expect(card).not.toContain("/allow|accept|approve|once/i.test(option.option_id)");
  });
});
