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

  it("APP-069 S9 shows the session-op card in the permission slot and lets permission win", () => {
    expect(panel).toContain("<AgentSessionOpCard");
    const contentAt = panel.indexOf("<ConversationContent");
    const permissionBranchAt = panel.indexOf("{pendingPermission ?");
    const permissionAt = panel.indexOf("<AgentPermissionCard");
    const sessionOpAt = panel.indexOf("<AgentSessionOpCard");
    const composerAt = panel.indexOf("<AgentPromptComposer");
    expect(permissionBranchAt).toBeGreaterThan(contentAt);
    expect(permissionAt).toBeGreaterThan(permissionBranchAt);
    expect(sessionOpAt).toBeGreaterThan(permissionAt);
    expect(composerAt).toBeGreaterThan(sessionOpAt);
    const slot = panel.slice(permissionBranchAt, composerAt);
    expect(slot).toContain("pendingPermission ?");
    expect(slot).toContain("pendingSessionOp ?");
    expect(slot).toContain(") : pendingSessionOp ? (");
  });

  it("APP-069 S9/S10 does not intercept /fork or /rewind in the composer or chat api", () => {
    const composer = readFileSync(
      join(import.meta.dir, "../AgentPromptComposer.tsx"),
      "utf8",
    );
    const api = readFileSync(
      join(import.meta.dir, "../../../../api/ws/agent-chat-api.ts"),
      "utf8",
    );
    expect(composer).not.toMatch(/\/fork|\/rewind/);
    expect(api).toContain('wsRequest("agent_chat_session_op_respond"');
    expect(api).not.toContain("wsRequest<");
    expect(api).not.toMatch(/text\s*=\s*text\.replace/);
    expect(api).not.toMatch(/\/fork|\/rewind/);
  });

  it("applies verified session-op / catalog-error / rewind-view wire in the session hook", () => {
    const session = readFileSync(
      join(import.meta.dir, "../../hooks/use-agent-chat-session.ts"),
      "utf8",
    );
    expect(session).toContain("setPendingSessionOp(payload.request)");
    expect(session).toContain('payload.outcome === "failed"');
    expect(session).toContain("agentChatApi.sessionOpRespond");
    expect(session).toContain('next.status === "error" ? next.message?.trim()');
    expect(session).toContain('update.catalog.status === "error"');
    expect(session).toContain("agent_model_catalog_updated");
    expect(session).toContain("composerConfigOptions");
    expect(session).toContain("setCatalog(null);\n    setDescriptor(null);\n    setSupportsSteer(false);");
    expect(session).toContain('payload.type === "rewind_view_updated"');
    expect(session).toContain('payload.type === "session_forked"');
    expect(session).toContain("setActiveChatId(childId)");
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
