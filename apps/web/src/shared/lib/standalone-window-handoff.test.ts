import { describe, expect, it } from "bun:test";
import { makeStandaloneSurfaceKey } from "./standalone-window-handoff";

describe("makeStandaloneSurfaceKey", () => {
  it("scopes agent-chat handoff per tab so a pop-out does not pause every chat", () => {
    const first = makeStandaloneSurfaceKey("agent-chat", "ws", "p", "agent-chat:draft:one");
    const second = makeStandaloneSurfaceKey("agent-chat", "ws", "p", "agent-chat:draft:two");
    expect(first).not.toBe(second);
    expect(first).toContain(encodeURIComponent("agent-chat:draft:one"));
  });
});
