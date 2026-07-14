// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { AgentFixPromptSource } from "@/features/agent-fix/types";

mock.module("next-intl", () => ({
  createTranslator: () => (key: string) => key,
  useTranslations: () => (key: string) => key,
}));

mock.module("@workspace/ui", () => ({
  Avatar: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  AvatarFallback: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  AvatarImage: (props: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt="" {...props} />
  ),
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: (props: React.HTMLAttributes<HTMLDivElement>) => <div {...props} />,
  Tabs: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  TabsList: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props}>{children}</div>
  ),
  TabsTrigger: ({
    children,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => (
    <textarea {...props} />
  ),
  cn: (...values: Array<string | false | null | undefined>) =>
    values.filter(Boolean).join(" "),
  getFileIconProps: ({
    className,
  }: {
    className?: string;
    isDir: boolean;
    name: string;
  }) => ({
    alt: "",
    className,
    src: "/icons/file.svg",
  }),
}));

mock.module("motion/react", () => ({
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({
      animate,
      children,
      exit,
      initial,
      transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      animate?: unknown;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    }) => {
      void animate;
      void exit;
      void initial;
      void transition;
      return <div {...props}>{children}</div>;
    },
  },
}));

mock.module("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
}));

mock.module("@pierre/diffs/react", () => ({
  MultiFileDiff: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

mock.module("@/features/diff/lib/diff-view-constants", () => ({
  ATMOS_DIFF_THEME: {},
  buildSharedDiffViewOptions: () => ({}),
  getAtmosDiffThemeType: () => "dark",
}));

mock.module("@/shared/components/markdown/MarkdownRenderer", () => ({
  MarkdownRenderer: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
}));

mock.module("@/features/agent-fix/components/AgentFixButton", () => ({
  AgentFixButton: () => <button type="button">Agent Fix</button>,
}));

const { ReviewCommentThreadView } = await import("../pr-detail-parts");

let root: Root | null = null;

beforeEach(() => {
  installDom();
});

afterEach(async () => {
  if (root) {
    const currentRoot = root;
    root = null;
    await act(async () => {
      currentRoot.unmount();
    });
  }
  cleanupDom();
});

describe("PR review thread Agent Fix action", () => {
  it("renders the Agent Fix action without toggling the comment thread", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ReviewCommentThreadView
          agentFixSource={agentFixSource}
          thread={{
            path: "apps/web/src/example.ts",
            line: 42,
            diffHunk: "@@ -1,2 +1,2 @@\n-old\n+new",
            comments: [
              {
                id: 1,
                body: "Please simplify this branch.",
                user: { login: "reviewer" },
              },
            ],
          }}
        />,
      );
    });

    expect(container.textContent).toContain("apps/web/src/example.ts");
    expect(container.textContent).toContain("Agent Fix");
    expect(container.textContent).not.toContain("Please simplify this branch.");

    const button = getButtonByText(container, "Agent Fix");
    await click(button);

    expect(container.textContent).toContain("Agent Fix");
    expect(container.textContent).not.toContain("Please simplify this branch.");
  });
});

const agentFixSource: AgentFixPromptSource = {
  id: "test-review-thread",
  family: "pr_review",
  context: { contextId: "workspace-1", scope: "workspace" },
  label: "Fix review thread",
  getPrompt: () => "Fix this review thread.",
};

function getButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.getElementsByTagName("button")).find(
    (item) => item.textContent?.trim() === text,
  );
  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new window.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
  });
}

function installDom(): void {
  const browserWindow = new Window({ url: "http://localhost:3030" });
  const win = browserWindow as unknown as Window & typeof globalThis;

  setGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  setGlobal("window", win);
  setGlobal("document", win.document);
  setGlobal("navigator", win.navigator);
  setGlobal("HTMLElement", win.HTMLElement);
  setGlobal("Element", win.Element);
  setGlobal("Node", win.Node);
  setGlobal("Text", win.Text);
  setGlobal("Event", win.Event);
  setGlobal("MouseEvent", win.MouseEvent);
}

function cleanupDom(): void {
  document.body.innerHTML = "";
  deleteGlobal("IS_REACT_ACT_ENVIRONMENT");
  deleteGlobal("window");
  deleteGlobal("document");
  deleteGlobal("navigator");
  deleteGlobal("HTMLElement");
  deleteGlobal("Element");
  deleteGlobal("Node");
  deleteGlobal("Text");
  deleteGlobal("Event");
  deleteGlobal("MouseEvent");
}

function setGlobal(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value,
  });
}

function deleteGlobal(key: string): void {
  Reflect.deleteProperty(globalThis, key);
}
