import { describe, expect, it } from "bun:test";
import { shouldCommitAgentChatSurface } from "../agent-chat-surface-live";

describe("agent chat surface live", () => {
  it("keeps sidebar and modal chats live regardless of workspace paint", () => {
    expect(
      shouldCommitAgentChatSurface({
        variant: "sidebar",
        visuallyActiveWorkspace: false,
        panelVisible: false,
      }),
    ).toBe(true);
    expect(
      shouldCommitAgentChatSurface({
        variant: "modal",
        visuallyActiveWorkspace: false,
        panelVisible: true,
      }),
    ).toBe(true);
  });

  it("commits a center chat only when its workspace is painted and the tab is visible", () => {
    expect(
      shouldCommitAgentChatSurface({
        variant: "center",
        visuallyActiveWorkspace: true,
        panelVisible: true,
      }),
    ).toBe(true);
    expect(
      shouldCommitAgentChatSurface({
        variant: "center",
        visuallyActiveWorkspace: false,
        panelVisible: true,
      }),
    ).toBe(false);
    expect(
      shouldCommitAgentChatSurface({
        variant: "center",
        visuallyActiveWorkspace: true,
        panelVisible: false,
      }),
    ).toBe(false);
  });
});
