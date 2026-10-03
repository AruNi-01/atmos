import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

function readRel(rel: string) {
  return readFileSync(join(import.meta.dir, rel), "utf8");
}

describe("FindPanel", () => {
  test("is the shared CodeMirror-styled find UI without replace", () => {
    const panel = readRel("../FindPanel.tsx");
    const css = readRel("../find-panel.css");
    const markdown = readRel("../MarkdownFindPanel.tsx");

    expect(panel).toContain("cm-atmos-search");
    expect(panel).toContain("scopeSelector");
    expect(panel).toContain("onQueryChange");
    expect(panel).toContain("grewFromEmpty");
    expect(panel).toContain("seedFromSelection");
    expect(panel).toContain('useTranslations("editor.codeMirrorSearchPanel")');
    expect(panel).not.toContain("replaceWith");
    expect(panel).not.toContain("agentSessions");
    expect(panel).not.toContain("HostSession");
    expect(css).toContain(".cm-atmos-search");
    expect(css).not.toContain("backdrop-filter");
    expect(css).not.toContain("box-shadow");
    expect(panel).toContain("contentFindHighlightRect");
    expect(panel).toContain("FindHighlightLayer");
    expect(panel).toContain("FindHighlightProvider");
    expect(panel).toContain("useFindLayoutNonce");
    expect(panel).toContain("data-user-message-collapsed");
    expect(panel).not.toContain("#fde047");
    expect(panel).not.toContain("#fef08a");
    const highlight = readRel("../find-highlight.tsx");
    expect(highlight).toContain("absolute inset-0 z-10");
    expect(highlight).toContain("SEARCH_MATCH_BACKGROUND");
    expect(highlight).not.toContain("fixed top-0 left-0 z-10");
    const color = readRel("../../../../shared/lib/search-highlight.ts");
    const settings = readRel("../../../settings/components/SettingsModal.tsx");
    expect(color).toContain("rgb(96 165 250 / 0.38)");
    expect(settings).toContain("SEARCH_MATCH_BACKGROUND");
    expect(panel).not.toContain("root.scrollTop");
    expect(panel).not.toContain('addEventListener("scroll"');
    expect(markdown).toContain('from "./FindPanel"');
    expect(markdown).toContain("seedFromSelection");
    expect(markdown).toContain("searchPanel.findInFile");
  });

  test("agent chat and host session transcripts consume FindPanel", () => {
    const chat = readRel("../../../agent/components/AgentChatPanel.tsx");
    const host = readRel("../../../agent-sessions/components/HostSessionDetailView.tsx");
    expect(chat).toContain("@/features/editor/components/FindPanel");
    expect(chat).toContain("FindHighlightProvider");
    expect(chat).toContain("TRANSCRIPT_FIND_SCOPE");
    expect(host).toContain("@/features/editor/components/FindPanel");
    expect(host).toContain("FindHighlightProvider");
    expect(host).toContain("TRANSCRIPT_FIND_SCOPE");
    expect(host).toContain("onQueryChange");
    expect(host).toContain("keepMessageIndexes");
    expect(host).toContain("transcriptFindMessageIndexes");
    expect(host).not.toContain("HostSessionFindPanel");
  });
});
