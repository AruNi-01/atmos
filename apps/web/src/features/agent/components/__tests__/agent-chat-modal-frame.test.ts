import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const panel = readFileSync(
  join(import.meta.dir, "../AgentChatPanel.tsx"),
  "utf8",
);

describe("agent chat modal frame", () => {
  it("drags and resizes through the DOM, then commits layout once", () => {
    const dragStart = panel.indexOf("const handleDragStart");
    const resizeStart = panel.indexOf("const handleResizeStart");
    const resizeCleanup = panel.indexOf("useEffect(() => {\n    return () => {\n      if (frameRafRef.current != null)");
    const drag = panel.slice(dragStart, resizeStart);
    const resize = panel.slice(resizeStart, resizeCleanup);

    expect(drag).toContain("scheduleModalFrame");
    expect(drag).toContain("commitModalFrame");
    expect(drag).not.toContain("updateLayout(");

    expect(resize).toContain("scheduleModalFrame");
    expect(resize).toContain("commitModalFrame");
    expect(resize).not.toContain("updateLayout(");

    expect(panel).toContain("translate3d");
    expect(panel).toContain("willChange: \"transform\"");
  });

  it("pins the permission card above the composer instead of the message stream", () => {
    expect(panel).toContain('<div className="flex min-h-0 w-full shrink-0 flex-col">');
    expect(panel).toContain('className={cn("shrink-0", wideContentClassName)}');
    expect(panel).toContain("<AgentPromptComposer");
    expect(panel).not.toContain("border-t border-border p-3");
    const contentAt = panel.indexOf("<ConversationContent");
    const confirmationAt = panel.indexOf("<AgentPermissionCard");
    const composerAt = panel.indexOf("<AgentPromptComposer");
    expect(contentAt).toBeGreaterThan(-1);
    expect(confirmationAt).toBeGreaterThan(contentAt);
    expect(composerAt).toBeGreaterThan(confirmationAt);
    expect(panel).not.toContain("hideCollapsedDivider");
  });

  it("centers a taller composer on new chat and docks a compact one after the session exists", () => {
    expect(panel).toContain("isAgentNewChatLanding");
    expect(panel).toContain('isNewChatLanding ? "justify-center overflow-y-auto pb-20" : "overflow-hidden"');
    expect(panel).toContain('isNewChatLanding ? "hidden" : "flex-1"');
    expect(panel).toContain("landing={isNewChatLanding}");
    expect(panel).toContain("LogoSvg");
    expect(panel).toContain("h-20 w-auto text-foreground");
    expect(panel).not.toContain("atmos-logo-breathe");
    expect(panel).not.toContain('t("empty.startTitle")');
  });

  it("shows a header History popover with search on the modal", () => {
    expect(panel).toContain('variant === "standalone" || variant === "modal"');
    expect(panel).toContain("historyTriggerClassName={historyTriggerClassName}");

    const header = readFileSync(
      join(import.meta.dir, "../AgentChatHeader.tsx"),
      "utf8",
    );
    expect(header).toContain("AgentChatHistoryPopover");

    const popover = readFileSync(
      join(import.meta.dir, "../AgentChatHistoryPopover.tsx"),
      "utf8",
    );
    expect(popover).toContain("filterAgentChatHistoryRows");
    expect(popover).toContain('aria-label={t("historyPopover.searchAria")}');
    expect(popover).toContain("searchPlaceholder");
    expect(popover).not.toContain("sourceLabel");
    expect(popover).toContain("agentChatCwdLabel");

    const session = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
      "utf8",
    );
    expect(session).toContain("agentChatHistoryListRequest");
    const thread = readFileSync(
      join(import.meta.dir, "../../lib/agent-chat-thread.ts"),
      "utf8",
    );
    expect(thread).toContain('origin: "quick"');
    expect(thread).toContain("all: true");
    expect(thread).toContain('input.variant === "standalone"');
  });

  it("keeps the scroll-to-bottom control centered above the composer", () => {
    const scrollButton = panel.slice(
      panel.indexOf("<ConversationScrollButton"),
      panel.indexOf("</ConversationScrollButton>"),
    );

    expect(scrollButton).toContain('aria-label={t("bottom")}');
    expect(scrollButton).not.toContain("hover:w-24");
    expect(scrollButton).not.toContain("border-dashed");
    expect(scrollButton).not.toContain("group-hover:max-w");
  });
});
