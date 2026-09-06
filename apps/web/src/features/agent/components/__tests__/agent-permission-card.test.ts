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
    expect(card).toContain("planBody");
    expect(card).toContain("MarkdownRenderer");
    expect(card).toContain("setViewingPlan");
    expect(card).not.toContain("plan?.entries");
  });

  it("plan exit wins over command heuristics (markdown tables must not force command chrome)", () => {
    // Regression: plan body with `|` tables used to make looksLikeShellCommand
    // truthy, and `isPlanExit && !command` fell through to Permission requested.
    expect(card).toContain("if (isPlanExit)");
    expect(card).not.toContain("if (isPlanExit && !command)");
    expect(card).toContain("content_markdown");
    expect(card).toContain("/^#\\s*plan\\b/im.test(markdown)");
  });

  it("AskUser replies with answers JSON option_id", () => {
    expect(card).toContain("answers:${JSON.stringify(answers)}");
    expect(card).toContain("permission.questions");
  });

  it("plan exit resolves transcript plan.md or description path", () => {
    expect(card).toContain("resolvePlanExitFilePath");
    expect(card).toContain("findRecentPlanFilePath");
  });

  it("command actions render agent-advertised options dynamically", () => {
    expect(card).toContain("permissionCommandActions");
    expect(card).toContain("preferredPrimaryOptionId");
    expect(card).toContain("actions={commandActions.length > 0 ? commandActions : undefined}");
    expect(card).toContain("onAction={(optionId) => onRespond(optionId)}");
    expect(card).toContain("isAllowOnceOption");
  });

  it("command approve/reject fallbacks use backend option ids when present", () => {
    expect(card).toContain("defaultAllowOptionId");
    expect(card).toContain("defaultRejectOptionId");
    expect(card).toContain("allow_once");
    expect(card).toContain("reject_once");
    // Do not treat bare `once` / `reject_once` as an allow match via once alone.
    expect(card).toContain("/allow|accept|approve/i.test(option.option_id)");
    expect(card).not.toContain("/allow|accept|approve|once/i.test(option.option_id)");
  });

  it("plan exit View plan toggles panes; expands to 80cqh only while viewing plan", () => {
    expect(card).toContain('label: t("keepPlanning")');
    expect(card).toContain('t("viewPlan")');
    expect(card).toContain('t("viewTodos")');
    expect(card).toContain('label: t("approve")');
    expect(card).toContain("VIEW_PLAN_ACTION_ID");
    expect(card).toContain("actions={planActions}");
    expect(card).toContain("hasTodos");
    expect(card).toContain("if (hasTodos)");
    expect(card).toContain("showPlanPreview");
    expect(card).toContain('planView={showPlanPreview ? "body" : "todos"}');
    expect(card).toContain("plan={planSteps}");
    expect(card).toContain("hasTodos || showPlanPreview");
    expect(card).toContain("setViewingPlan((open) => !open)");
    expect(card).toContain('viewingPlan ? t("viewTodos") : t("viewPlan")');
    expect(card).toContain("max-h-[80cqh]");
    expect(card).toContain('"80cqh"');
    expect(card).toContain("structuredPlanSteps");
    expect(card).toContain("includeChecklistSteps");
    expect(card).toContain("planStepsFromPermissionTodos");
    expect(card).not.toContain("Dialog");
    expect(card).not.toContain("DialogContent");
    expect(card).not.toContain("onExpandPlan");
    expect(card).not.toContain("28cqh");
    expect(card).not.toContain("tallerPreview");
  });

  it("plan todos prefer structured planIntent / plan_todos over markdown checklists", () => {
    expect(card).toContain("planStepsFromIntent(planIntent)");
    expect(card).toContain("planStepsFromPermissionTodos(permission.plan_todos)");
    expect(card).toContain("includeChecklistSteps: !structuredPlanSteps?.length");
    // Prefer structured before markdown overview.steps.
    const structuredIdx = card.indexOf("if (structuredPlanSteps?.length) return structuredPlanSteps");
    const markdownIdx = card.indexOf("if (overview?.steps.length) return overview.steps");
    expect(structuredIdx).toBeGreaterThan(-1);
    expect(markdownIdx).toBeGreaterThan(structuredIdx);
  });

  it("plan exit todos view stays at 50cqh; plan preview expands without permanently covering composer", () => {
    expect(card).toContain("max-h-[50cqh]");
    expect(card).toContain("max-h-[80cqh]");
    expect(card).toContain('isPlanExit && showPlanPreview ? "max-h-[80cqh]" : "max-h-[50cqh]"');
    expect(card).not.toContain("28cqh");
    expect(card).not.toContain("max-h-[min(70vh,36rem)]");
    expect(card).not.toContain("min-h-[16rem]");
  });
});
