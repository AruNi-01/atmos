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
      '"pointer-events-none absolute inset-x-0 bottom-full z-20 flex flex-col gap-2 has-[*]:pb-2"',
    );
    expect(composer).toContain("AnimatePresence");
    expect(composer).toContain('key="agent-context-usage"');
    expect(composer).toContain('position: "absolute"');
    // Match prompt input width (full lane); do not inherit plan/queue mx-6 inset.
    expect(composer).toContain('"pointer-events-auto w-full"');
    expect(composer).not.toContain("pointer-events-auto mx-6\">\n                <ContextUsageDetailsPanel");
    expect(composer).not.toContain("showComposerCardStack");
    expect(composer).not.toContain("contextWindowUsesInlinePanel");
    expect(composer).not.toContain("contextUsageInlinePanel");
    expect(composer).not.toContain("<ContextUsageDetailsPanel\n              usage={sessionUsage}\n              providerId={registryId}\n              embedded");
    // Floats in the above-input overlay lane with plan/queue/approve; not joined to input chrome.
    const overlayAt = composer.indexOf("data-agent-chat-above-composer-overlays");
    const panelAt = composer.indexOf("<ContextUsageDetailsPanel");
    const queueAt = composer.indexOf("<MessageQueueDock");
    const promptAt = composer.indexOf("<PromptInputProvider>");
    expect(overlayAt).toBeGreaterThan(-1);
    expect(queueAt).toBeGreaterThan(overlayAt);
    expect(panelAt).toBeGreaterThan(queueAt);
    expect(promptAt).toBeGreaterThan(panelAt);
    expect(composer).toContain("rounded-3xl border border-border/70 bg-background/95");
    expect(composer).not.toContain("rounded-t-3xl border border-border/70 border-b-0");
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
});
