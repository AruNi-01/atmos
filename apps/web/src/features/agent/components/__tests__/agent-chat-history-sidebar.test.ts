import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
