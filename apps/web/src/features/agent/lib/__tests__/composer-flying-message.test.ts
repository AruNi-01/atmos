import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import {
  buildComposerFlyingMessage,
  composerFlyTarget,
  composerShellOrigin,
} from "@/features/agent/lib/composer-flying-message";

describe("buildComposerFlyingMessage", () => {
  it("returns null without origin, target, or text", () => {
    expect(buildComposerFlyingMessage({
      id: 1,
      text: "hello",
      from: null,
      to: { x: 10, y: 20 },
    })).toBeNull();
    expect(buildComposerFlyingMessage({
      id: 1,
      text: "hello",
      from: { x: 10, y: 20 },
      to: null,
    })).toBeNull();
    expect(buildComposerFlyingMessage({
      id: 1,
      text: "   ",
      from: { x: 10, y: 20 },
      to: { x: 30, y: 40 },
    })).toBeNull();
  });

  it("collapses whitespace and truncates long prompts", () => {
    const message = buildComposerFlyingMessage({
      id: 7,
      text: "  hello   world  ",
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
    });
    expect(message).toEqual({
      id: 7,
      text: "hello world",
      from: { x: 1, y: 2 },
      to: { x: 3, y: 4 },
    });
    const long = buildComposerFlyingMessage({
      id: 8,
      text: "a".repeat(100),
      from: { x: 0, y: 0 },
      to: { x: 1, y: 1 },
    });
    expect(long?.text).toHaveLength(90);
    expect(long?.text.endsWith("...")).toBe(true);
  });
});

describe("composer flying message animation", () => {
  it("reuses the terminal fly trajectory without the input sweep", () => {
    const css = readFileSync(
      join(import.meta.dir, "../../components/composer-flying-message.css"),
      "utf8",
    );
    expect(css).toContain("@keyframes agentComposerFlyMessage");
    expect(css).toContain("scale(0.28)");
    expect(css).toContain("520ms cubic-bezier(0.22, 1, 0.36, 1)");
    expect(css).not.toContain("terminalAgentBlueSweep");
    expect(css).not.toContain("send-sweep");
  });

  it("scopes origin and target to the sending composer instead of the first tab in the document", () => {
    const source = readFileSync(
      join(import.meta.dir, "../composer-flying-message.ts"),
      "utf8",
    );
    expect(source).toContain("closest<HTMLElement>(\"[data-agent-chat-column]\")");
    expect(source).toContain("[data-agent-chat-transcript] [data-index]");
    expect(source).toContain("AGENT_CHAT_TRANSCRIPT_GAP");
    expect(source).toContain("anchor.bottom");
    expect(source).not.toContain("AGENT_CHAT_USER_ROW_ESTIMATE");
    expect(source).not.toContain("scrollIntoView");
    expect(source).not.toContain("scrollToBottom");
    expect(source).not.toContain("document.querySelector");
    expect(source).not.toContain("columnRect.bottom - 160");
    expect(source).not.toContain("pad.top - 12");
    expect(source).not.toContain("transcript.bottom - 48");
    const messageView = readFileSync(
      join(import.meta.dir, "../../components/AgentChatMessageView.tsx"),
      "utf8",
    );
    expect(messageView).toContain("data-agent-chat-message-role={message.role}");
    expect(messageView).toContain("<AssistantTurnFileChanges");
  });
});

type Box = { left: number; top: number; width: number; height: number };

function stubRect(el: Element, box: Box) {
  (el as HTMLElement).getBoundingClientRect = () => {
    const right = box.left + box.width;
    const bottom = box.top + box.height;
    return {
      x: box.left,
      y: box.top,
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.height,
      right,
      bottom,
      toJSON() {
        return this;
      },
    } as DOMRect;
  };
}

function mountChat({
  doc,
  landing,
  composerBox,
  padBox,
}: {
  doc: Document;
  landing: boolean;
  composerBox: Box;
  padBox: Box;
}) {
  const column = doc.createElement("div");
  column.setAttribute("data-agent-chat-column", "");
  const content = doc.createElement("div");
  content.setAttribute("data-canvas-selectable-text", "");
  if (landing) content.className = "hidden";
  const list = doc.createElement("div");
  list.setAttribute("data-agent-chat-transcript", "virtual");
  const pad = doc.createElement("div");
  pad.setAttribute("data-agent-chat-transcript-bottom-pad", "");
  content.append(list, pad);
  const composer = doc.createElement("div");
  composer.setAttribute("data-agent-chat-composer", "");
  if (landing) composer.setAttribute("data-agent-composer-landing", "true");
  const form = doc.createElement("form");
  const dock = doc.createElement("div");
  dock.setAttribute("data-agent-message-queue", "");
  composer.append(dock, form);
  column.append(content, composer);
  doc.body.append(column);

  stubRect(column, {
    left: 100,
    top: 0,
    width: 800,
    height: 900,
  });
  stubRect(composer, composerBox);
  stubRect(form, composerBox);
  stubRect(dock, {
    left: composerBox.left + 24,
    top: composerBox.top - 40,
    width: composerBox.width - 48,
    height: 36,
  });
  stubRect(pad, padBox);
  stubRect(content, padBox);
  return { column, composer, form, dock, pad, list };
}

function appendRow(
  list: HTMLElement,
  doc: Document,
  {
    role,
    box,
    index = 0,
  }: {
    role: "user" | "assistant";
    box: Box;
    index?: number;
  },
) {
  const row = doc.createElement("div");
  row.setAttribute("data-index", String(index));
  const message = doc.createElement("div");
  message.setAttribute("data-agent-chat-message", `${role}-${index}`);
  message.setAttribute("data-agent-chat-message-role", role);
  row.append(message);
  list.append(row);
  stubRect(row, box);
  stubRect(message, box);
  return { row, message };
}

describe("composer fly coordinates", () => {
  const windows: Window[] = [];

  afterEach(() => {
    for (const win of windows.splice(0)) {
      win.happyDOM.close();
    }
  });

  function documentOf() {
    const win = new Window();
    windows.push(win);
    return win.document as unknown as Document;
  }

  it("uses this composer, not a sibling tab's centered or docked input", () => {
    const doc = documentOf();
    const other = mountChat({
      doc,
      landing: true,
      composerBox: { left: 120, top: 320, width: 760, height: 120 },
      padBox: { left: 0, top: 0, width: 0, height: 0 },
    });
    const active = mountChat({
      doc,
      landing: false,
      composerBox: { left: 120, top: 760, width: 760, height: 120 },
      padBox: { left: 120, top: 700, width: 760, height: 24 },
    });
    appendRow(other.list, doc, {
      role: "assistant",
      box: { left: 120, top: 40, width: 760, height: 80 },
    });
    appendRow(active.list, doc, {
      role: "assistant",
      box: { left: 120, top: 400, width: 760, height: 180 },
    });

    expect(composerShellOrigin(active.composer)).toEqual({ x: 500, y: 820 });
    expect(composerShellOrigin(other.composer)).toEqual({ x: 500, y: 380 });
    expect(composerFlyTarget("conversation", active.composer)).toEqual({
      x: 844,
      y: 608,
    });
  });

  it("places the next user bubble after the last row, including assistant file changes", () => {
    const doc = documentOf();
    const active = mountChat({
      doc,
      landing: false,
      composerBox: { left: 120, top: 760, width: 760, height: 120 },
      padBox: { left: 120, top: 700, width: 760, height: 24 },
    });
    appendRow(active.list, doc, {
      role: "assistant",
      index: 0,
      box: { left: 120, top: 180, width: 760, height: 120 },
    });
    const files = appendRow(active.list, doc, {
      role: "assistant",
      index: 1,
      box: { left: 120, top: 312, width: 760, height: 260 },
    });

    const target = composerFlyTarget("conversation", active.composer);
    expect(target).toEqual({
      x: 844,
      y: 600,
    });
    expect(target!.y).toBeGreaterThan(files.row.getBoundingClientRect().bottom);
  });

  it("does not reuse a previous user bubble when an assistant turn is last", () => {
    const doc = documentOf();
    const active = mountChat({
      doc,
      landing: false,
      composerBox: { left: 120, top: 760, width: 760, height: 120 },
      padBox: { left: 120, top: 700, width: 760, height: 24 },
    });
    appendRow(active.list, doc, {
      role: "user",
      index: 0,
      box: { left: 280, top: 200, width: 560, height: 72 },
    });
    appendRow(active.list, doc, {
      role: "assistant",
      index: 1,
      box: { left: 120, top: 284, width: 760, height: 300 },
    });

    expect(composerFlyTarget("conversation", active.composer)).toEqual({
      x: 844,
      y: 612,
    });
  });

  it("sends new chat upward above the centered composer instead of to the column bottom", () => {
    const doc = documentOf();
    mountChat({
      doc,
      landing: false,
      composerBox: { left: 120, top: 760, width: 760, height: 120 },
      padBox: { left: 120, top: 700, width: 760, height: 24 },
    });
    const landing = mountChat({
      doc,
      landing: true,
      composerBox: { left: 120, top: 360, width: 760, height: 140 },
      padBox: { left: 0, top: 0, width: 0, height: 0 },
    });

    const origin = composerShellOrigin(landing.composer);
    const target = composerFlyTarget("conversation", landing.composer);
    expect(origin).toEqual({ x: 500, y: 430 });
    expect(target).toEqual({ x: 828, y: 48 });
    expect(target!.y).toBeLessThan(origin!.y);
    expect(target!.y).toBeLessThan(120);
  });

  it("queues into this composer's dock, not another tab's queue", () => {
    const doc = documentOf();
    const other = mountChat({
      doc,
      landing: false,
      composerBox: { left: 120, top: 760, width: 760, height: 120 },
      padBox: { left: 120, top: 700, width: 760, height: 24 },
    });
    const active = mountChat({
      doc,
      landing: false,
      composerBox: { left: 120, top: 760, width: 760, height: 120 },
      padBox: { left: 120, top: 700, width: 760, height: 24 },
    });
    stubRect(other.dock, { left: 10, top: 10, width: 200, height: 36 });
    stubRect(active.dock, { left: 200, top: 700, width: 400, height: 40 });

    expect(composerFlyTarget("queue", active.composer)).toEqual({
      x: 288,
      y: 718,
    });
  });

  it("returns null without a composer root", () => {
    expect(composerShellOrigin(null)).toBeNull();
    expect(composerFlyTarget("conversation", null)).toBeNull();
    expect(composerFlyTarget("queue", null)).toBeNull();
  });
});
