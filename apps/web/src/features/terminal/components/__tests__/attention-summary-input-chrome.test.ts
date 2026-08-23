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

  it("pins the overlay 6px above the pane edge so the collapsed pill is not flush", () => {
    const overlay = readSibling("TerminalAgentInputOverlay.tsx");
    const sideChat = readSibling("TerminalSideChatDots.tsx");
    const chrome = readSibling("TerminalChrome.tsx");
    expect(overlay).toContain(
      '"pointer-events-none absolute inset-x-0 bottom-1.5 z-[70] flex justify-center px-3"',
    );
    expect(overlay).not.toContain("bottom-px");
    expect(overlay).not.toContain("mb-px");
    expect(overlay).not.toContain("pb-px");
    expect(overlay).toContain(
      '"h-1 w-28 rounded-full shadow-[0_0_2px_rgba(0,0,0,0.16)] transition-[opacity,box-shadow] duration-200"',
    );
    expect(overlay).not.toContain('"h-1.5 w-28');
    expect(overlay).toContain("shadow-[0_0_2px_rgba(0,0,0,0.16)]");
    expect(sideChat).toContain("shadow-[0_0_2px_rgba(0,0,0,0.16)]");
    expect(sideChat).toContain('shouldShowIndicator ? "h-3 w-8 opacity-100"');
    expect(chrome).toContain("const padBottom = 12 * normalizedTerminalScale;");
    expect(readSibling("TerminalAgentInputShell.tsx")).toContain(
      "(isOverlayVisible || isSendAnimating || isSendExiting) && \"mb-1\"",
    );
    expect(overlay).not.toContain("-translate-y-1");
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
    expect(css).toContain("background: #8aa9b8 !important;");
    expect(css).not.toContain("background: #3e5460 !important;");
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
