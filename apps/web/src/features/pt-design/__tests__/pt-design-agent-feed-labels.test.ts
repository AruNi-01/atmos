import { describe, expect, it } from "bun:test";

import { describePtDesignAgentCommand } from "../lib/pt-design-agent-feed-labels";
import { screenshotFromToolData } from "@/shared/lib/agent-surface-feed";
import { instanceIdsFromToolData } from "../lib/pt-design-agent-targets";

describe("describePtDesignAgentCommand", () => {
  it("maps remaining PTX tools", () => {
    expect(describePtDesignAgentCommand("pt_catalog_list").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_tools_list").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_screenshot").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_screenshot").label.toLowerCase()).toContain("screenshot");
    expect(describePtDesignAgentCommand("pt_ptx_get").kind).toBe("read");
    expect(describePtDesignAgentCommand("pt_ptx_apply").kind).toBe("edit");
    expect(describePtDesignAgentCommand("pt_doc_save").kind).toBe("edit");
  });

  it("maps Interact runtime agent actions", () => {
    const described = describePtDesignAgentCommand("pt_runtime_action", { name: "run" });
    expect(described.kind).toBe("edit");
    expect(described.label.toLowerCase()).toContain("run");
    expect(describePtDesignAgentCommand("pt_runtime_action").kind).toBe("edit");
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

  it("collects node ids from tool results", () => {
    expect(instanceIdsFromToolData({ instanceId: "a" })).toEqual(["a"]);
    expect(instanceIdsFromToolData({ nodeIds: ["run"] })).toEqual(["run"]);
  });
});
