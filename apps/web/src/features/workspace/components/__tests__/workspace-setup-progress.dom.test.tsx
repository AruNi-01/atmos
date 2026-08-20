// @ts-expect-error bun:test is available at runtime but not in tsconfig types
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Window } from "happy-dom";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

mock.module("@workspace/ui", () => ({
  cn: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" "),
  Button: ({
    children,
    variant = "default",
    size = "default",
    loading,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: string;
    size?: string;
    loading?: boolean;
  }) => (
    <button
      data-variant={variant}
      data-size={size}
      data-loading={loading ? "" : undefined}
      {...props}
    >
      {children}
    </button>
  ),
  Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...props} />,
  toastManager: { add: () => undefined },
}));

const translate = (key: string, values?: Record<string, string | number>) => {
  if (!values) return key;
  return `${key}:${JSON.stringify(values)}`;
};

mock.module("next-intl", () => ({
  useTranslations: () => translate,
  createTranslator: () => translate,
}));

mock.module("@/features/project/store/use-project-store", () => ({
  useProjectStore: (selector: (state: { retryWorkspaceSetup: () => void }) => unknown) =>
    selector({ retryWorkspaceSetup: () => undefined }),
}));

mock.module("@/api/ws-api", () => ({
  wsScriptApi: { trust: async () => undefined },
  wsWorkspaceApi: { confirmTodos: async () => undefined, skipSetupStep: async () => undefined },
}));

mock.module("@/shared/components/markdown/MarkdownRenderer", () => ({
  MarkdownRenderer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

mock.module("react-hotkeys-hook", () => ({
  useHotkeys: () => undefined,
}));

mock.module("motion/react", () => ({
  motion: {
    div: ({
      children,
      className,
    }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) => (
      <div className={className}>{children}</div>
    ),
  },
  useReducedMotion: () => false,
}));

mock.module("@xterm/xterm", () => ({
  Terminal: class {
    loadAddon() {}
    open() {}
    write() {}
    clear() {}
    dispose() {}
  },
}));

mock.module("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

mock.module("@xterm/xterm/css/xterm.css", () => ({}));

mock.module("@/shared/components/ScriptTrustReview", () => ({
  ScriptTrustReview: () => <div data-testid="script-trust-review" />,
}));

const { WorkspaceSetupProgressView } = await import("../WorkspaceSetupProgress");

const setupProgress = {
  workspaceId: "ws-1",
  status: "setting_up" as const,
  stepKey: "run_setup_script" as const,
  stepTitle: "Run setup script",
  output: "$ bun install\nbun install v1.3.14",
  success: false,
  setupContext: {
    hasGithubIssue: false,
    hasGithubPr: false,
    hasRequirementStep: false,
    autoExtractTodos: false,
    hasSetupScript: true,
  },
};

describe("WorkspaceSetupProgressView compact popover", () => {
  let root: Root | null = null;
  let container: HTMLElement;

  beforeEach(() => {
    const window = new Window({ url: "http://localhost/" });
    globalThis.window = window as unknown as typeof globalThis.window;
    globalThis.document = window.document as unknown as Document;
    globalThis.HTMLElement = window.HTMLElement as unknown as typeof HTMLElement;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    container = globalThis.document.createElement("div");
    globalThis.document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
  });

  it("sizes the compact shell to content and keeps a bounded terminal", async () => {
    await act(async () => {
      root?.render(
        <WorkspaceSetupProgressView
          progress={setupProgress}
          onFinish={() => undefined}
          compact
        />,
      );
    });

    const shell = container.firstElementChild as HTMLElement | null;
    expect(shell?.className).toContain("h-auto");
    expect(shell?.className).not.toContain("h-full");
    expect(container.querySelector(".h-52")).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector(".border-primary")).not.toBeNull();
    expect(container.querySelector(".ring-1")).toBeNull();
  });

  it("renders stock button variants without custom scale classes", async () => {
    await act(async () => {
      root?.render(
        <WorkspaceSetupProgressView
          progress={{
            ...setupProgress,
            status: "error",
            failedStepKey: "run_setup_script",
          }}
          onFinish={() => undefined}
          compact
        />,
      );
    });

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.some((button) => button.getAttribute("data-variant") === "outline")).toBe(true);
    expect(buttons.some((button) => button.getAttribute("data-variant") === "destructive")).toBe(true);
    expect(buttons.every((button) => !button.className.includes("hover:scale"))).toBe(true);
    expect(buttons.every((button) => !button.className.includes("shadow-lg"))).toBe(true);
  });
});
