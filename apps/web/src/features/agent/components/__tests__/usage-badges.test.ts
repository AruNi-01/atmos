import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const badges = readFileSync(join(import.meta.dir, "../UsageBadges.tsx"), "utf8");
const composer = readFileSync(
  join(import.meta.dir, "../AgentPromptComposer.tsx"),
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
    expect(composer).toContain("<ContextUsageDetailsPanel");
    expect(composer).toContain("showContextUsageCard");
    expect(composer).toContain('data-agent-chat-above-composer-overlays=""');
    expect(composer).toContain(
      '"pointer-events-none absolute inset-x-0 bottom-full z-20 flex w-full flex-col gap-2 has-[.pointer-events-auto]:pb-2"',
    );
    expect(composer).toContain("AnimatePresence");
    expect(composer).toContain('key="agent-context-usage"');
    expect(composer).toContain('position: "absolute"');
    // Floating cards match the prompt lane. When plan/queue/background docks
    // are present they stay inset (mx-6) and the overlay uses px-6 to align.
    expect(composer).toContain('"pointer-events-auto w-full"');
    expect(composer).not.toContain("pointer-events-auto mx-6\">\n                <ContextUsageDetailsPanel");
    expect(composer).toContain('hasUpperComposerCards && "px-6"');
    expect(composer).not.toContain("showComposerCardStack");
    expect(composer).not.toContain("contextWindowUsesInlinePanel");
    expect(composer).not.toContain("contextUsageInlinePanel");
    expect(composer).not.toContain("<ContextUsageDetailsPanel\n              usage={sessionUsage}\n              providerId={registryId}\n              embedded");
    // Context usage / approvals float above the input with a gap. Plan and
    // queue sit in-flow, inset, and flush against the prompt chrome.
    const overlayAt = composer.indexOf("data-agent-chat-above-composer-overlays");
    const panelAt = composer.indexOf("<ContextUsageDetailsPanel");
    const queueAt = composer.indexOf("<MessageQueueDock");
    const promptAt = composer.indexOf("<PromptInputProvider>");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(panelAt).toBeGreaterThan(overlayAt);
    expect(queueAt).toBeGreaterThan(panelAt);
    expect(promptAt).toBeGreaterThan(queueAt);
    expect(composer).toContain(
      "relative z-[1] mx-6 -mb-px overflow-hidden rounded-t-3xl border border-b-0 border-foreground/10 bg-foreground/[0.04]",
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
