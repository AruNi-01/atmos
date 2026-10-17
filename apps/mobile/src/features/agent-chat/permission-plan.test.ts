// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { readFileSync } from "node:fs";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { dirname, join } from "node:path";
// @ts-expect-error node builtins are available to bun test but not in the mobile tsconfig types
import { fileURLToPath } from "node:url";
import {
  defaultAllowOptionId,
  defaultRejectOptionId,
  parsePlanOverviewFromMarkdown,
  planPermissionModel,
  planStepsFromTodos,
} from "./permission-plan";

describe("permission plan", () => {
  test("reads the same overview shape as the web plan parser", () => {
    const overview = parsePlanOverviewFromMarkdown(`# Optimize APP-068

Ship a seven-week plan across six dimensions.

## Steps
- [ ] Performance
- [ ] Architecture
- [x] Tests
`);
    expect(overview?.title).toBe("Optimize APP-068");
    expect(overview?.summary).toContain("seven-week");
    expect(overview?.steps.map((step) => step.title)).toEqual([
      "Performance",
      "Architecture",
      "Tests",
    ]);

    const prose = parsePlanOverviewFromMarkdown(`# Plan

Just a prose overview without todos.
`);
    expect(prose?.title).toBe("Plan");
    expect(prose?.steps).toEqual([]);
    expect(prose?.summary).toContain("prose overview");

    const bullets = parsePlanOverviewFromMarkdown(`# Rollout

## Steps
- Performance
- Architecture
1. Write tests
2. Ship
`);
    expect(bullets?.steps).toEqual([]);
    expect(bullets?.summary).toBeUndefined();

    const skipped = parsePlanOverviewFromMarkdown(
      `# Optimize APP-068

- [ ] smoke
`,
      { includeChecklistSteps: false },
    );
    expect(skipped?.steps).toEqual([]);
  });

  test("prefers structured to-dos and the web allow and reject ids", () => {
    expect(planStepsFromTodos([{ id: " a ", content: " Ship " }, { content: "  " }])).toEqual([
      { id: "a", title: "Ship" },
    ]);
    expect(defaultAllowOptionId([])).toBe("allow_once");
    expect(defaultRejectOptionId([])).toBe("reject_once");
    expect(
      defaultAllowOptionId([
        { option_id: "allow_always", name: "Always" },
        { option_id: "allow_once", name: "Once" },
      ]),
    ).toBe("allow_always");
    expect(
      defaultRejectOptionId([
        { option_id: "allow_once", name: "Allow" },
        { option_id: "reject_once", name: "Deny" },
      ]),
    ).toBe("reject_once");
    expect(defaultAllowOptionId([{ option_id: "once", name: "Once" }])).toBe("once");

    const model = planPermissionModel({
      description: "Exit plan",
      markdown: "# Plan\n\n- [ ] from markdown\n",
      options: [
        { option_id: "allow_once", name: "Allow" },
        { option_id: "reject_once", name: "Deny" },
      ],
      todos: [{ id: "1", content: "Structured" }],
    });
    expect(model.steps).toEqual([{ id: "1", title: "Structured" }]);
    expect(model.title).toBe("Plan");
    expect(model.allowId).toBe("allow_once");
    expect(model.rejectId).toBe("reject_once");

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "AgentChatPermissionCard.tsx"),
      "utf8",
    );
    const plan = source.slice(
      source.indexOf("function PlanPermission"),
      source.indexOf("export function AgentChatPermissionCard"),
    );
    expect(plan).toContain("copy.keepPlanning");
    expect(plan).toContain("copy.approve");
    expect(plan).toContain("copy.viewPlan");
    expect(plan).toContain("copy.viewTodos");
    expect(plan).toContain("copy.planTodosHeading");
    expect(plan).toContain("setViewingPlan");
    const empty = plan.slice(
      plan.indexOf("{copy.planViewerEmpty}") - 240,
      plan.indexOf("{copy.planViewerEmpty}"),
    );
    expect(empty).toContain("chatMutedForeground(theme.isDark)");
    expect(empty).not.toContain("theme.colors.secondaryLabel");
    const lanePlan = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "cards/plan-card.tsx"),
      "utf8",
    );
    expect(lanePlan).toContain("chatMutedForeground(theme.isDark)");
    expect(lanePlan).not.toContain("theme.colors.secondaryLabel");
    expect(plan).not.toContain("option.name");
    const command = source.slice(source.indexOf("export function AgentChatPermissionCard"));
    expect(command).toContain("isPlanExitRequest(request)");
    expect(command).toContain("PlanPermission");
  });
});
