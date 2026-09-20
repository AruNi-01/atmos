import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const badges = readFileSync(join(import.meta.dir, "../UsageBadges.tsx"), "utf8");
const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
  "utf8",
);
const overlays = readFileSync(
  join(import.meta.dir, "../AgentChatAboveComposerOverlays.tsx"),
  "utf8",
);

describe("context window usage control", () => {
  it("uses theme foreground for normal tone and keeps warning yellow", () => {
    expect(badges).toContain('tone === "warning" ? "text-warning" : "text-foreground"');
    expect(badges).toContain('tone === "warning" ? "bg-warning" : "bg-foreground"');
    expect(badges).not.toContain("text-info");
    expect(badges).not.toContain("bg-info");
  });

  it("floats a detached card above the composer instead of a connected stack or popover", () => {
    expect(badges).toContain("ContextUsageDetailsPanel");
    expect(badges).toContain("data-agent-context-usage-panel");
    expect(badges).toContain("w-full rounded-3xl border border-border");
    expect(badges).not.toContain("embedded");
    expect(badges).not.toContain("PopoverContent");
    expect(badges).not.toContain("PopoverTrigger");
    expect(badges).not.toContain("contextWindowUsesInlinePanel");
    expect(badges).not.toContain("inlinePanel");
    expect(composer).toContain("<AgentChatAboveComposerOverlays");
    expect(overlays).toContain("<ContextUsageDetailsPanel");
    expect(overlays).toContain("showContextUsageCard");
    expect(overlays).toContain('data-agent-chat-above-composer-overlays=""');
    expect(overlays).toContain(
      '"pointer-events-none absolute inset-x-0 bottom-full z-20 flex w-full min-h-0 flex-col gap-2 has-[.pointer-events-auto]:pb-2"',
    );
    expect(overlays).toContain("AnimatePresence");
    expect(overlays).toContain('key="agent-context-usage"');
    expect(overlays).toContain("OVERLAY_CARD_FADE_HIDDEN");
    expect(overlays).toContain("opacity: 0");
    expect(overlays).toContain("opacity: 1");
    expect(overlays).toContain('width: "100%"');
    expect(overlays).not.toContain("scale:");
    expect(overlays).not.toContain('position: "absolute"');
    expect(overlays).not.toContain("y: 10");
    expect(overlays).not.toContain("originY");
    // Floating cards match the prompt lane. When plan/queue/background docks
    // are present they stay inset (mx-6) and the overlay uses px-6 to align.
    expect(overlays).toContain("OVERLAY_CARD_MAX_HEIGHT_CLASS");
    expect(overlays).toContain("pointer-events-auto flex min-h-0 w-full max-w-full flex-col overflow-hidden");
    expect(overlays).not.toContain("pointer-events-auto mx-6\">\n                <ContextUsageDetailsPanel");
    expect(overlays).toContain('hasUpperComposerCards && "px-6"');
    expect(composer).not.toContain("showComposerCardStack");
    expect(composer).not.toContain("contextWindowUsesInlinePanel");
    expect(composer).not.toContain("contextUsageInlinePanel");
    expect(overlays).not.toContain("<ContextUsageDetailsPanel\n              usage={sessionUsage}\n              providerId={registryId}\n              embedded");
    // Context usage / approvals float above the input with a gap. Plan and
    // queue sit in-flow, inset, and flush against the prompt chrome.
    const overlayAt = overlays.indexOf("data-agent-chat-above-composer-overlays");
    const panelAt = overlays.indexOf("<ContextUsageDetailsPanel");
    const queueAt = composer.indexOf("<MessageQueueDock");
    const promptAt = composer.indexOf("<PromptInputProvider>");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(overlayAt);
    expect(queueAt).toBeGreaterThan(composer.indexOf("<AgentChatAboveComposerOverlays"));
    expect(promptAt).toBeGreaterThan(queueAt);
    expect(composer).toContain(
      "relative z-[1] mx-6 overflow-hidden rounded-t-3xl border border-b-0 border-foreground/10 bg-foreground/[0.04]",
    );
    expect(composer).not.toContain("mx-6 overflow-hidden rounded-3xl border border-border/70 bg-background/95");
    expect(composer).not.toContain("border-b-0 border-border/70 bg-background/95");
  });

  it("does not invent category breakdown rows without wire data", () => {
    expect(badges).not.toContain("System prompt");
    expect(badges).not.toContain("Tool definitions");
    expect(badges).not.toContain("category");
  });

  it("presents quota rows from their own window data instead of inheriting reset onto extra usage", () => {
    expect(badges).toContain("presentQuotaMetric");
    expect(badges).not.toContain("displayResetText(");
  });

  it("keeps last quota numbers and shows the latest fetch failure below context usage", () => {
    expect(badges).toContain("<QuotaFetchFailureBanner");
    expect(badges).toContain("formatQuotaFetchFailureMessage");
    expect(badges).toContain("fetchFailureMessage");
    const bannerAt = badges.indexOf("<QuotaFetchFailureBanner");
    const barAt = badges.indexOf("<ContextUsageBar");
    expect(bannerAt).toBeGreaterThan(-1);
    expect(barAt).toBeGreaterThan(-1);
    expect(bannerAt).toBeGreaterThan(barAt);
  });
});
