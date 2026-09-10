import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(import.meta.dir, "../AgentActivityIndicator.tsx"),
  "utf8",
);

describe("agent activity indicator", () => {
  it("swaps status copy with a vertical exit/enter while keeping shimmer", () => {
    expect(source).toContain("AnimatePresence");
    expect(source).toContain('mode="popLayout"');
    expect(source).toContain("y: 12");
    expect(source).toContain("y: -12");
    expect(source).toContain("TextShimmer");
    expect(source).toContain("<ActivityIndicator");
    expect(source).toContain("const label = activity.trail === \"none\" ? activity.label : `${activity.label}...`");
    expect(source).toContain("{label}");
    expect(source).not.toContain("TextEffect");
    expect(source).not.toContain("textEffectBlurSlideVariants");
  });

  it("keeps traveling shimmer on the status copy", () => {
    expect(source).toContain("TextShimmer");
    expect(source).toContain('duration={1.5}');
  });

  it("matches session-lifecycle / tool-header icon + text chrome", () => {
    expect(source).toContain(
      'className="flex size-4 shrink-0 items-center justify-center overflow-visible"',
    );
    expect(source).toContain("const GLYPH_SIZE = 20");
    expect(source).toContain("size={GLYPH_SIZE}");
    expect(source).toContain("text-sm leading-5");
    expect(source).toContain("SlidingNumber");
    expect(source).toContain("WorkDurationClock");
    expect(source).toContain("DurationUnit");
    expect(source).toContain(
      'className="inline-flex min-w-0 max-w-full items-center gap-2 py-0.5 text-left text-sm leading-5 text-muted-foreground"',
    );
    expect(source).toContain(
      'className="relative inline-flex h-5 min-w-0 items-center overflow-hidden"',
    );
    expect(source).not.toContain("flex-1");
    expect(source).not.toContain("flex w-full");
    expect(source).toContain(
      'className="block max-w-full truncate text-sm leading-5"',
    );
    expect(source).toContain(
      '"inline-flex shrink-0 items-baseline font-mono text-sm tabular-nums leading-none text-muted-foreground"',
    );
    expect(source).not.toContain("px-1");
    expect(source).not.toContain("py-1.5");
    expect(source).not.toContain("text-xs");
  });

  it("is mounted as the last virtual transcript row footer while streaming", () => {
    const list = readFileSync(
      join(import.meta.dir, "../AgentChatTranscriptList.tsx"),
      "utf8",
    );
    const panel = readFileSync(
      join(import.meta.dir, "../AgentChatPanel.tsx"),
      "utf8",
    );
    expect(list).toContain("activityStatus");
    expect(list).toContain("item.index === lastIndex");
    expect(panel).toContain("activityStatus=");
    expect(panel).toContain("<AgentActivityIndicator activity={agentActivity}");
    const contentAt = panel.indexOf("<ConversationContent");
    const contentEndAt = panel.indexOf("</ConversationContent>");
    const composerAt = panel.indexOf("<AgentPromptComposer");
    expect(panel.slice(contentAt, contentEndAt)).toContain("<AgentActivityIndicator");
    expect(composerAt).toBeGreaterThan(contentEndAt);
  });
});
