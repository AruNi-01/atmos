// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { AgentMessage, AgentPart } from "@atmos/api-types/ws/dto/agent-chat";
import {
  agentChatInspectExpandKey,
  agentChatProcessExpandKey,
  useAgentChatExpandStore,
} from "@/features/agent/store/agent-chat-expand-store";

let density: "compact" | "standard" | "detailed" = "compact";

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
  Collapsible: ({ open, children }: { open?: boolean; children: React.ReactNode }) => (
    <div data-process-collapsible="" data-open={open ? "true" : "false"}>
      {children}
    </div>
  ),
  CollapsibleTrigger: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
  CollapsibleContent: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

mock.module("lucide-react", () => ({
  ChevronRight: () => <span data-chevron="" />,
  FileText: () => <span />,
}));

mock.module("@/shared/components/markdown/MarkdownRenderer", () => ({
  MarkdownCodeBlock: () => null,
}));

mock.module("@/features/agent/hooks/use-open-agent-chat-path", () => ({
  useOpenAgentChatWorkspacePath: () => () => undefined,
}));

mock.module("@/features/agent/components/agent-chat-cwd-context", () => ({
  useAgentChatCwd: () => "/tmp/project",
  useAgentChatPathRoots: () => [],
}));

mock.module("@/features/agent/components/AgentPartView", () => ({
  AgentPartView: ({ part }: { part: AgentPart }) => (
    <div data-part={part.type}>
      {part.type === "text" || part.type === "thinking"
        ? part.text
        : part.type === "tool_call"
          ? part.tool_call_id
          : part.type}
    </div>
  ),
}));

mock.module("@/features/agent/components/AgentStreamReveal", () => ({
  AgentStreamReveal: ({ children }: { children: React.ReactNode }) => children,
}));

mock.module("@/features/agent/components/AgentToolGroupView", () => ({
  AgentToolGroupView: ({
    parts,
    origIndexes,
    renderPart,
    onUserOpenChange,
  }: {
    parts: AgentPart[];
    origIndexes: number[];
    renderPart: (part: AgentPart, origIndex: number) => React.ReactNode;
    onUserOpenChange?: (next: boolean) => void;
  }) => (
    <button type="button" data-tool-group="" onClick={() => onUserOpenChange?.(true)}>
      {parts.map((part, index) => (
        <React.Fragment key={origIndexes[index]}>
          {renderPart(part, origIndexes[index]!)}
        </React.Fragment>
      ))}
    </button>
  ),
}));

mock.module("@/features/agent/components/AgentChatMarkdownFile", () => ({
  AgentChatMarkdownFileChip: () => null,
  AgentChatMarkdownFileLink: () => null,
}));

mock.module("@/features/agent/components/AgentWorkedForLabel", () => ({
  AgentWorkedForLabel: () => <span data-worked-for="">Worked</span>,
}));

mock.module("@/features/agent/lib/agent-chat-file-links", () => ({
  classifyAgentChatHref: () => ({ kind: "none" }),
  resolveAgentChatWorkspaceFile: () => null,
}));

mock.module("@/shared/lib/link-preview", () => ({
  isCompletePreviewUrl: () => false,
}));

mock.module("@/shared/components/link-preview-chip", () => ({
  ConversationHttpUrl: () => null,
}));

mock.module("@/shared/components/url-aware-text", () => ({
  withLinkifiedMarkdownComponents: (components: unknown) => components,
}));

mock.module("@/features/settings/store/agent-tool-call-density-store", () => {
  const state = {
    get density() {
      return density;
    },
    loadSettings: async () => undefined,
  };
  return {
    useAgentToolCallDensityStore: (select: (value: typeof state) => unknown) => select(state),
  };
});

const { AssistantMessageView } = await import("../AssistantMessageView");

let root: Root | null = null;
let renderErrors: string[] = [];
let originalConsoleError: typeof console.error | null = null;

function toolPart(): AgentPart {
  return {
    type: "tool_call",
    tool_call_id: "t1",
    name: "Read",
    kind: "read",
    status: "completed",
    params: { type: "read", path: "a.ts" },
  };
}

function assistantMessage(over: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "a1",
    role: "assistant",
    parts: [toolPart(), { type: "text", text: "done" }],
    streaming: false,
    completed_at: "2026-01-01T00:00:00Z",
    worked_ms: 1200,
    ...over,
  };
}

describe("assistant process collapse render", () => {
  beforeEach(() => {
    installDom();
    density = "compact";
    renderErrors = [];
    originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      renderErrors.push(args.map(String).join(" "));
      originalConsoleError?.apply(console, args);
    };
    useAgentChatExpandStore.setState({ values: {} });
  });

  afterEach(async () => {
    if (root) {
      const currentRoot = root;
      root = null;
      await act(async () => {
        currentRoot.unmount();
      });
    }
    if (originalConsoleError) {
      console.error = originalConsoleError;
      originalConsoleError = null;
    }
    cleanupDom();
  });

  for (const mode of ["compact", "standard", "detailed"] as const) {
    it(`preserves arrival order through streaming, tool updates, and settle in ${mode}`, async () => {
      density = mode;
      const container = document.createElement("div");
      document.body.appendChild(container);
      root = createRoot(container);
      const parts: AgentPart[] = [
        { type: "text", text: "first update" },
        { type: "thinking", text: "inspect next" },
        toolPart(),
        { type: "text", text: "second update" },
        { ...toolPart(), tool_call_id: "t2", status: "running" },
        { type: "thinking", text: "check result" },
        { type: "text", text: "final update" },
      ];
      const expected = [
        "first update",
        "inspect next",
        "t1",
        "second update",
        "t2",
        "check result",
        "final update",
      ];
      const visibleParts = () =>
        Array.from(container.querySelectorAll("[data-part]"), (node) => node.textContent);
      let firstText: Element | null = null;
      for (let count = 1; count <= parts.length; count += 1) {
        // streaming can go false between text chunks while the turn is still running.
        await act(async () => {
          root?.render(
            <AssistantMessageView
              message={assistantMessage({
                parts: parts.slice(0, count),
                streaming: count % 2 === 1,
                completed_at: null,
              })}
            />,
          );
        });
        expect(visibleParts()).toEqual(expected.slice(0, count));
        expect(container.querySelector("[data-process-collapsible]")).toBeNull();
        firstText ??= container.querySelector("[data-part]");
        expect(container.querySelector("[data-part]")).toBe(firstText);
      }

      const completed = parts.map((part) =>
        part.type === "tool_call" ? { ...part, status: "completed" as const } : part,
      );
      await act(async () => {
        root?.render(
          <AssistantMessageView
            message={assistantMessage({
              parts: completed,
              streaming: false,
              completed_at: null,
            })}
          />,
        );
      });
      expect(visibleParts()).toEqual(expected);
      expect(container.querySelector("[data-part]")).toBe(firstText);

      await act(async () => {
        root?.render(<AssistantMessageView message={assistantMessage({ parts: completed })} />);
      });
      expect(container.querySelector("[data-process-collapsible]")).not.toBeNull();
      expect(visibleParts()).toEqual(expected);
    });
  }

  it("auto-collapses process after settle via layout effect, not during render", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const streaming = assistantMessage({
      streaming: true,
      completed_at: null,
    });
    const sibling = assistantMessage({
      id: "a2",
      parts: [{ type: "text", text: "other" }],
    });

    await act(async () => {
      root?.render(
        <>
          <AssistantMessageView message={streaming} />
          <AssistantMessageView message={sibling} />
        </>,
      );
    });
    expect(container.querySelector("[data-process-collapsible]")).toBeNull();

    await act(async () => {
      root?.render(
        <>
          <AssistantMessageView message={assistantMessage()} />
          <AssistantMessageView message={sibling} />
        </>,
      );
    });

    const collapsible = container.querySelector("[data-process-collapsible]");
    expect(collapsible).not.toBeNull();
    expect(collapsible?.getAttribute("data-open")).toBe("false");
    expect(container.querySelector("[data-worked-for]")).not.toBeNull();
    expect(renderErrors.some((line) => line.includes("Cannot update a component"))).toBe(false);
    expect(useAgentChatExpandStore.getState().values[agentChatProcessExpandKey("a1")]).toBe(false);
  });

  it("keeps process open on settle when tools were expanded during the stream", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AssistantMessageView
          message={assistantMessage({ streaming: true, completed_at: null })}
        />,
      );
    });

    await act(async () => {
      useAgentChatExpandStore.getState().setExpand(agentChatInspectExpandKey("a1"), true);
    });
    expect(useAgentChatExpandStore.getState().values[agentChatInspectExpandKey("a1")]).toBe(true);

    await act(async () => {
      root?.render(<AssistantMessageView message={assistantMessage()} />);
    });

    expect(container.querySelector("[data-process-collapsible]")?.getAttribute("data-open")).toBe(
      "true",
    );
  });

  it("does not reopen a collapsed process panel after a virtual-row remount", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <AssistantMessageView
          message={assistantMessage({ streaming: true, completed_at: null })}
        />,
      );
    });
    await act(async () => {
      useAgentChatExpandStore.getState().setExpand(agentChatInspectExpandKey("a1"), true);
    });
    await act(async () => {
      root?.render(<AssistantMessageView message={assistantMessage()} />);
    });
    expect(container.querySelector("[data-process-collapsible]")?.getAttribute("data-open")).toBe(
      "true",
    );

    await act(async () => {
      useAgentChatExpandStore.getState().setExpand(agentChatProcessExpandKey("a1"), false);
    });
    expect(container.querySelector("[data-process-collapsible]")?.getAttribute("data-open")).toBe(
      "false",
    );

    await act(async () => {
      root?.render(<div />);
    });
    await act(async () => {
      root?.render(<AssistantMessageView message={assistantMessage()} />);
    });
    expect(container.querySelector("[data-process-collapsible]")?.getAttribute("data-open")).toBe(
      "false",
    );
    expect(useAgentChatExpandStore.getState().values[agentChatProcessExpandKey("a1")]).toBe(false);
  });
});

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;
  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
}

function cleanupDom(): void {
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Text",
    "Event",
    "MouseEvent",
    "IS_REACT_ACT_ENVIRONMENT",
  ]) {
    Reflect.deleteProperty(globalThis, key);
  }
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value,
  });
}
