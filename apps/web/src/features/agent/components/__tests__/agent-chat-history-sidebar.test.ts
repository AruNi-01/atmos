import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  chatRailLeftPx,
  chatTimelineFloats,
} from "../../hooks/use-agent-chat-history-sidebar-layout";

const sidebar = readFileSync(
  join(import.meta.dir, "../AgentChatHistorySidebar.tsx"),
  "utf8",
);
const session = readFileSync(
  join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
  "utf8",
);
const header = readFileSync(
  join(import.meta.dir, "../AgentChatHeader.tsx"),
  "utf8",
);
const panel = readFileSync(
  join(import.meta.dir, "../AgentChatPanel.tsx"),
  "utf8",
);

describe("agent chat standalone history sidebar", () => {
  it("keeps the directory on the left edge and the scrollbar on the full-width column", () => {
    expect(panel).toContain('data-agent-chat-history-overlay=""');
    expect(panel).toContain("absolute inset-y-0 left-0 z-30");
    expect(panel).not.toContain('historySidebarCollapsed ? "left-0" : "right-0"');
    expect(panel).not.toContain("grid-cols-[minmax(0,1fr)_minmax(0,48rem)_minmax(0,1fr)]");
    expect(panel).not.toContain("absolute inset-y-0 right-0 z-40");
    expect(panel).toContain("mx-auto w-full min-w-0 max-w-3xl");
    expect(panel).toContain("chatTimelineFloats(panelWidth)");
    expect(panel).toContain("chatRailLeftPx(");
  });

  it("anchors the message rail to the outer left, beside an open directory", () => {
    expect(chatTimelineFloats(0)).toBe(true);
    expect(chatTimelineFloats(700)).toBe(false);
    expect(chatTimelineFloats(1600)).toBe(true);
    expect(chatRailLeftPx(1600, 320, false)).toBe(0);
    // 1600px pane, 48rem column: the 320px directory leaves room for the rail.
    expect(chatRailLeftPx(1600, 320, true, 16)).toBe(320);
    // Directory fills the margin, so the rail stops at the column edge.
    expect(chatRailLeftPx(1200, 216, true, 16)).toBe(184);
  });

  it("reuses ChatAgentPicker for the new-session agent popover", () => {
    expect(sidebar).toContain("ChatAgentPicker");
    expect(sidebar).not.toContain("DropdownMenuItem");
  });

  it("renders each session with its agent icon instead of a bubble", () => {
    expect(sidebar).toContain("installedAgentById.get(session.provider_id)");
    expect(sidebar).toContain("registryId={session.provider_id}");
    expect(sidebar).toContain("registryIcon={sessionAgent?.icon}");
    expect(sidebar).not.toContain("MessageCircle");
  });

  it("keeps the new-session control enabled while another session is loading", () => {
    expect(sidebar).toContain("disabled={!canCreateNewSession}");
    expect(sidebar).not.toContain("disabled={!canCreateNewSession || isConnecting}");
    expect(sidebar).not.toContain("isConnecting: boolean");
  });

  it("loads thread, project, and workspace sessions on the standalone page", () => {
    expect(session).toContain("agentChatHistoryListRequest");
    const thread = readFileSync(
      join(import.meta.dir, "../../lib/agent-chat-thread.ts"),
      "utf8",
    );
    expect(thread).toContain('if (input.variant === "standalone")');
    expect(thread).toContain("return { all: true };");
  });

  it("applies the selected session title immediately instead of falling back to New session", () => {
    expect(session).toContain("setTitle(row.title?.trim() || null)");
    expect(session).toContain("setShouldScrambleAutoTitle(false)");
    expect(session).not.toContain("setHydrated(false)");
    expect(header).toContain(
      'displaySessionTitle || (chatId ? "" : t("header.newSession.defaultTitle"))',
    );
    expect(panel).toContain(
      "messages.length === 0 && !isConnecting && !isResumingHistory && !error",
    );
  });
});
