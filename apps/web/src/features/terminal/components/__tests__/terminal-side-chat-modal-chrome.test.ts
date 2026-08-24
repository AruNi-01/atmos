// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const modal = readFileSync(
  join(import.meta.dir, "../TerminalSideChatModal.tsx"),
  "utf8",
);

describe("terminal side chat modal chrome", () => {
  it("does not steal terminal focus on header pointerdown", () => {
    const headerDownAt = modal.indexOf("const handleHeaderPointerDown");
    const headerClickAt = modal.indexOf("const handleHeaderClick");
    const headerDown = modal.slice(headerDownAt, headerClickAt);
    expect(headerDown).toContain("isSideChatControlTarget(event.target)");
    expect(headerDown).toContain("handleDragStart(event)");
    expect(headerDown).not.toContain("claimSideChatFocus");
    expect(modal).toContain("onClick={handleHeaderClick}");
  });

  it("keeps minimize and close controls from starting a drag", () => {
    expect(modal).toContain("onPointerDown={stopControlPointerDown}");
    expect(modal).toContain('data-side-chat-control="true"');
    expect(modal).toContain("onHide()");
    expect(modal).not.toContain("onClick={() => setCloseAllConfirmOpen(true)}");
  });

  it("does not dismiss the close popover when focus returns to the modal terminal", () => {
    expect(modal).toContain("onFocusOutside=");
    expect(modal).toContain("modalRef.current?.contains(target)");
    expect(modal).toContain("onCloseAutoFocus={(event) => event.preventDefault()}");
    expect(modal).toContain("z-[200]");
  });

  it("swaps the agent icon for a close control on tab hover", () => {
    expect(modal).toContain("SideChatTabLeadingIcon");
    expect(modal).toContain("group-hover:invisible");
    expect(modal).toContain("group-hover:opacity-100");
    expect(modal).toContain("color={record.color_hex}");
    expect(modal).toContain("<AgentIcon");
    expect(modal).not.toContain('className="size-2 shrink-0 rounded-full"');
    expect(modal).not.toContain("group/side-tab");
    expect(modal).not.toContain('isActive && "pr-7"');
  });
});
