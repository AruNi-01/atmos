import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const card = readFileSync(join(import.meta.dir, "approval-card.tsx"), "utf8");

describe("approval-card dynamic actions", () => {
  it("supports actions[] + onAction for command permission chrome", () => {
    expect(card).toContain("export interface ApprovalAction");
    expect(card).toContain("actions?: ApprovalAction[]");
    expect(card).toContain("onAction?: (actionId: string) => void");
    expect(card).toContain("actions && actions.length > 0");
    expect(card).toContain("onAction?.(action.id)");
  });

  it("accepts optional planBody for injected plan markdown preview", () => {
    expect(card).toContain("planBody?: ReactNode");
    expect(card).toContain("planView?: \"body\" | \"todos\"");
    expect(card).toContain("data-approval-plan-body");
    expect(card).toContain("canSwitchPlanPanes");
    expect(card).toContain("activePlanPane");
  });

  it("crossfades plan body ↔ todos when both panes are mounted", () => {
    expect(card).toContain("styles.planSwitch");
    expect(card).toContain("styles.planPane");
    expect(card).toContain('data-pane="body"');
    expect(card).toContain('data-pane="todos"');
    expect(card).toContain("planPaneAnimate");
  });

  it("plan variant has no Maximize control (footer View plan / View todos instead)", () => {
    expect(card).not.toContain('aria-label="Expand plan"');
    expect(card).not.toContain("Maximize2");
    expect(card).not.toContain("onExpandPlan");
    expect(card).toContain("renderInlineMarkdown");
    expect(card).toContain("setPlanExpanded");
  });

  it("keeps binary approve/reject when actions are absent", () => {
    expect(card).toContain("handleReject()");
    expect(card).toContain("handleApprove()");
    expect(card).toContain("resolvedReject");
    expect(card).toContain("resolvedApprove");
  });
});
