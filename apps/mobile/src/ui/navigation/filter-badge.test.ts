// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, test } from "bun:test";
import {
  EMPTY_WORKSPACE_HOME_FILTERS,
  workspaceHomeFilterCount,
} from "@/features/workspaces/workspace-home-list";
import { filterBadgeValue } from "@/ui/navigation/filter-badge";

describe("filter badge", () => {
  test("hides the badge until something is selected", () => {
    expect(filterBadgeValue(0)).toBeNull();
    expect(filterBadgeValue(2)).toBe(2);
    expect(filterBadgeValue(100)).toBe("99+");
  });

  test("counts every selected workspace filter, including automation", () => {
    expect(workspaceHomeFilterCount(EMPTY_WORKSPACE_HOME_FILTERS)).toBe(0);
    expect(
      workspaceHomeFilterCount({
        ...EMPTY_WORKSPACE_HOME_FILTERS,
        projectIds: ["p1"],
        statuses: ["in_progress", "blocked"],
        showAutomation: true,
      }),
    ).toBe(4);
  });
});
