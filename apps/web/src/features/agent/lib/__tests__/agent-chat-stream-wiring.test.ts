import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");

function read(relative: string): string {
  return readFileSync(join(root, relative), "utf8");
}

describe("agent chat stream wiring", () => {
  it("memos historical assistant/tool rows and lifts expand state out of the virtual list", () => {
    const assistant = read("components/AssistantMessageView.tsx");
    const tool = read("components/ToolView.tsx");
    const list = read("components/AgentChatTranscriptList.tsx");
    expect(assistant).toContain("export const AssistantMessageView = React.memo");
    expect(assistant).toContain("useAgentChatExpand");
    expect(assistant).toContain("agentChatProcessExpandKey");
    expect(tool).toContain("export const ToolView = React.memo");
    expect(tool).toContain("AgentToolExpandIdProvider");
    expect(list).toContain("subagentMessages={");
    expect(list).toContain("inlineSubagentTools.get(message.id) ? messages : undefined");
    expect(list).toContain("measureElement");
    expect(list).toContain("useAnimationFrameWithResizeObserver: true");
    expect(list).toContain("anchorTo: \"end\"");
    expect(list).toContain("shouldAdjustTranscriptScrollOnItemSizeChange");
  });

  it("lifts user-message expand and selected-time state out of the virtual row", () => {
    const view = read("components/AgentChatMessageView.tsx");
    const body = read("components/UserMessageBody.tsx");
    expect(view).toContain("agentChatUserMetaExpandKey");
    expect(view).toContain("agentChatUserBodyExpandKey");
    expect(view).toContain("useAgentChatExpand");
    expect(view).not.toContain("const [metaOpen, setMetaOpen] = useState(false)");
    expect(body).toContain("expandKey");
    expect(body).toContain("ResizeObserver");
    expect(body).toContain("useAgentChatExpandStore");
  });

  it("timeline jump falls back to virtualizer.scrollToIndex for unmounted rows", () => {
    const list = read("components/AgentChatTranscriptList.tsx");
    expect(list).toContain("const measurement = virtualizer.measurementsCache[index]");
    expect(list).toContain("virtualizer.scrollToIndex(index, { align: \"start\", behavior: \"smooth\" })");
  });

  it("clears the expand store when the bound chat changes or the session unmounts", () => {
    const session = read("hooks/use-agent-chat-session.ts");
    expect(session).toContain("useAgentChatExpandStore.getState().reset()");
    expect(session).toMatch(
      /useEffect\(\(\) => \{\s*return \(\) => \{\s*useAgentChatExpandStore\.getState\(\)\.reset\(\);\s*\};\s*\}, \[activeChatId\]\);/,
    );
  });

  it("keeps expand state when the websocket reconnects", () => {
    const session = read("hooks/use-agent-chat-session.ts");
    const subscribeCleanup = session.slice(
      session.indexOf("hydratingRef.current = true;"),
      session.indexOf("void agentChatApi.unsubscribe(id);"),
    );
    expect(subscribeCleanup).not.toContain("useAgentChatExpandStore.getState().reset()");
    expect(session).toContain("}, [activeChatId, load, prefsRestored, wsConnected]");
    expect(session).toContain("}, [activeChatId]);");
  });

  it("follows the end until the user scrolls away, then shows the below-count control", () => {
    const list = read("components/AgentChatTranscriptList.tsx");
    const panel = read("components/AgentChatPanel.tsx");
    expect(list).toContain("stayPinnedToEndRef");
    expect(list).toContain("isTranscriptScrolledToEnd");
    expect(list).toContain("countMessagesBelowViewport");
    expect(panel).toContain("belowCountStore");
  });
});
