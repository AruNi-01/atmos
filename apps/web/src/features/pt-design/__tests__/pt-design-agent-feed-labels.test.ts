import { describe, expect, it } from "bun:test";

import { describePtDesignAgentCommand } from "../lib/pt-design-agent-feed-labels";
import { screenshotFromToolData } from "@/shared/lib/agent-surface-feed";
import { instanceIdsFromToolData } from "../lib/pt-design-agent-targets";

describe("describePtDesignAgentCommand", () => {
  it("maps read and layout tools", () => {
    expect(describePtDesignAgentCommand("pt_catalog_list").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_lint").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_layout_grid").kind).toBe("layout");
    expect(describePtDesignAgentCommand("pt_screenshot").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_screenshot").label.toLowerCase()).toContain("screenshot");
  });

  it("includes the component type when placing", () => {
    const d = describePtDesignAgentCommand("pt_place", { componentType: "card" });
    expect(d.kind).toBe("create");
    expect(d.label.toLowerCase()).toContain("card");
  });
});

describe("pt-design agent result helpers", () => {
  it("reads screenshot dataUrl from live capture payloads", () => {
    expect(
      screenshotFromToolData({
        dataUrl: "data:image/png;base64,abc",
        width: 120,
        height: 80,
      }),
    ).toEqual({
      dataUrl: "data:image/png;base64,abc",
      width: 120,
      height: 80,
    });
    expect(screenshotFromToolData({ ok: true })).toBeNull();
  });

  it("collects instance ids from place and batch results", () => {
    expect(instanceIdsFromToolData({ instanceId: "a" })).toEqual(["a"]);
    expect(
      instanceIdsFromToolData({
        results: [
          { ok: true, data: { instanceId: "one" } },
          { ok: false, data: { instanceId: "nope" } },
        ],
      }),
    ).toEqual(["one"]);
  });
});
