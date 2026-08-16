// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = import.meta.dir;

function readSibling(name: string): string {
  return readFileSync(join(dir, "..", name), "utf8");
}

describe("attention summary input chrome", () => {
  it("does not auto-open the composer when a summary is active", () => {
    const overlay = readSibling("TerminalAgentInputOverlay.tsx");
    expect(overlay).not.toContain("Auto-open rich input");
    expect(overlay).toContain(
      "const isOverlayVisible = isOpen || isSendAnimating || isSendExiting;",
    );
    expect(overlay).toContain(`        onMouseLeave={() => {
          if (
            !isPinned &&
            !isSendAnimating &&
            !isSendExiting &&
            !text.trim() &&
            attachments.length === 0
          ) {
            setIsOpen(false);
          }
        }}`);
  });

  it("attaches the summary card inside the input shell header", () => {
    const overlay = readSibling("TerminalAgentInputOverlay.tsx");
    const shell = readSibling("TerminalAgentInputShell.tsx");
    expect(overlay).toContain("header={");
    expect(overlay).toContain("AttentionSummaryPanel");
    expect(overlay).not.toMatch(
      /\{hasAttentionSummary && attentionSummary \? \(/,
    );
    expect(shell).toContain("terminal-agent-input-header");
    expect(shell).toContain("header?: React.ReactNode");
  });

  it("uses a muted dashed summary card instead of a highlighted overlay", () => {
    const panel = readSibling("AttentionSummaryPanel.tsx");
    expect(panel).toContain("border-dashed");
    expect(panel).toContain("dark:bg-[#0d171e]");
    expect(panel).toContain("bg-[#e7eef2]");
    expect(panel).toContain("hover:bg-muted");
    expect(panel).not.toContain("bg-sky-50");
    expect(panel).not.toContain("dark:bg-[#163042]");
    expect(panel).not.toContain("bg-sky-500/8");
    expect(panel).not.toContain("dark:bg-sky-400/10");
  });

  it("breathes the trigger bar whenever a summary is waiting, not only while summarizing", () => {
    const overlay = readSibling("TerminalAgentInputOverlay.tsx");
    const css = readSibling("TerminalAgentInputOverlay.css");
    expect(overlay).toContain(
      "isSummaryActive && !isOverlayVisible && \"terminal-agent-input-trigger--pulse\"",
    );
    expect(overlay).not.toContain(
      "isSummarySummarizing && \"terminal-agent-input-trigger--pulse\"",
    );
    expect(overlay).not.toContain("bg-sky-500");
    expect(css).toContain("background: #3e5460 !important;");
    expect(css).not.toContain("background: #0ea5e9 !important;");
  });

  it("puts the composer caret at the end when a next-step chip is picked", () => {
    const overlay = readSibling("TerminalAgentInputOverlay.tsx");
    expect(overlay).toContain("composerRef.current?.setText(step);");
    expect(overlay).toContain("composerRef.current?.focus();");
  });

  it("wires side-chat overlays to the same attention-summary pane id", () => {
    const modal = readSibling("TerminalSideChatModal.tsx");
    expect(modal).toContain("stablePaneId={sideChatStablePaneId(record)}");
  });
});
