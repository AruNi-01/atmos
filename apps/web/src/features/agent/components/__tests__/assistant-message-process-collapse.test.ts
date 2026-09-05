import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const view = readFileSync(
  join(import.meta.dir, "../AssistantMessageView.tsx"),
  "utf8",
);
const messageView = readFileSync(
  join(import.meta.dir, "../AgentChatMessageView.tsx"),
  "utf8",
);
const toolGroup = readFileSync(
  join(import.meta.dir, "../AgentToolGroupView.tsx"),
  "utf8",
);
const toolCard = readFileSync(
  join(import.meta.dir, "../tool-results/AgentToolCard.tsx"),
  "utf8",
);

describe("assistant process collapse chrome", () => {
  it("uses Worked for above a rail that moves below the process when expanded", () => {
    expect(view).toContain("AgentWorkedForLabel");
    expect(view).toContain('reveal="duration"');
    expect(view).toContain("ProcessCollapseRail");
    expect(view).not.toContain("hideCollapsedDivider");
    expect(view).toContain("<CollapsibleContent");
    expect(view).toContain("stepsExpanded");
    expect(view).toContain("processSegments.map");
    const contentAt = view.indexOf("<CollapsibleContent");
    const railAt = view.indexOf("<ProcessCollapseRail");
    expect(contentAt).toBeGreaterThan(-1);
    expect(railAt).toBeGreaterThan(contentAt);
    expect(view).toContain("processMounted");
    expect(view).toContain("collapseLabel");
    expect(view).not.toContain("ProcessDivider");
    expect(view).not.toContain("assistantTurn.process.show");
    expect(messageView).toContain("AgentComposerAttachmentList");
    expect(messageView).toContain('density="compact"');
    expect(messageView).toContain("composerFilesFromAttachmentParts");
    expect(messageView).not.toContain("AttachmentRemove");
    expect(messageView).toContain('reveal="timestamp"');
    expect(messageView).not.toContain('className="ml-auto"');
    expect(messageView).toContain("<MessageTurnUsageBadge");
    const usageAt = messageView.indexOf("<MessageTurnUsageBadge");
    const timeAt = messageView.indexOf('reveal="timestamp"');
    expect(usageAt).toBeGreaterThan(-1);
    expect(timeAt).toBeGreaterThan(usageAt);
  });

  it("keeps process open on settle when the user expanded tools during the stream", () => {
    expect(view).toContain("shouldAutoCollapseProcessOnSettle");
    expect(view).toContain("userInspecting");
    expect(view).toContain("markInspecting");
    expect(view).toContain("AssistantProcessInspectProvider");
    expect(toolGroup).toContain("useMarkAssistantProcessInspecting");
    expect(toolGroup).toContain("if (next) markInspecting()");
    expect(toolCard).toContain("useMarkAssistantProcessInspecting");
    expect(toolCard).toContain("if (next) markInspecting()");
  });

  it("reveals answer text with the same stream entrance as process rows", () => {
    expect(view).toContain("AgentStreamReveal");
    expect(view).not.toContain("return <React.Fragment key={segment.origIndex}>{content}</React.Fragment>");
  });

  it("lists this turn's file changes below copy and timestamp", () => {
    expect(view).not.toContain("AssistantTurnFileChanges");
    expect(messageView).toContain("AssistantTurnFileChanges");
    const copyAt = messageView.indexOf("MessageCopyButton");
    const filesAt = messageView.indexOf("<AssistantTurnFileChanges");
    expect(copyAt).toBeGreaterThan(-1);
    expect(filesAt).toBeGreaterThan(copyAt);
    expect(messageView).toContain("shouldShowAssistantTurnEndedChrome");
    expect(messageView).not.toContain("line-clamp-6");
    expect(messageView).not.toContain("data-transcript-mounted");
  });
});
