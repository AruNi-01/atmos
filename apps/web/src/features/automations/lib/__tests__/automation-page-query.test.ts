import { describe, expect, it } from "bun:test";

import {
  automationsCreateQuery,
  automationsEditQuery,
  automationsListQuery,
  automationsViewFromLocation,
  parseAutomationsView,
  resolveAutomationsPageView,
} from "../automation-page-query";

describe("automation-page-query", () => {
  it("parses setup views and defaults the rest to list", () => {
    expect(parseAutomationsView("create")).toBe("create");
    expect(parseAutomationsView("edit")).toBe("edit");
    expect(parseAutomationsView("history")).toBe("history");
    expect(parseAutomationsView("list")).toBe("list");
    expect(parseAutomationsView(null)).toBe("list");
    expect(parseAutomationsView("other")).toBe("list");
  });

  it("reads automationView from a location search string", () => {
    expect(automationsViewFromLocation("?automationView=create")).toBe("create");
    expect(automationsViewFromLocation("automationView=edit")).toBe("edit");
    expect(automationsViewFromLocation("")).toBe("list");
  });

  it("shows setup if either the hook or the address bar is on create", () => {
    expect(resolveAutomationsPageView("list", "create")).toBe("create");
    expect(resolveAutomationsPageView("create", "list")).toBe("create");
    expect(resolveAutomationsPageView("create", "create")).toBe("create");
    expect(resolveAutomationsPageView("list", "list")).toBe("list");
  });

  it("builds atomic create/list/edit patches", () => {
    expect(automationsCreateQuery()).toEqual({
      automationView: "create",
      automationId: null,
      automationRun: null,
    });
    expect(automationsEditQuery("job-1")).toEqual({
      automationView: "edit",
      automationId: "job-1",
      automationRun: null,
    });
    expect(automationsListQuery({ automationRun: "run-1" })).toEqual({
      automationView: "list",
      automationId: null,
      automationRun: "run-1",
    });
  });
});
