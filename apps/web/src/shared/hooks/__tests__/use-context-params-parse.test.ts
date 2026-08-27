import { describe, expect, test } from "bun:test";

import { parseContextParams } from "@/shared/hooks/use-context-params";

describe("parseContextParams", () => {
  test("parses workspace and project routes", () => {
    expect(parseContextParams("/workspace", new URLSearchParams("id=w1"))).toMatchObject({
      currentView: "workspace",
      workspaceId: "w1",
      effectiveContextId: "w1",
    });
    expect(parseContextParams("/project", new URLSearchParams("id=p1"))).toMatchObject({
      currentView: "project",
      projectId: "p1",
      effectiveContextId: "p1",
    });
  });

  test("parses skills list and detail", () => {
    expect(parseContextParams("/skills", new URLSearchParams())).toMatchObject({
      currentView: "skills",
      skillId: null,
    });
    expect(
      parseContextParams("/skills", new URLSearchParams("scope=global&skillId=foo")),
    ).toMatchObject({
      currentView: "skills",
      skillScope: "global",
      skillId: "foo",
    });
  });

  test("parses standalone surfaces", () => {
    expect(parseContextParams("/token-usage", new URLSearchParams()).currentView).toBe(
      "token-usage",
    );
    expect(parseContextParams("/agent-observer", new URLSearchParams()).currentView).toBe(
      "agent-observer",
    );
    expect(parseContextParams("/pt-design", new URLSearchParams()).currentView).toBe(
      "pt-design",
    );
    expect(parseContextParams("/pt-design", new URLSearchParams()).effectiveContextId).toBeNull();
    expect(parseContextParams("/", new URLSearchParams()).currentView).toBe("welcome");
  });
});
